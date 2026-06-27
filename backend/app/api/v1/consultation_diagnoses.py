"""Diagnósticos estructurados de una consulta médica.

Subrecurso de la consulta: una consulta puede tener cero, uno o varios
diagnósticos (principal, secundario o presuntivo). La consulta padre gobierna la
mutabilidad y, al finalizarse, sella sus diagnósticos (sólo lectura). No hay
endpoint de finalización propio.

Concurrencia: toda mutación toma la fila de la consulta padre con
``SELECT ... FOR UPDATE`` antes de comprobar ``draft``, serializándose sobre la
misma fila que ``consultations.finalize`` para evitar la carrera entre registrar
un diagnóstico y finalizar la consulta. Las lecturas no toman bloqueo.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.enums import ConsultationStatus
from backend.app.resources.registry import CONSULTATION_DIAGNOSES
from backend.app.schemas.consultation_diagnosis import (
    ConsultationDiagnosisCreate,
    ConsultationDiagnosisListItem,
    ConsultationDiagnosisRead,
    ConsultationDiagnosisUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.consultation_diagnoses import (
    ConsultationDiagnosisPermissions,
)

router = APIRouter(prefix="/consultation-diagnoses", tags=["consultation-diagnoses"])

_NOT_FOUND = "Diagnóstico no encontrado"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar el diagnóstico"
_SEALED = "La consulta está finalizada: los diagnósticos quedaron sellados"


def _lock_consultation(session: Session, consultation_id: UUID) -> Consultation | None:
    """Carga la consulta tomando su fila con FOR UPDATE (serializa con finalize)."""
    return session.exec(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    ).first()


def _get_writable_consultation(session: Session, consultation_id: UUID) -> Consultation:
    """Consulta destino de una creación: bloqueada, existente, no eliminada ni finalizada."""
    consultation = _lock_consultation(session, consultation_id)
    if consultation is None or consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)
    return consultation


def _load_active_diagnosis(
    session: Session, diagnosis_id: UUID, *, lock_parent: bool = False
) -> tuple[ConsultationDiagnosis, Consultation]:
    """Carga un diagnóstico disponible: ni él ni su consulta padre eliminados (-> 404).

    ``lock_parent`` toma la fila de la consulta con FOR UPDATE: las mutaciones lo
    activan para verificar ``draft`` bajo bloqueo; las lecturas no."""
    diagnosis = get_or_404(session, ConsultationDiagnosis, diagnosis_id, _NOT_FOUND)
    if diagnosis.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    if lock_parent:
        consultation = _lock_consultation(session, diagnosis.consultation_id)
    else:
        consultation = get_or_404(
            session, Consultation, diagnosis.consultation_id, _NOT_FOUND
        )
    if consultation is None or consultation.deleted_at is not None:
        # La consulta padre eliminada hace que sus diagnósticos no estén disponibles.
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return diagnosis, consultation


def _require_editable_parent(consultation: Consultation) -> None:
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)


@router.get("", response_model=OffsetPage[ConsultationDiagnosisListItem])
def list_consultation_diagnoses(
    session: SessionDep,
    query: Annotated[CONSULTATION_DIAGNOSES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ConsultationDiagnosisPermissions.READ.requiere,
) -> OffsetPage[ConsultationDiagnosisListItem]:
    # Scope base: diagnósticos no eliminados cuya consulta padre tampoco lo esté. El
    # caso principal se resuelve con ?consultation_id=<id>.
    stmt = (
        select(ConsultationDiagnosis)
        .join(Consultation, Consultation.id == ConsultationDiagnosis.consultation_id)
        .where(
            ConsultationDiagnosis.deleted_at.is_(None),
            Consultation.deleted_at.is_(None),
        )
    )
    return paginate_resource(CONSULTATION_DIAGNOSES, session, query, stmt=stmt)


@router.get("/{diagnosis_id}", response_model=ConsultationDiagnosisRead)
def get_consultation_diagnosis(
    diagnosis_id: UUID,
    session: SessionDep,
    _: ConsultationDiagnosisPermissions.READ.requiere,
) -> ConsultationDiagnosisRead:
    diagnosis, _consultation = _load_active_diagnosis(session, diagnosis_id)
    return serialize(ConsultationDiagnosisRead, diagnosis)


@router.post(
    "", response_model=ConsultationDiagnosisRead, status_code=status.HTTP_201_CREATED
)
def create_consultation_diagnosis(
    payload: ConsultationDiagnosisCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationDiagnosisPermissions.CREATE.requiere,
) -> ConsultationDiagnosisRead:
    _get_writable_consultation(session, payload.consultation_id)
    diagnosis = create_entity(
        session,
        ConsultationDiagnosis,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(ConsultationDiagnosisRead, diagnosis)


@router.patch("/{diagnosis_id}", response_model=ConsultationDiagnosisRead)
def update_consultation_diagnosis(
    diagnosis_id: UUID,
    payload: ConsultationDiagnosisUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationDiagnosisPermissions.UPDATE.requiere,
) -> ConsultationDiagnosisRead:
    diagnosis, consultation = _load_active_diagnosis(
        session, diagnosis_id, lock_parent=True
    )
    _require_editable_parent(consultation)
    diagnosis = patch_entity(
        session,
        diagnosis,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ConsultationDiagnosisRead, diagnosis)


@router.delete("/{diagnosis_id}", response_model=ConsultationDiagnosisRead)
def delete_consultation_diagnosis(
    diagnosis_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationDiagnosisPermissions.DELETE.requiere,
) -> ConsultationDiagnosisRead:
    diagnosis, consultation = _load_active_diagnosis(
        session, diagnosis_id, lock_parent=True
    )
    _require_editable_parent(consultation)
    diagnosis = soft_delete_entity(
        session,
        diagnosis,
        actor_id=current_user.id,
        already_deleted_message="El diagnóstico ya fue eliminado",
    )
    return serialize(ConsultationDiagnosisRead, diagnosis)
