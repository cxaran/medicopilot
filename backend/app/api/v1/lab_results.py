"""Resultados de laboratorio/observaciones estructurados del paciente.

CRUD bajo permisos ``lab_results:*``. A diferencia de los signos vitales (sellados
por el estado de la consulta), un resultado pertenece al paciente y es editable
mientras no se elimine; la consulta y el documento de origen son enlaces
opcionales. La baja es lógica (``deleted_at``/``deleted_by``), no física. Los
listados excluyen los resultados eliminados.

Registrar o editar un resultado es una ESCRITURA clínica: en el copiloto pasa por
el protocolo de aprobación P1 (el médico aprueba el payload exacto).
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
from backend.app.models.lab_result import LabResult
from backend.app.models.patient import Patient
from backend.app.resources.registry import LAB_RESULTS
from backend.app.schemas.lab_result import (
    LabResultCreate,
    LabResultListItem,
    LabResultRead,
    LabResultUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.lab_results import LabResultPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/lab-results", tags=["lab-results"])

_NOT_FOUND = "Resultado de laboratorio no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar el resultado de laboratorio"


def _get_active_result(session: Session, result_id: UUID) -> LabResult:
    """Obtiene un resultado no eliminado; uno con baja lógica responde 404."""
    result = get_or_404(session, LabResult, result_id, _NOT_FOUND)
    if result.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return result


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    """El resultado requiere un paciente vigente; ausente o eliminado -> 404."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


def _ensure_active_consultation(session: Session, consultation_id: UUID) -> None:
    """Si se enlaza una consulta, debe existir y no estar eliminada."""
    consultation = get_or_404(
        session, Consultation, consultation_id, _CONSULTATION_NOT_FOUND
    )
    if consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )


@router.get("", response_model=OffsetPage[LabResultListItem])
def list_lab_results(
    session: SessionDep,
    query: Annotated[LAB_RESULTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: LabResultPermissions.READ.requiere,
) -> OffsetPage[LabResultListItem]:
    # Scope base: solo resultados vigentes (excluye los eliminados lógicamente). El
    # caso principal se resuelve con ?patient_id=<id> + rango de measured_at.
    stmt = select(LabResult).where(LabResult.deleted_at.is_(None))
    return paginate_resource(LAB_RESULTS, session, query, stmt=stmt)


@router.get("/{result_id}", response_model=LabResultRead)
def get_lab_result(
    result_id: UUID,
    session: SessionDep,
    _: LabResultPermissions.READ.requiere,
) -> LabResultRead:
    return serialize(LabResultRead, _get_active_result(session, result_id))


@router.post("", response_model=LabResultRead, status_code=status.HTTP_201_CREATED)
def create_lab_result(
    payload: LabResultCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: LabResultPermissions.CREATE.requiere,
) -> LabResultRead:
    _ensure_active_patient(session, payload.patient_id)
    if payload.consultation_id is not None:
        _ensure_active_consultation(session, payload.consultation_id)
    result = create_entity(
        session,
        LabResult,
        payload,
        values={
            "measured_at": payload.measured_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(LabResultRead, result)


@router.patch("/{result_id}", response_model=LabResultRead)
def update_lab_result(
    result_id: UUID,
    payload: LabResultUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: LabResultPermissions.UPDATE.requiere,
) -> LabResultRead:
    result = _get_active_result(session, result_id)
    if payload.consultation_id is not None:
        _ensure_active_consultation(session, payload.consultation_id)
    result = patch_entity(
        session,
        result,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(LabResultRead, result)


@router.delete("/{result_id}", response_model=LabResultRead)
def delete_lab_result(
    result_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: LabResultPermissions.DELETE.requiere,
) -> LabResultRead:
    result = _get_active_result(session, result_id)
    result = soft_delete_entity(
        session,
        result,
        actor_id=current_user.id,
        already_deleted_message="El resultado de laboratorio ya fue eliminado",
    )
    return serialize(LabResultRead, result)
