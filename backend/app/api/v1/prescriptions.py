"""Recetas médicas emitidas a partir de una consulta.

Ciclo de vida: ``draft`` → ``approved`` (aprobación explícita del médico tratante)
→ ``voided`` (anulación controlada). No hay otros estados. El folio interno lo
genera la base de datos; el snapshot de los datos profesionales del médico se
captura al aprobar y es inmutable después.

Concurrencia: toda mutación toma primero la fila de la consulta padre con
``SELECT ... FOR UPDATE`` y luego la de la receta, en ese orden (consulta → receta
→ renglón), serializándose sobre la misma fila que ``consultations.finalize``. Las
lecturas no toman bloqueo.
"""

from typing import Annotated, Any
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
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.doctor import Doctor
from backend.app.models.enums import ConsultationStatus, PrescriptionStatus, RecordStatus
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.resources.registry import PRESCRIPTIONS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.prescription import (
    PrescriptionApprove,
    PrescriptionCreate,
    PrescriptionListItem,
    PrescriptionRead,
    PrescriptionUpdate,
    PrescriptionVoid,
)
from backend.app.security.groups.prescriptions import PrescriptionPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

_NOT_FOUND = "Receta no encontrada"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar la receta"
_SEALED = "La consulta está finalizada: no se pueden modificar sus recetas"
_NOT_DRAFT = "Sólo se puede modificar o eliminar una receta en borrador"
_BAD_DIAGNOSIS = "El diagnóstico relacionado no pertenece a la consulta"

# Campos profesionales que se capturan en ``doctor_snapshot`` al aprobar la receta.
_SNAPSHOT_FIELDS = (
    "professional_name",
    "professional_title",
    "professional_license_number",
    "specialty",
    "specialty_license_number",
    "professional_phone",
    "professional_email",
    "clinic_name",
    "office_address",
    "office_phone",
    "prescription_footer",
)


def _lock_consultation(session: Session, consultation_id: UUID) -> Consultation | None:
    """Toma la fila de la consulta con FOR UPDATE (serializa con finalize)."""
    return session.exec(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    ).first()


def _lock_prescription(session: Session, prescription_id: UUID) -> Prescription | None:
    """Toma la fila de la receta con FOR UPDATE (segundo nivel del orden de bloqueo)."""
    return session.exec(
        select(Prescription).where(Prescription.id == prescription_id).with_for_update()
    ).first()


def _get_writable_consultation(session: Session, consultation_id: UUID) -> Consultation:
    """Consulta destino de una receta nueva: bloqueada, existente, no eliminada ni finalizada."""
    consultation = _lock_consultation(session, consultation_id)
    if consultation is None or consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)
    return consultation


def _load_active_prescription(
    session: Session, prescription_id: UUID, *, lock: bool = False
) -> tuple[Prescription, Consultation]:
    """Carga una receta disponible: ni ella ni su consulta padre eliminadas (-> 404).

    ``lock`` toma las filas con FOR UPDATE en el orden consulta → receta: las
    mutaciones lo activan; las lecturas no."""
    prescription = get_or_404(session, Prescription, prescription_id, _NOT_FOUND)
    if prescription.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    if lock:
        # Orden de bloqueo: primero la consulta, luego la receta.
        consultation = _lock_consultation(session, prescription.consultation_id)
        locked = _lock_prescription(session, prescription_id)
        if locked is None or locked.deleted_at is not None:
            api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
        prescription = locked
    else:
        consultation = get_or_404(
            session, Consultation, prescription.consultation_id, _NOT_FOUND
        )
    if consultation is None or consultation.deleted_at is not None:
        # La consulta padre eliminada hace que sus recetas no estén disponibles.
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return prescription, consultation


def _require_draft_prescription(prescription: Prescription) -> None:
    if prescription.status != PrescriptionStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _NOT_DRAFT)


def _validate_related_diagnosis(
    session: Session, diagnosis_id: UUID, consultation_id: UUID
) -> None:
    """El diagnóstico relacionado debe existir, no estar eliminado y ser de la misma consulta."""
    diagnosis = session.get(ConsultationDiagnosis, diagnosis_id)
    if (
        diagnosis is None
        or diagnosis.deleted_at is not None
        or diagnosis.consultation_id != consultation_id
    ):
        api_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "invalid_related_diagnosis",
            _BAD_DIAGNOSIS,
        )


def _require_attending_doctor(
    session: Session, current_user: CurrentUser, consultation: Consultation
) -> Doctor:
    """El actor debe tener un perfil de médico activo y ser el tratante asignado."""
    doctor = session.exec(
        select(Doctor).where(
            Doctor.user_id == current_user.id, Doctor.deleted_at.is_(None)
        )
    ).first()
    if doctor is None or doctor.status != RecordStatus.ACTIVE:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "doctor_profile_required",
            "Se requiere un perfil de médico activo",
        )
    if doctor.id != consultation.attending_doctor_id:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "not_attending_doctor",
            "Sólo el médico tratante asignado puede realizar esta acción",
        )
    return doctor


def _build_doctor_snapshot(doctor: Doctor) -> dict[str, Any]:
    """Captura inmutable de los datos profesionales del médico al aprobar."""
    return {field: getattr(doctor, field) for field in _SNAPSHOT_FIELDS}


