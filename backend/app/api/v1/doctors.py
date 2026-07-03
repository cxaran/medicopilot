"""Administración de perfiles médicos (doctores).

CRUD bajo permisos de administración (``doctors:*``). La baja es lógica
(``deleted_at``/``deleted_by``, convención del dominio clínico), no física, y los
listados excluyen los perfiles eliminados.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
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
from backend.app.models.doctor import Doctor
from backend.app.resources.registry import DOCTORS
from backend.app.schemas.doctor import (
    DoctorCreate,
    DoctorListItem,
    DoctorRead,
    DoctorUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.doctors import DoctorPermissions

router = APIRouter(prefix="/doctors", tags=["doctors"])

_NOT_FOUND = "Médico no encontrado"
_CONFLICT = "Ya existe un médico con esa cédula profesional o ese usuario"


@router.get("", response_model=OffsetPage[DoctorListItem])
def list_doctors(
    session: SessionDep,
    query: Annotated[DOCTORS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: DoctorPermissions.READ.requiere,
) -> OffsetPage[DoctorListItem]:
    # Scope base: solo perfiles vigentes (excluye los eliminados lógicamente).
    stmt = select(Doctor).where(Doctor.deleted_at.is_(None))
    return paginate_resource(DOCTORS, session, query, stmt=stmt)


@router.get("/me", response_model=DoctorRead)
def get_my_doctor(
    session: SessionDep,
    current_user: CurrentUser,
) -> DoctorRead:
    """Perfil de médico del usuario AUTENTICADO (o 404 si no tiene).

    SIN permiso de recurso: es el perfil PROPIO del usuario (no un dato de otro médico). Lo consume
    el copiloto para anclar el contexto inicial (quién atiende) y firmar los borradores. Definido
    antes de ``/{doctor_id}`` para que 'me' no se interprete como UUID.
    """
    doctor = (
        session.execute(
            select(Doctor).where(
                Doctor.user_id == current_user.id,
                Doctor.deleted_at.is_(None),
            )
        )
        .scalars()
        .first()
    )
    if doctor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return serialize(DoctorRead, doctor)


@router.get("/{doctor_id}", response_model=DoctorRead)
def get_doctor(
    doctor_id: UUID,
    session: SessionDep,
    _: DoctorPermissions.READ.requiere,
) -> DoctorRead:
    return serialize(DoctorRead, get_active_or_404(session, Doctor, doctor_id, _NOT_FOUND))


@router.post("", response_model=DoctorRead, status_code=status.HTTP_201_CREATED)
def create_doctor(
    payload: DoctorCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: DoctorPermissions.CREATE.requiere,
) -> DoctorRead:
    doctor = create_entity(
        session,
        Doctor,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(DoctorRead, doctor)


@router.patch("/{doctor_id}", response_model=DoctorRead)
def update_doctor(
    doctor_id: UUID,
    payload: DoctorUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: DoctorPermissions.UPDATE.requiere,
) -> DoctorRead:
    doctor = get_active_or_404(session, Doctor, doctor_id, _NOT_FOUND)
    doctor = patch_entity(
        session,
        doctor,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(DoctorRead, doctor)


@router.delete("/{doctor_id}", response_model=DoctorRead)
def delete_doctor(
    doctor_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: DoctorPermissions.DELETE.requiere,
) -> DoctorRead:
    doctor = get_active_or_404(session, Doctor, doctor_id, _NOT_FOUND)
    doctor = soft_delete_entity(
        session,
        doctor,
        actor_id=current_user.id,
        already_deleted_message="El médico ya fue eliminado",
    )
    return serialize(DoctorRead, doctor)
