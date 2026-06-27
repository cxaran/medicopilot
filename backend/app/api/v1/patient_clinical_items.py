"""Administración de los datos clínicos importantes del resumen del paciente.

CRUD bajo permisos de administración (``patient_clinical_items:*``). Representa
alergias, enfermedades crónicas, medicamentos actuales, hábitos relevantes y
alertas clínicas. La baja es lógica (``deleted_at``/``deleted_by``), no física; el
``status`` clínico (``active``/``inactive``/``resolved``/``suspended``) se gestiona
por PATCH y es independiente de la eliminación. Los listados excluyen los datos
eliminados; los estados inactive/resolved/suspended siguen siendo legibles.
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
from backend.app.models.patient_clinical_item import PatientClinicalItem
from backend.app.resources.registry import PATIENT_CLINICAL_ITEMS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.patient_clinical_item import (
    PatientClinicalItemCreate,
    PatientClinicalItemListItem,
    PatientClinicalItemRead,
    PatientClinicalItemUpdate,
)
from backend.app.security.groups.patient_clinical_items import (
    PatientClinicalItemPermissions,
)

router = APIRouter(prefix="/patient-clinical-items", tags=["patient-clinical-items"])

_NOT_FOUND = "Dato clínico no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar el dato clínico"


def _get_active_item(session: Session, item_id: UUID) -> PatientClinicalItem:
    """Obtiene un dato clínico no eliminado; uno con baja lógica responde 404."""
    item = get_or_404(session, PatientClinicalItem, item_id, _NOT_FOUND)
    if item.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return item


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    """El dato clínico requiere un paciente vigente; ausente o eliminado -> 404."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


@router.get("", response_model=OffsetPage[PatientClinicalItemListItem])
def list_patient_clinical_items(
    session: SessionDep,
    query: Annotated[PATIENT_CLINICAL_ITEMS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PatientClinicalItemPermissions.READ.requiere,
) -> OffsetPage[PatientClinicalItemListItem]:
    # Scope base: solo datos vigentes (excluye los eliminados lógicamente). El
    # resumen se consulta por paciente con el filtro exacto ``patient_id``.
    stmt = select(PatientClinicalItem).where(PatientClinicalItem.deleted_at.is_(None))
    return paginate_resource(PATIENT_CLINICAL_ITEMS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=PatientClinicalItemRead)
def get_patient_clinical_item(
    item_id: UUID,
    session: SessionDep,
    _: PatientClinicalItemPermissions.READ.requiere,
) -> PatientClinicalItemRead:
    return serialize(PatientClinicalItemRead, _get_active_item(session, item_id))


@router.post(
    "", response_model=PatientClinicalItemRead, status_code=status.HTTP_201_CREATED
)
def create_patient_clinical_item(
    payload: PatientClinicalItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientClinicalItemPermissions.CREATE.requiere,
) -> PatientClinicalItemRead:
    _ensure_active_patient(session, payload.patient_id)
    item = create_entity(
        session,
        PatientClinicalItem,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(PatientClinicalItemRead, item)


@router.patch("/{item_id}", response_model=PatientClinicalItemRead)
def update_patient_clinical_item(
    item_id: UUID,
    payload: PatientClinicalItemUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientClinicalItemPermissions.UPDATE.requiere,
) -> PatientClinicalItemRead:
    item = _get_active_item(session, item_id)
    item = patch_entity(
        session,
        item,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PatientClinicalItemRead, item)


@router.delete("/{item_id}", response_model=PatientClinicalItemRead)
def delete_patient_clinical_item(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientClinicalItemPermissions.DELETE.requiere,
) -> PatientClinicalItemRead:
    item = _get_active_item(session, item_id)
    item = soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message="El dato clínico ya fue eliminado",
    )
    return serialize(PatientClinicalItemRead, item)
