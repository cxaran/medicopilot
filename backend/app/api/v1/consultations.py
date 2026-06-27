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
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.doctor import Doctor
from backend.app.models.enums import ConsultationStatus, PatientStatus, RecordStatus
from backend.app.models.patient import Patient
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


def _get_active_consultation(session: Session, consultation_id: UUID) -> Consultation:
    """Obtiene una consulta no eliminada; una con baja lógica responde 404."""
    consultation = get_or_404(session, Consultation, consultation_id, _NOT_FOUND)
    if consultation.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return consultation


def _require_draft(consultation: Consultation) -> None:
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _NOT_DRAFT)


def _ensure_active_patient(session: Session, patient_id: UUID) -> Patient:
    """El paciente debe existir, no estar eliminado y estar activo para atenderse."""
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
    """El médico tratante debe existir, no estar eliminado y estar activo."""
    doctor = get_or_404(session, Doctor, doctor_id, _DOCTOR_NOT_FOUND)
    if doctor.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _DOCTOR_NOT_FOUND)
    if doctor.status != RecordStatus.ACTIVE:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "El médico tratante no está activo",
        )
    return doctor


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
    return serialize(ConsultationRead, _get_active_consultation(session, consultation_id))


@router.post("", response_model=ConsultationRead, status_code=status.HTTP_201_CREATED)
def create_consultation(
    payload: ConsultationCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.CREATE.requiere,
) -> ConsultationRead:
    _ensure_active_patient(session, payload.patient_id)
    _ensure_active_doctor(session, payload.attending_doctor_id)
    consultation = create_entity(
        session,
        Consultation,
        payload,
        values={
            "status": ConsultationStatus.DRAFT,
            "consulted_at": payload.consulted_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(ConsultationRead, consultation)


@router.patch("/{consultation_id}", response_model=ConsultationRead)
def update_consultation(
    consultation_id: UUID,
    payload: ConsultationUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConsultationPermissions.UPDATE.requiere,
) -> ConsultationRead:
    consultation = _get_active_consultation(session, consultation_id)
    _require_draft(consultation)
    data = payload.model_dump(exclude_unset=True)
    if "attending_doctor_id" in data and data["attending_doctor_id"] is not None:
        _ensure_active_doctor(session, data["attending_doctor_id"])
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
    consultation = _get_active_consultation(session, consultation_id)
    _require_draft(consultation)
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
    consultation = session.exec(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    ).first()
    if consultation is None or consultation.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    _require_draft(consultation)

    patient = get_or_404(session, Patient, consultation.patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "No se puede finalizar: el paciente fue eliminado",
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
