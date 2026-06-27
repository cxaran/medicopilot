"""Administración del expediente administrativo de pacientes.

CRUD bajo permisos de administración (``patients:*``). La baja es lógica
(``deleted_at``/``deleted_by``), no física; el estado funcional del paciente
(``active``/``inactive``/``archived``) se gestiona por ``status`` vía PATCH y es
independiente de la eliminación. Los listados excluyen los expedientes eliminados.
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
from backend.app.resources.registry import PATIENTS
from backend.app.schemas.patient import (
    PatientCreate,
    PatientListItem,
    PatientRead,
    PatientUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.patients import PatientPermissions

router = APIRouter(prefix="/patients", tags=["patients"])

_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "Ya existe un paciente con ese número de expediente o esa CURP"


def _get_active_patient(session: Session, patient_id: UUID) -> Patient:
    """Obtiene un paciente no eliminado; un expediente con baja lógica responde 404."""
    patient = get_or_404(session, Patient, patient_id, _NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return patient


@router.get("", response_model=OffsetPage[PatientListItem])
def list_patients(
    session: SessionDep,
    query: Annotated[PATIENTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PatientPermissions.READ.requiere,
) -> OffsetPage[PatientListItem]:
    # Scope base: solo expedientes vigentes (excluye los eliminados lógicamente).
    # Los estados inactive/archived NO se ocultan: se filtran explícitamente por ``status``.
    stmt = select(Patient).where(Patient.deleted_at.is_(None))
    return paginate_resource(PATIENTS, session, query, stmt=stmt)


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    session: SessionDep,
    _: PatientPermissions.READ.requiere,
) -> PatientRead:
    return serialize(PatientRead, _get_active_patient(session, patient_id))


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.CREATE.requiere,
) -> PatientRead:
    # ``record_number`` no viene en el payload: lo genera la base de datos (identity).
    patient = create_entity(
        session,
        Patient,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(PatientRead, patient)


@router.patch("/{patient_id}", response_model=PatientRead)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.UPDATE.requiere,
) -> PatientRead:
    patient = _get_active_patient(session, patient_id)
    patient = patch_entity(
        session,
        patient,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PatientRead, patient)


@router.delete("/{patient_id}", response_model=PatientRead)
def delete_patient(
    patient_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.DELETE.requiere,
) -> PatientRead:
    patient = _get_active_patient(session, patient_id)
    patient = soft_delete_entity(
        session,
        patient,
        actor_id=current_user.id,
        already_deleted_message="El paciente ya fue eliminado",
    )
    return serialize(PatientRead, patient)
