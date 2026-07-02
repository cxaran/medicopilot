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
from sqlmodel import select

from backend.app.api.resource_actions import (
    create_entity,
    get_active_or_404,
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
    return serialize(PatientImmunizationRead, get_active_or_404(session, PatientImmunization, item_id, _NOT_FOUND))


@router.post(
    "", response_model=PatientImmunizationRead, status_code=status.HTTP_201_CREATED
)
def create_patient_immunization(
    payload: PatientImmunizationCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientImmunizationPermissions.CREATE.requiere,
) -> PatientImmunizationRead:
    get_active_or_404(session, Patient, payload.patient_id, _PATIENT_NOT_FOUND)
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
    item = get_active_or_404(session, PatientImmunization, item_id, _NOT_FOUND)
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
    item = get_active_or_404(session, PatientImmunization, item_id, _NOT_FOUND)
    item = soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message="La inmunización ya fue eliminada",
    )
    return serialize(PatientImmunizationRead, item)
