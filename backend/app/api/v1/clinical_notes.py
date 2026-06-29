"""Notas clínicas estructuradas: CRUD bajo ``clinical_notes:*`` (EPIC DOCS fase 1: SOAP).

Componer una nota SOAP es una ESCRITURA clínica: en el copiloto pasa por el protocolo de
aprobación P1 (el médico aprueba el borrador). La nota se compone a partir de los datos
REALES de una consulta; el servidor valida que la consulta exista y NO esté eliminada, deriva
de ella el ``patient_id`` (única fuente de verdad) y fija ``status='draft'``: NUNCA se finaliza
de forma autónoma. La baja es lógica; los listados/detalle excluyen las eliminadas.
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
from backend.app.models.clinical_note import ClinicalNote
from backend.app.models.consultation import Consultation
from backend.app.models.doctor import Doctor
from backend.app.models.enums import ClinicalNoteKind, ClinicalNoteStatus
from backend.app.models.patient import Patient
from backend.app.resources.registry import CLINICAL_NOTES
from backend.app.schemas.clinical_note import (
    ClinicalNoteCreate,
    ClinicalNoteListItem,
    ClinicalNoteRead,
    ClinicalNoteUpdate,
    MedicalCertificateCreate,
    ReferralCreate,
    SickLeaveCreate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.clinical_notes import ClinicalNotePermissions

router = APIRouter(prefix="/clinical-notes", tags=["clinical-notes"])

_NOT_FOUND = "Nota clínica no encontrada"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar la nota clínica"


def _get_active_note(session: Session, note_id: UUID) -> ClinicalNote:
    note = get_or_404(session, ClinicalNote, note_id, _NOT_FOUND)
    if note.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return note


def _get_active_consultation(session: Session, consultation_id: UUID) -> Consultation:
    consultation = get_or_404(
        session, Consultation, consultation_id, _CONSULTATION_NOT_FOUND
    )
    if consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )
    return consultation


@router.get("", response_model=OffsetPage[ClinicalNoteListItem])
def list_clinical_notes(
    session: SessionDep,
    query: Annotated[CLINICAL_NOTES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ClinicalNotePermissions.READ.requiere,
) -> OffsetPage[ClinicalNoteListItem]:
    # Scope base: solo notas vigentes. Caso principal: ?patient_id=<id> o ?consultation_id=<id>.
    stmt = select(ClinicalNote).where(ClinicalNote.deleted_at.is_(None))
    return paginate_resource(CLINICAL_NOTES, session, query, stmt=stmt)


@router.get("/{note_id}", response_model=ClinicalNoteRead)
def get_clinical_note(
    note_id: UUID,
    session: SessionDep,
    _: ClinicalNotePermissions.READ.requiere,
) -> ClinicalNoteRead:
    return serialize(ClinicalNoteRead, _get_active_note(session, note_id))


@router.post("", response_model=ClinicalNoteRead, status_code=status.HTTP_201_CREATED)
def create_clinical_note(
    payload: ClinicalNoteCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.CREATE.requiere,
) -> ClinicalNoteRead:
    # El paciente se DERIVA de la consulta (fuente única); la nota nace como borrador.
    consultation = _get_active_consultation(session, payload.consultation_id)
    note = create_entity(
        session,
        ClinicalNote,
        payload,
        values={
            "patient_id": consultation.patient_id,
            "status": ClinicalNoteStatus.DRAFT,
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalNoteRead, note)


def _consultation_snapshot(session: Session, consultation: Consultation) -> dict:
    """Toma de la consulta los datos REALES para el documento (snapshot a la emisión).

    Captura nombre del paciente, médico tratante y su cédula, y la fecha de asistencia. No se
    inventa nada: si un dato no existe en el expediente, queda ausente y el render lo marca.
    """
    patient = session.get(Patient, consultation.patient_id)
    doctor = session.get(Doctor, consultation.attending_doctor_id)
    return {
        "patient_name": patient.full_name if patient is not None else None,
        "attended_on": consultation.consulted_at.date().isoformat(),
        "physician_name": doctor.professional_name if doctor is not None else None,
        "physician_license": (
            doctor.professional_license_number if doctor is not None else None
        ),
    }


@router.post(
    "/medical-certificate",
    response_model=ClinicalNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_medical_certificate(
    payload: MedicalCertificateCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.CREATE.requiere,
) -> ClinicalNoteRead:
    """Crea una CONSTANCIA/justificante de asistencia EN BORRADOR, compuesta de la consulta."""
    consultation = _get_active_consultation(session, payload.consultation_id)
    details = _consultation_snapshot(session, consultation)
    details["motivo"] = payload.motivo
    note = ClinicalNote(
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        kind=ClinicalNoteKind.CONSTANCIA,
        status=ClinicalNoteStatus.DRAFT,
        details=details,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return serialize(ClinicalNoteRead, note)


@router.post(
    "/sick-leave",
    response_model=ClinicalNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_sick_leave(
    payload: SickLeaveCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.CREATE.requiere,
) -> ClinicalNoteRead:
    """Crea una INCAPACIDAD/justificante de reposo EN BORRADOR.

    El número de días de reposo es decisión médica EXPLÍCITA (``rest_days`` obligatorio, ≥1 por
    schema): nunca se asume ni se inventa.
    """
    consultation = _get_active_consultation(session, payload.consultation_id)
    details = _consultation_snapshot(session, consultation)
    details.update(
        {
            "diagnosis": payload.diagnosis,
            "rest_start_date": payload.rest_start_date.isoformat(),
            "rest_days": payload.rest_days,
        }
    )
    note = ClinicalNote(
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        kind=ClinicalNoteKind.INCAPACIDAD,
        status=ClinicalNoteStatus.DRAFT,
        details=details,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return serialize(ClinicalNoteRead, note)


@router.post(
    "/referral",
    response_model=ClinicalNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_referral(
    payload: ReferralCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.CREATE.requiere,
) -> ClinicalNoteRead:
    """Crea una REFERENCIA o CONTRARREFERENCIA EN BORRADOR, compuesta de la consulta.

    El destino de una referencia es decisión médica explícita (lo valida el schema): no se
    inventa. El servidor toma de la consulta el paciente y el médico + cédula.
    """
    consultation = _get_active_consultation(session, payload.consultation_id)
    details = _consultation_snapshot(session, consultation)
    if payload.kind == "referencia":
        details.update(
            {
                "destination": payload.destination,
                "reason": payload.reason,
                "clinical_summary": payload.clinical_summary,
            }
        )
    else:
        details.update(
            {
                "reason": payload.reason,
                "findings": payload.findings,
                "recommendations": payload.recommendations,
            }
        )
    note = ClinicalNote(
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        kind=ClinicalNoteKind(payload.kind),
        status=ClinicalNoteStatus.DRAFT,
        details=details,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return serialize(ClinicalNoteRead, note)


@router.patch("/{note_id}", response_model=ClinicalNoteRead)
def update_clinical_note(
    note_id: UUID,
    payload: ClinicalNoteUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.UPDATE.requiere,
) -> ClinicalNoteRead:
    note = _get_active_note(session, note_id)
    note = patch_entity(
        session,
        note,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalNoteRead, note)


@router.delete("/{note_id}", response_model=ClinicalNoteRead)
def delete_clinical_note(
    note_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalNotePermissions.DELETE.requiere,
) -> ClinicalNoteRead:
    note = _get_active_note(session, note_id)
    note = soft_delete_entity(
        session,
        note,
        actor_id=current_user.id,
        already_deleted_message="La nota clínica ya fue eliminada",
    )
    return serialize(ClinicalNoteRead, note)
