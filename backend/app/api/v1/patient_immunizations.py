"""Inmunizaciones del paciente (esquema de vacunación): CRUD bajo ``patient_immunizations:*``.

Registra las vacunas aplicadas como registros tipados y consultables. La baja es lógica
(``deleted_at``/``deleted_by``); los listados excluyen las inmunizaciones eliminadas y se
consultan por paciente. NO infiere qué vacunas 'tocan' ni arma un esquema: sólo guarda lo que el
médico registró.

El copiloto crea inmunizaciones como BORRADOR que el médico aprueba (P1): la tool de alta es una
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
from backend.app.models.patient_immunization import PatientImmunization
from backend.app.resources.registry import PATIENT_IMMUNIZATIONS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.patient_immunization import (
    PatientImmunizationCreate,
    PatientImmunizationListItem,
    PatientImmunizationRead,
    PatientImmunizationUpdate,
)
from backend.app.security.groups.patient_immunizations import (
    PatientImmunizationPermissions,
)

router = APIRouter(prefix="/patient-immunizations", tags=["patient-immunizations"])

_NOT_FOUND = "Inmunización no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar la inmunización"


def _get_active_item(session: Session, item_id: UUID) -> PatientImmunization:
    """Obtiene una inmunización no eliminada; una con baja lógica responde 404."""
    item = get_or_404(session, PatientImmunization, item_id, _NOT_FOUND)
    if item.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return item


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    """La inmunización requiere un paciente vigente; ausente o eliminado -> 404."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


@router.get("", response_model=OffsetPage[PatientImmunizationListItem])
def list_patient_immunizations(
    session: SessionDep,
    query: Annotated[PATIENT_IMMUNIZATIONS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PatientImmunizationPermissions.READ.requiere,
) -> OffsetPage[PatientImmunizationListItem]:
    # Scope base: solo inmunizaciones vigentes (excluye las eliminadas lógicamente). El esquema
    # se consulta por paciente con el filtro exacto ``patient_id`` (y opcionalmente ``status``).
    stmt = select(PatientImmunization).where(PatientImmunization.deleted_at.is_(None))
    return paginate_resource(PATIENT_IMMUNIZATIONS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=PatientImmunizationRead)
def get_patient_immunization(
    item_id: UUID,
    session: SessionDep,
    _: PatientImmunizationPermissions.READ.requiere,
) -> PatientImmunizationRead:
    return serialize(PatientImmunizationRead, _get_active_item(session, item_id))


@router.post(
    "", response_model=PatientImmunizationRead, status_code=status.HTTP_201_CREATED
)
def create_patient_immunization(
    payload: PatientImmunizationCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientImmunizationPermissions.CREATE.requiere,
) -> PatientImmunizationRead:
    _ensure_active_patient(session, payload.patient_id)
    item = create_entity(
        session,
        PatientImmunization,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(PatientImmunizationRead, item)


@router.patch("/{item_id}", response_model=PatientImmunizationRead)
def update_patient_immunization(
    item_id: UUID,
    payload: PatientImmunizationUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientImmunizationPermissions.UPDATE.requiere,
) -> PatientImmunizationRead:
    item = _get_active_item(session, item_id)
    item = patch_entity(
        session,
        item,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PatientImmunizationRead, item)


@router.delete("/{item_id}", response_model=PatientImmunizationRead)
def delete_patient_immunization(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientImmunizationPermissions.DELETE.requiere,
) -> PatientImmunizationRead:
    item = _get_active_item(session, item_id)
    item = soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message="La inmunización ya fue eliminada",
    )
    return serialize(PatientImmunizationRead, item)
