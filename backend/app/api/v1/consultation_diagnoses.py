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
    create_entity,
    get_active_or_404,
    lock_active_or_404,
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


def _load_active_diagnosis(
    session: Session, diagnosis_id: UUID, *, lock_parent: bool = False
) -> ConsultationDiagnosis:
    """Carga un diagnóstico disponible: ni él ni su consulta padre eliminados (-> 404).

    ``lock_parent`` (mutaciones) toma la fila de la consulta con FOR UPDATE —serializa
    con ``consultations.finalize``— y exige que siga en ``draft`` (409 si está sellada);
    las lecturas no bloquean ni exigen estado."""
    diagnosis = get_active_or_404(session, ConsultationDiagnosis, diagnosis_id, _NOT_FOUND)
    if lock_parent:
        lock_active_or_404(
            session, Consultation, diagnosis.consultation_id, _NOT_FOUND,
            allowed_status=(ConsultationStatus.DRAFT,), status_message=_SEALED,
        )
    else:
        # La consulta padre eliminada hace que sus diagnósticos no estén disponibles.
        get_active_or_404(session, Consultation, diagnosis.consultation_id, _NOT_FOUND)
    return diagnosis


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
    diagnosis = _load_active_diagnosis(session, diagnosis_id)
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
    # Consulta destino: bloqueada (serializa con finalize), vigente y aún en borrador.
    lock_active_or_404(
        session, Consultation, payload.consultation_id, _CONSULTATION_NOT_FOUND,
        allowed_status=(ConsultationStatus.DRAFT,), status_message=_SEALED,
    )
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
    diagnosis = _load_active_diagnosis(session, diagnosis_id, lock_parent=True)
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
    diagnosis = _load_active_diagnosis(session, diagnosis_id, lock_parent=True)
    diagnosis = soft_delete_entity(
        session,
        diagnosis,
        actor_id=current_user.id,
        already_deleted_message="El diagnóstico ya fue eliminado",
    )
    return serialize(ConsultationDiagnosisRead, diagnosis)