@router.get("", response_model=OffsetPage[PrescriptionListItem])
def list_prescriptions(
    session: SessionDep,
    query: Annotated[PRESCRIPTIONS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PrescriptionPermissions.READ.requiere,
) -> OffsetPage[PrescriptionListItem]:
    # Scope base: recetas no eliminadas cuya consulta padre tampoco lo esté. El caso
    # principal se resuelve con ?consultation_id=<id>.
    stmt = (
        select(Prescription)
        .join(Consultation, Consultation.id == Prescription.consultation_id)
        .where(Prescription.deleted_at.is_(None), Consultation.deleted_at.is_(None))
    )
    return paginate_resource(PRESCRIPTIONS, session, query, stmt=stmt)


@router.get("/{prescription_id}", response_model=PrescriptionRead)
def get_prescription(
    prescription_id: UUID,
    session: SessionDep,
    _: PrescriptionPermissions.READ.requiere,
) -> PrescriptionRead:
    prescription, _consultation = _load_active_prescription(session, prescription_id)
    return serialize(PrescriptionRead, prescription)


@router.post("", response_model=PrescriptionRead, status_code=status.HTTP_201_CREATED)
def create_prescription(
    payload: PrescriptionCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.CREATE.requiere,
) -> PrescriptionRead:
    _get_writable_consultation(session, payload.consultation_id)
    if payload.related_diagnosis_id is not None:
        _validate_related_diagnosis(
            session, payload.related_diagnosis_id, payload.consultation_id
        )
    prescription = create_entity(
        session,
        Prescription,
        payload,
        values={
            "status": PrescriptionStatus.DRAFT,
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(PrescriptionRead, prescription)


@router.patch("/{prescription_id}", response_model=PrescriptionRead)
def update_prescription(
    prescription_id: UUID,
    payload: PrescriptionUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.UPDATE.requiere,
) -> PrescriptionRead:
    prescription, consultation = _load_active_prescription(
        session, prescription_id, lock=True
    )
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)
    _require_draft_prescription(prescription)
    data = payload.model_dump(exclude_unset=True)
    if data.get("related_diagnosis_id") is not None:
        _validate_related_diagnosis(
            session, data["related_diagnosis_id"], prescription.consultation_id
        )
    prescription = patch_entity(
        session,
        prescription,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PrescriptionRead, prescription)


@router.delete("/{prescription_id}", response_model=PrescriptionRead)
def delete_prescription(
    prescription_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.DELETE.requiere,
) -> PrescriptionRead:
    prescription, consultation = _load_active_prescription(
        session, prescription_id, lock=True
    )
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)
    _require_draft_prescription(prescription)
    prescription = soft_delete_entity(
        session,
        prescription,
        actor_id=current_user.id,
        already_deleted_message="La receta ya fue eliminada",
    )
    return serialize(PrescriptionRead, prescription)


@router.post("/{prescription_id}/approve", response_model=PrescriptionRead)
def approve_prescription(
    prescription_id: UUID,
    _payload: PrescriptionApprove,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.APPROVE.requiere,
) -> PrescriptionRead:
    prescription, consultation = _load_active_prescription(
        session, prescription_id, lock=True
    )
    _require_draft_prescription(prescription)
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "No se puede aprobar: la consulta ya está finalizada",
        )
    doctor = _require_attending_doctor(session, current_user, consultation)

    items = session.exec(
        select(PrescriptionItem).where(
            PrescriptionItem.prescription_id == prescription.id,
            PrescriptionItem.deleted_at.is_(None),
        )
    ).all()
    if not items:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "La receta no tiene medicamentos activos",
        )
    if any(
        not (item.medication_name and item.dose and item.frequency and item.duration)
        for item in items
    ):
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "Todos los medicamentos deben tener nombre, dosis, frecuencia y duración",
        )

    prescription.status = PrescriptionStatus.APPROVED
    prescription.approved_by_doctor_id = doctor.id
    prescription.approved_at = utc_now()
    prescription.doctor_snapshot = _build_doctor_snapshot(doctor)
    touch_entity(prescription, current_user.id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(prescription)
    return serialize(PrescriptionRead, prescription)


@router.post("/{prescription_id}/void", response_model=PrescriptionRead)
def void_prescription(
    prescription_id: UUID,
    payload: PrescriptionVoid,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.VOID.requiere,
) -> PrescriptionRead:
    # La anulación se permite aunque la consulta ya esté finalizada: una receta
    # aprobada sigue siendo anulable por el médico tratante.
    prescription, consultation = _load_active_prescription(
        session, prescription_id, lock=True
    )
    if prescription.status != PrescriptionStatus.APPROVED:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "Sólo se puede anular una receta aprobada",
        )
    doctor = _require_attending_doctor(session, current_user, consultation)

    prescription.status = PrescriptionStatus.VOIDED
    prescription.voided_by_doctor_id = doctor.id
    prescription.voided_at = utc_now()
    prescription.void_reason = payload.void_reason
    touch_entity(prescription, current_user.id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(prescription)
    return serialize(PrescriptionRead, prescription)
