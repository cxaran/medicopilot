"""Agenda y citas médicas.

Una cita nace en ``pending`` y avanza sólo por acciones explícitas: confirmar,
cancelar, marcar inasistencia o reprogramar. Se vuelve ``attended`` únicamente al
crear una consulta ligada (ver ``consultations`` + ``appointment_id``); no hay
endpoint ``attend`` propio. El estado nunca se envía ni se edita por PATCH.

Agenda sin traslapes: dos citas activas (``pending``/``confirmed``, no eliminadas)
del mismo médico no pueden solaparse; lo garantiza una restricción de exclusión
GiST en la base de datos, que la aplicación traduce a 409. Las mutaciones bloquean
la fila de la cita con ``SELECT ... FOR UPDATE`` para serializar transiciones
concurrentes (p. ej. atender vs cancelar/reprogramar).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    create_entity,
    get_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
    touch_entity,
    update_entity_values,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.appointment import Appointment
from backend.app.models.doctor import Doctor
from backend.app.models.enums import AppointmentStatus, PatientStatus, RecordStatus
from backend.app.models.patient import Patient
from backend.app.resources.registry import APPOINTMENTS
from backend.app.schemas.appointment import (
    AppointmentCancel,
    AppointmentConfirm,
    AppointmentCreate,
    AppointmentListItem,
    AppointmentNoShow,
    AppointmentRead,
    AppointmentReschedule,
    AppointmentUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.appointments import AppointmentPermissions

router = APIRouter(prefix="/appointments", tags=["appointments"])

_NOT_FOUND = "Cita no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_DOCTOR_NOT_FOUND = "Médico no encontrado"
_CONFLICT = "No se pudo guardar la cita"
_OVERLAP = "El horario se traslapa con otra cita activa del médico"

# Estados que aún ocupan agenda y admiten edición / transiciones.
_ACTIVE = (AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)


def _lock_appointment(session: Session, appointment_id: UUID) -> Appointment | None:
    """Toma la fila de la cita con FOR UPDATE (serializa transiciones concurrentes)."""
    return session.exec(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    ).first()


def _get_active_appointment(session: Session, appointment_id: UUID) -> Appointment:
    """Cita no eliminada; una con baja lógica responde 404."""
    appointment = get_or_404(session, Appointment, appointment_id, _NOT_FOUND)
    if appointment.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return appointment


def _lock_active_appointment(session: Session, appointment_id: UUID) -> Appointment:
    """Cita no eliminada, bloqueada con FOR UPDATE; una con baja lógica responde 404."""
    appointment = _lock_appointment(session, appointment_id)
    if appointment is None or appointment.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return appointment


def _ensure_active_patient(session: Session, patient_id: UUID) -> Patient:
    """El paciente debe existir, no estar eliminado y estar activo."""
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)
    if patient.status != PatientStatus.ACTIVE:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "El paciente no está activo",
        )
    return patient


def _ensure_active_doctor(session: Session, doctor_id: UUID) -> Doctor:
    """El médico debe existir, no estar eliminado y estar activo."""
    doctor = get_or_404(session, Doctor, doctor_id, _DOCTOR_NOT_FOUND)
    if doctor.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _DOCTOR_NOT_FOUND)
    if doctor.status != RecordStatus.ACTIVE:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "El médico no está activo",
        )
    return doctor


def _require_status(appointment: Appointment, allowed: tuple[AppointmentStatus, ...], message: str) -> None:
    if appointment.status not in allowed:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", message)


@router.get("", response_model=OffsetPage[AppointmentListItem])
def list_appointments(
    session: SessionDep,
    query: Annotated[APPOINTMENTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: AppointmentPermissions.READ.requiere,
) -> OffsetPage[AppointmentListItem]:
    # Scope base: sólo citas no eliminadas. Casos principales: ?doctor_id / ?patient_id.
    stmt = select(Appointment).where(Appointment.deleted_at.is_(None))
    return paginate_resource(APPOINTMENTS, session, query, stmt=stmt)


@router.get("/{appointment_id}", response_model=AppointmentRead)
def get_appointment(
    appointment_id: UUID,
    session: SessionDep,
    _: AppointmentPermissions.READ.requiere,
) -> AppointmentRead:
    return serialize(AppointmentRead, _get_active_appointment(session, appointment_id))


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.CREATE.requiere,
) -> AppointmentRead:
    _ensure_active_patient(session, payload.patient_id)
    _ensure_active_doctor(session, payload.doctor_id)
    appointment = create_entity(
        session,
        Appointment,
        payload,
        values={
            "status": AppointmentStatus.PENDING,
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_OVERLAP,
        conflict_code="schedule_overlap",
    )
    return serialize(AppointmentRead, appointment)


@router.patch("/{appointment_id}", response_model=AppointmentRead)
def update_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.UPDATE.requiere,
) -> AppointmentRead:
    appointment = _lock_active_appointment(session, appointment_id)
    _require_status(
        appointment, _ACTIVE, "Sólo se puede editar una cita pendiente o confirmada"
    )
    data = payload.model_dump(exclude_unset=True)
    if data.get("doctor_id") is not None and data["doctor_id"] != appointment.doctor_id:
        _ensure_active_doctor(session, data["doctor_id"])
    appointment = patch_entity(
        session,
        appointment,
        payload,
        actor_id=current_user.id,
        conflict_message=_OVERLAP,
        conflict_code="schedule_overlap",
    )
    return serialize(AppointmentRead, appointment)


@router.delete("/{appointment_id}", response_model=AppointmentRead)
def delete_appointment(
    appointment_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.DELETE.requiere,
) -> AppointmentRead:
    appointment = _lock_active_appointment(session, appointment_id)
    # Sólo una cita pendiente (creada por error operativo) se elimina; las confirmadas
    # se cancelan y los estados terminales se conservan.
    _require_status(
        appointment,
        (AppointmentStatus.PENDING,),
        "Sólo se puede eliminar una cita pendiente; cancela las confirmadas",
    )
    appointment = soft_delete_entity(
        session,
        appointment,
        actor_id=current_user.id,
        already_deleted_message="La cita ya fue eliminada",
    )
    return serialize(AppointmentRead, appointment)


@router.post("/{appointment_id}/confirm", response_model=AppointmentRead)
def confirm_appointment(
    appointment_id: UUID,
    _payload: AppointmentConfirm,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.UPDATE.requiere,
) -> AppointmentRead:
    appointment = _lock_active_appointment(session, appointment_id)
    _require_status(
        appointment,
        (AppointmentStatus.PENDING,),
        "Sólo se puede confirmar una cita pendiente",
    )
    appointment = update_entity_values(
        session,
        appointment,
        {"status": AppointmentStatus.CONFIRMED},
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(AppointmentRead, appointment)


@router.post("/{appointment_id}/cancel", response_model=AppointmentRead)
def cancel_appointment(
    appointment_id: UUID,
    payload: AppointmentCancel,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.UPDATE.requiere,
) -> AppointmentRead:
    appointment = _lock_active_appointment(session, appointment_id)
    _require_status(
        appointment, _ACTIVE, "Sólo se puede cancelar una cita pendiente o confirmada"
    )
    values: dict[str, object] = {"status": AppointmentStatus.CANCELLED}
    if payload.reason:
        # El motivo se conserva en internal_notes (sin columnas dedicadas en esta fase).
        note = f"Cancelación: {payload.reason}"
        values["internal_notes"] = (
            f"{appointment.internal_notes}\n{note}"
            if appointment.internal_notes
            else note
        )
    appointment = update_entity_values(
        session,
        appointment,
        values,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(AppointmentRead, appointment)


@router.post("/{appointment_id}/no-show", response_model=AppointmentRead)
def no_show_appointment(
    appointment_id: UUID,
    _payload: AppointmentNoShow,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.UPDATE.requiere,
) -> AppointmentRead:
    appointment = _lock_active_appointment(session, appointment_id)
    _require_status(
        appointment,
        _ACTIVE,
        "Sólo se puede marcar inasistencia en una cita pendiente o confirmada",
    )
    appointment = update_entity_values(
        session,
        appointment,
        {"status": AppointmentStatus.NO_SHOW},
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(AppointmentRead, appointment)


@router.post(
    "/{appointment_id}/reschedule",
    response_model=AppointmentRead,
    status_code=status.HTTP_201_CREATED,
)
def reschedule_appointment(
    appointment_id: UUID,
    payload: AppointmentReschedule,
    session: SessionDep,
    current_user: CurrentUser,
    _: AppointmentPermissions.UPDATE.requiere,
) -> AppointmentRead:
    original = _lock_active_appointment(session, appointment_id)
    _require_status(
        original, _ACTIVE, "Sólo se puede reprogramar una cita pendiente o confirmada"
    )
    # El paciente se conserva; el resto se hereda de la original si no se envía.
    data = payload.model_dump(exclude_unset=True)
    new_doctor_id = data.get("doctor_id", original.doctor_id)
    if new_doctor_id != original.doctor_id:
        _ensure_active_doctor(session, new_doctor_id)

    new_appointment = Appointment(
        patient_id=original.patient_id,
        doctor_id=new_doctor_id,
        scheduled_date=data.get("scheduled_date", original.scheduled_date),
        scheduled_time=data.get("scheduled_time", original.scheduled_time),
        duration_minutes=data.get("duration_minutes", original.duration_minutes),
        reason=data.get("reason", original.reason),
        internal_notes=data.get("internal_notes", original.internal_notes),
        status=AppointmentStatus.PENDING,
        rescheduled_from_id=original.id,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(new_appointment)
    original.status = AppointmentStatus.RESCHEDULED
    touch_entity(original, current_user.id)
    # Si la nueva cita traslapa, el rollback deja la original sin cambios (409).
    commit_or_conflict(session, _OVERLAP, code="schedule_overlap")
    session.refresh(new_appointment)
    return serialize(AppointmentRead, new_appointment)
