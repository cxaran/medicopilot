"""Antecedentes clínicos estructurados del paciente (historia): CRUD bajo
``patient_history_items:*``.

Representa antecedentes FAMILIARES, QUIRÚRGICOS, OBSTÉTRICOS y personales PATOLÓGICOS/NO
PATOLÓGICOS como registros tipados y consultables (a diferencia de ``patient_clinical_items``,
que captura problemas ACTIVOS del resumen). La baja es lógica (``deleted_at``/``deleted_by``);
los listados excluyen los antecedentes eliminados y se consultan por paciente.

El copiloto crea antecedentes como BORRADOR que el médico aprueba (P1): la tool de alta es una
acción de escritura gateada por aprobación; nada se guarda de forma autónoma.
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
from backend.app.models.patient import Patient
from backend.app.models.patient_history_item import PatientHistoryItem
from backend.app.resources.registry import PATIENT_HISTORY_ITEMS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.patient_history_item import (
    PatientHistoryItemCreate,
    PatientHistoryItemListItem,
    PatientHistoryItemRead,
    PatientHistoryItemUpdate,
)
from backend.app.security.groups.patient_history_items import (
    PatientHistoryItemPermissions,
)

router = APIRouter(prefix="/patient-history-items", tags=["patient-history-items"])

_NOT_FOUND = "Antecedente no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar el antecedente"


def _get_active_item(session: Session, item_id: UUID) -> PatientHistoryItem:
    """Obtiene un antecedente no eliminado; uno con baja lógica responde 404."""
    item = get_or_404(session, PatientHistoryItem, item_id, _NOT_FOUND)
    if item.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return item


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    """El antecedente requiere un paciente vigente; ausente o eliminado -> 404."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


@router.get("", response_model=OffsetPage[PatientHistoryItemListItem])
def list_patient_history_items(
    session: SessionDep,
    query: Annotated[PATIENT_HISTORY_ITEMS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PatientHistoryItemPermissions.READ.requiere,
) -> OffsetPage[PatientHistoryItemListItem]:
    # Scope base: solo antecedentes vigentes (excluye los eliminados lógicamente). La historia
    # se consulta por paciente con el filtro exacto ``patient_id`` (y opcionalmente ``category``).
    stmt = select(PatientHistoryItem).where(PatientHistoryItem.deleted_at.is_(None))
    return paginate_resource(PATIENT_HISTORY_ITEMS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=PatientHistoryItemRead)
def get_patient_history_item(
    item_id: UUID,
    session: SessionDep,
    _: PatientHistoryItemPermissions.READ.requiere,
) -> PatientHistoryItemRead:
    return serialize(PatientHistoryItemRead, _get_active_item(session, item_id))


@router.post(
    "", response_model=PatientHistoryItemRead, status_code=status.HTTP_201_CREATED
)
def create_patient_history_item(
    payload: PatientHistoryItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientHistoryItemPermissions.CREATE.requiere,
) -> PatientHistoryItemRead:
    _ensure_active_patient(session, payload.patient_id)
    item = create_entity(
        session,
        PatientHistoryItem,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(PatientHistoryItemRead, item)


@router.patch("/{item_id}", response_model=PatientHistoryItemRead)
def update_patient_history_item(
    item_id: UUID,
    payload: PatientHistoryItemUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientHistoryItemPermissions.UPDATE.requiere,
) -> PatientHistoryItemRead:
    item = _get_active_item(session, item_id)
    item = patch_entity(
        session,
        item,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PatientHistoryItemRead, item)


@router.delete("/{item_id}", response_model=PatientHistoryItemRead)
def delete_patient_history_item(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientHistoryItemPermissions.DELETE.requiere,
) -> PatientHistoryItemRead:
    item = _get_active_item(session, item_id)
    item = soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message="El antecedente ya fue eliminado",
    )
    return serialize(PatientHistoryItemRead, item)
