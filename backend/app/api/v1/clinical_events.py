"""Eventos clínicos de la línea de tiempo del paciente.

CRUD bajo permisos ``clinical_events:*``. Un evento pertenece al paciente y es
editable mientras no se elimine; la baja es lógica (``deleted_at``/``deleted_by``).
Los listados excluyen los eventos eliminados. Registrar o editar un evento es una
ESCRITURA clínica: en el copiloto pasa por el protocolo de aprobación P1.
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
from backend.app.models.clinical_event import ClinicalEvent
from backend.app.models.patient import Patient
from backend.app.resources.registry import CLINICAL_EVENTS
from backend.app.schemas.clinical_event import (
    ClinicalEventCreate,
    ClinicalEventListItem,
    ClinicalEventRead,
    ClinicalEventUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.clinical_events import ClinicalEventPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/clinical-events", tags=["clinical-events"])

_NOT_FOUND = "Evento clínico no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar el evento clínico"


def _get_active_event(session: Session, event_id: UUID) -> ClinicalEvent:
    """Obtiene un evento no eliminado; uno con baja lógica responde 404."""
    event = get_or_404(session, ClinicalEvent, event_id, _NOT_FOUND)
    if event.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return event


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    """El evento requiere un paciente vigente; ausente o eliminado -> 404."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


@router.get("", response_model=OffsetPage[ClinicalEventListItem])
def list_clinical_events(
    session: SessionDep,
    query: Annotated[CLINICAL_EVENTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ClinicalEventPermissions.READ.requiere,
) -> OffsetPage[ClinicalEventListItem]:
    # Scope base: solo eventos vigentes. El caso principal se resuelve con ?patient_id=<id>
    # + rango de started_at para la línea de tiempo.
    stmt = select(ClinicalEvent).where(ClinicalEvent.deleted_at.is_(None))
    return paginate_resource(CLINICAL_EVENTS, session, query, stmt=stmt)


@router.get("/{event_id}", response_model=ClinicalEventRead)
def get_clinical_event(
    event_id: UUID,
    session: SessionDep,
    _: ClinicalEventPermissions.READ.requiere,
) -> ClinicalEventRead:
    return serialize(ClinicalEventRead, _get_active_event(session, event_id))


@router.post("", response_model=ClinicalEventRead, status_code=status.HTTP_201_CREATED)
def create_clinical_event(
    payload: ClinicalEventCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalEventPermissions.CREATE.requiere,
) -> ClinicalEventRead:
    _ensure_active_patient(session, payload.patient_id)
    event = create_entity(
        session,
        ClinicalEvent,
        payload,
        values={
            "started_at": payload.started_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalEventRead, event)


@router.patch("/{event_id}", response_model=ClinicalEventRead)
def update_clinical_event(
    event_id: UUID,
    payload: ClinicalEventUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalEventPermissions.UPDATE.requiere,
) -> ClinicalEventRead:
    event = _get_active_event(session, event_id)
    event = patch_entity(
        session,
        event,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalEventRead, event)


@router.delete("/{event_id}", response_model=ClinicalEventRead)
def delete_clinical_event(
    event_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalEventPermissions.DELETE.requiere,
) -> ClinicalEventRead:
    event = _get_active_event(session, event_id)
    event = soft_delete_entity(
        session,
        event,
        actor_id=current_user.id,
        already_deleted_message="El evento clínico ya fue eliminado",
    )
    return serialize(ClinicalEventRead, event)
