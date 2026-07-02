"""Núcleo de consultas médicas: la nota clínica narrativa.

Personal autorizado captura y edita un borrador (``draft``); sólo el médico
tratante asignado (``attending_doctor_id``), activo y vinculado al usuario
autenticado, puede finalizar la consulta vía el endpoint explícito ``/finalize``.
Una consulta ``finalized`` es de sólo lectura y no se puede eliminar.

Los recursos clínicos especializados (signos vitales, diagnósticos, recetas,
archivos, citas y notas de IA) vivirán en sus propias tablas/recursos: aquí no se
mezclan como columnas ni lógica.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_active_or_404,
    get_or_404,
    lock_active_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
    touch_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.appointment import Appointment
from backend.app.models.consultation import Consultation
from backend.app.models.doctor import Doctor
from backend.app.models.enums import (
    AppointmentStatus,
    ConsultationStatus,
    PatientStatus,
    PrescriptionStatus,
    RecordStatus,
)
from backend.app.models.patient import Patient
from backend.app.models.prescription import Prescription
from backend.app.resources.registry import CONSULTATIONS
from backend.app.schemas.consultation import (
    ConsultationCreate,
    ConsultationFinalize,
    ConsultationListItem,
    ConsultationRead,
    ConsultationUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.consultations import ConsultationPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/consultations", tags=["consultations"])

_NOT_FOUND = "Consulta no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_DOCTOR_NOT_FOUND = "Médico no encontrado"
_CONFLICT = "No se pudo guardar la consulta"
_NOT_DRAFT = "Sólo se puede modificar o eliminar una consulta en borrador"
_DOCTOR_INACTIVE = "El médico tratante no está activo"


@router.get("", response_model=OffsetPage[ConsultationListItem])
def list_consultations(
    session: SessionDep,
    query: Annotated[CONSULTATIONS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ConsultationPermissions.READ.requiere,
) -> OffsetPage[ConsultationListItem]:
    # Scope base: sólo consultas no eliminadas. El caso principal se resuelve con
    # ?patient_id=<id> o ?attending_doctor_id=<id>.
    stmt = select(Consultation).where(Consultation.deleted_at.is_(None))
    return paginate_resource(CONSULTATIONS, session, query, stmt=stmt)


@router.get("/{consultation_id}", response_model=ConsultationRead)
def get_consultation(
    consultation_id: UUID,
    session: SessionDep,
    _: ConsultationPermissions.READ.requiere,
) -> ConsultationRead:
    return serialize(ConsultationRead, get_active_or_404(session, Consultation, consultation_id, _NOT_FOUND))


@router.post("", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
def create_consultation(
    payload: ConsultationCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.CREATE.requiere,
) -> ConsultationRead:
    get_active_or_404(
        session, Patient, payload.patient_id, _PATIENT_NOT_FOUND,
        allowed_status=(PatientStatus.ACTIVE,), status_message="El paciente no está activo",
    )
    get_active_or_404(
        session, Doctor, payload.attending_doctor_id, _DOCTOR_NOT_FOUND,
        allowed_status=(RecordStatus.ACTIVE,), status_message=_DOCTOR_INACTIVE,
    )

    # Vínculo opcional con una cita: si llega appointment_id, se valida y se marca la
    # cita como atendida en la misma transacción que crea la consulta. Se bloquea con
    # FOR UPDATE (serializa frente a cancelar/reprogramar); debe estar pendiente o
    # confirmada y coincidir con el paciente y el médico tratante. La unicidad de
    # ``consultations.appointment_id`` respalda contra una segunda consulta.
    appointment: Appointment | None = None
    if payload.appointment_id is not None:
        appointment = lock_active_or_404(
            session, Appointment, payload.appointment_id, "Cita no encontrada",
            allowed_status=(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED),
            status_message="La cita no está disponible para originar una consulta",
        )
        if (
            appointment.patient_id != payload.patient_id
            or appointment.doctor_id != payload.attending_doctor_id
        ):
            api_error(
                status.HTTP_409_CONFLICT,
                "appointment_mismatch",
                "La cita no corresponde al paciente y médico de la consulta",
            )

    data = payload.model_dump()
    data.update(
        {
            "status": ConsultationStatus.DRAFT,
            "consulted_at": payload.consulted_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        }
    )
    consultation = Consultation(**data)
    session.add(consultation)
    if appointment is not None:
        appointment.status = AppointmentStatus.ATTENDED
        touch_entity(appointment, current_user.id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(consultation)
    return serialize(ConsultationRead, consultation)


@router.patch("/{consultation_id}", response_model=ConsultationRead)
def update_consultation(
    consultation_id: UUID,
    payload: ConsultationUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.UPDATE.requiere,
) -> ConsultationRead:
    consultation = get_active_or_404(
        session, Consultation, consultation_id, _NOT_FOUND,
        allowed_status=(ConsultationStatus.DRAFT,), status_message=_NOT_DRAFT,
    )
    data = payload.model_dump(exclude_unset=True)
    if "attending_doctor_id" in data and data["attending_doctor_id"] is not None:
        get_active_or_404(
            session, Doctor, data["attending_doctor_id"], _DOCTOR_NOT_FOUND,
            allowed_status=(RecordStatus.ACTIVE,), status_message=_DOCTOR_INACTIVE,
        )
    consultation = patch_entity(
        session,
        consultation,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ConsultationRead, consultation)


@router.delete("/{consultation_id}", response_model=ConsultationRead)
def delete_consultation(
    consultation_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.DELETE.requiere,
) -> ConsultationRead:
    consultation = get_active_or_404(
        session, Consultation, consultation_id, _NOT_FOUND,
        allowed_status=(ConsultationStatus.DRAFT,), status_message=_NOT_DRAFT,
    )
    consultation = soft_delete_entity(
        session,
        consultation,
        actor_id=current_user.id,
        already_deleted_message="La consulta ya fue eliminada",
    )
    return serialize(ConsultationRead, consultation)


@router.post("/{consultation_id}/finalize", response_model=ConsultationRead)
def finalize_consultation(
    consultation_id: UUID,
    payload: ConsultationFinalize,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.FINALIZE.requiere,
) -> ConsultationRead:
    # Bloquea la consulta para que la transición draft -> finalized sea atómica.
    consultation = lock_active_or_404(
        session, Consultation, consultation_id, _NOT_FOUND,
        allowed_status=(ConsultationStatus.DRAFT,), status_message=_NOT_DRAFT,
    )

    patient = get_or_404(session, Patient, consultation.patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "No se puede finalizar: el paciente fue eliminado",
        )

    # Una receta en borrador queda clínicamente sin resolver: debe aprobarse o
    # eliminarse antes de sellar la consulta. Las aprobadas o anuladas no bloquean.
    draft_prescription = session.exec(
        select(Prescription).where(
            Prescription.consultation_id == consultation.id,
            Prescription.status == PrescriptionStatus.DRAFT,
            Prescription.deleted_at.is_(None),
        )
    ).first()
    if draft_prescription is not None:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "No se puede finalizar: hay recetas en borrador. Apruébalas o elimínalas",
        )

    # El médico se deriva del usuario autenticado: no se acepta doctor_id. Además del
    # permiso de finalize, exige un perfil de médico vigente, activo y que sea
    # exactamente el tratante asignado.
    doctor = session.exec(
        select(Doctor).where(
            Doctor.user_id == current_user.id, Doctor.deleted_at.is_(None)
        )
    ).first()
    if doctor is None or doctor.status != RecordStatus.ACTIVE:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "doctor_profile_required",
            "Se requiere un perfil de médico activo para finalizar la consulta",
        )
    if doctor.id != consultation.attending_doctor_id:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "not_attending_doctor",
            "Sólo el médico tratante asignado puede finalizar la consulta",
        )

    consultation.status = ConsultationStatus.FINALIZED
    consultation.finalized_by_doctor_id = consultation.attending_doctor_id
    consultation.finalized_at = utc_now()
    touch_entity(consultation, current_user.id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(consultation)
    return serialize(ConsultationRead, consultation)
