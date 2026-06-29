"""Verificaciones de calidad/seguridad clínica: ``POST /quality/check`` (sólo lectura).

Gateado por ``quality_checks:read``. Ejecuta reglas DETERMINISTAS sobre los datos
estructurados ya existentes y devuelve banderas para la REVISIÓN del médico. No persiste,
no escribe, no muta y no inventa: cada bandera apunta a un registro/campo real. Toda salida
es una sugerencia que el médico decide; nunca una corrección automática.

Alcance por objetivo:
  - ``consultation``: nota SOAP (si está en borrador) + signos vitales + resultados de
    laboratorio + medicamentos de las recetas, todos de esa consulta.
  - ``prescription``: medicamentos de esa receta (dosis/frecuencia).
  - ``patient``: resultados de laboratorio del paciente (valores físicamente imposibles).
"""

from typing import Sequence
from uuid import UUID

from fastapi import APIRouter, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import api_error, get_or_404
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.lab_result import LabResult
from backend.app.models.patient import Patient
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.models.vital_sign import VitalSign
from backend.app.quality_checks import (
    QualityFlag,
    check_consultation_note,
    check_lab_result,
    check_prescription_item,
    check_vital_sign,
)
from backend.app.schemas.quality_check import (
    QualityCheckRequest,
    QualityCheckResponse,
    QualityFlagRead,
)
from backend.app.security.groups.quality_checks import QualityCheckPermissions

router = APIRouter(prefix="/quality", tags=["quality_checks"])

_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_PRESCRIPTION_NOT_FOUND = "Receta no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"


def _get_active(session: Session, model, entity_id: UUID, message: str):  # type: ignore[no-untyped-def]
    """Carga una entidad vigente (404 si no existe o está eliminada lógicamente)."""
    entity = get_or_404(session, model, entity_id, message)
    if entity.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", message)
    return entity


def _active_prescription_items(
    session: Session, prescription_ids: Sequence[UUID]
) -> list[PrescriptionItem]:
    if not prescription_ids:
        return []
    stmt = select(PrescriptionItem).where(
        PrescriptionItem.prescription_id.in_(prescription_ids),
        PrescriptionItem.deleted_at.is_(None),
    )
    return list(session.execute(stmt).scalars().all())


def _check_consultation(session: Session, consultation: Consultation) -> list[QualityFlag]:
    flags: list[QualityFlag] = list(check_consultation_note(consultation))

    vitals = session.execute(
        select(VitalSign).where(
            VitalSign.consultation_id == consultation.id,
            VitalSign.deleted_at.is_(None),
        )
    ).scalars().all()
    for vital in vitals:
        flags.extend(check_vital_sign(vital))

    labs = session.execute(
        select(LabResult).where(
            LabResult.consultation_id == consultation.id,
            LabResult.deleted_at.is_(None),
        )
    ).scalars().all()
    for lab in labs:
        flags.extend(check_lab_result(lab))

    prescription_ids = list(
        session.execute(
            select(Prescription.id).where(
                Prescription.consultation_id == consultation.id,
                Prescription.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    for item in _active_prescription_items(session, prescription_ids):
        flags.extend(check_prescription_item(item))

    return flags


def _check_prescription(session: Session, prescription: Prescription) -> list[QualityFlag]:
    flags: list[QualityFlag] = []
    for item in _active_prescription_items(session, [prescription.id]):
        flags.extend(check_prescription_item(item))
    return flags


def _check_patient(session: Session, patient: Patient) -> list[QualityFlag]:
    flags: list[QualityFlag] = []
    labs = session.execute(
        select(LabResult).where(
            LabResult.patient_id == patient.id,
            LabResult.deleted_at.is_(None),
        )
    ).scalars().all()
    for lab in labs:
        flags.extend(check_lab_result(lab))
    return flags


def _to_read(flag: QualityFlag) -> QualityFlagRead:
    return QualityFlagRead(
        rule_id=flag.rule_id,
        severity=flag.severity.value,
        message=flag.message_es,
        source_ref=flag.source_ref,
        threshold_cited=flag.threshold_cited,
    )


@router.post("/check", response_model=QualityCheckResponse)
def run_quality_check(
    payload: QualityCheckRequest,
    session: SessionDep,
    _: QualityCheckPermissions.READ.requiere,
) -> QualityCheckResponse:
    """Ejecuta las verificaciones deterministas sobre el objetivo. Sólo lectura; no muta nada."""
    if payload.target_type == "consultation":
        consultation = _get_active(
            session, Consultation, payload.target_id, _CONSULTATION_NOT_FOUND
        )
        flags = _check_consultation(session, consultation)
    elif payload.target_type == "prescription":
        prescription = _get_active(
            session, Prescription, payload.target_id, _PRESCRIPTION_NOT_FOUND
        )
        flags = _check_prescription(session, prescription)
    else:  # patient
        patient = _get_active(session, Patient, payload.target_id, _PATIENT_NOT_FOUND)
        flags = _check_patient(session, patient)

    read_flags = [_to_read(flag) for flag in flags]
    return QualityCheckResponse(
        target_type=payload.target_type,
        target_id=payload.target_id,
        flags=read_flags,
        flag_count=len(read_flags),
    )
