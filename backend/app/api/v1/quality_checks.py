"""Verificaciones de calidad/seguridad clínica: ``POST /quality/check`` (sólo lectura).

Gateado por ``quality_checks:read``. Ejecuta reglas DETERMINISTAS sobre los datos
estructurados ya existentes y devuelve banderas para la REVISIÓN del médico. No persiste,
no escribe, no muta y no inventa: cada bandera apunta a un registro/campo real. Toda salida
es una sugerencia que el médico decide; nunca una corrección automática.

Fase 2 añade reglas de MEDICACIÓN ACTIVA: duplicidad de medicamentos y cruce fármaco-alergia.
El cruce fármaco-alergia resuelve ingredientes/clases con una fuente de farmacología
CONFIGURABLE (el MCP real se enchufa por URL); si no está disponible, ese cruce reporta
'no disponible' (NUNCA inventa una coincidencia) y las demás reglas siguen corriendo.

Fase 3 añade dos reglas de seguridad farmacológica:
  - INTERACCIONES fármaco-fármaco: marca pares de medicamentos activos con una interacción que
    REPORTA la fuente de farmacología (con su severidad/cita). Si la fuente no soporta
    interacciones o no está disponible, reporta 'no disponible' (NUNCA inventa una interacción).
  - AJUSTE DE DOSIS RENAL: si hay un eGFR MEDIDO (de un LabResult real) por debajo del umbral
    citado de un fármaco de eliminación renal activo, lo marca para revisión. Si no hay eGFR, la
    regla no dispara (no se estima ni se fabrica el dato).

Alcance por objetivo:
  - ``consultation``: nota SOAP (si está en borrador) + signos vitales + resultados de
    laboratorio + medicamentos de las recetas + duplicidad y cruce fármaco-alergia, de esa
    consulta (alergias del paciente).
  - ``prescription``: medicamentos de esa receta (dosis/frecuencia) + duplicidad + cruce
    fármaco-alergia contra las alergias del paciente.
  - ``patient``: resultados de laboratorio + duplicidad y cruce fármaco-alergia sobre toda la
    medicación activa del paciente.
"""

from typing import Sequence
from uuid import UUID

from fastapi import APIRouter, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import api_error, get_or_404
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.enums import (
    ClinicalItemStatus,
    PatientClinicalItemType,
    PrescriptionStatus,
)
from backend.app.models.lab_result import LabResult
from backend.app.models.patient import Patient
from backend.app.models.patient_clinical_item import PatientClinicalItem
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.models.vital_sign import VitalSign
from backend.app.quality_checks import (
    InteractionFinding,
    PharmaResolution,
    QualityFlag,
    RenalFunction,
    ResolvedDrug,
    check_consultation_note,
    check_drug_allergy,
    check_drug_interactions,
    check_duplicate_medications,
    check_interaction,
    check_lab_result,
    check_prescription_item,
    check_renal_dose,
    check_vital_sign,
    pharmacology_source_available,
    resolve_pharmacology,
)
from backend.app.quality_checks.base import normalize_text
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


def _consultation_prescription_ids(session: Session, consultation_id: UUID) -> list[UUID]:
    return list(
        session.execute(
            select(Prescription.id).where(
                Prescription.consultation_id == consultation_id,
                Prescription.deleted_at.is_(None),
            )
        ).scalars().all()
    )


def _active_med_items_for_consultation(
    session: Session, consultation_id: UUID
) -> list[PrescriptionItem]:
    """Medicamentos de las recetas NO anuladas y no eliminadas de una consulta."""
    ids = list(
        session.execute(
            select(Prescription.id).where(
                Prescription.consultation_id == consultation_id,
                Prescription.status != PrescriptionStatus.VOIDED,
                Prescription.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    return _active_prescription_items(session, ids)


def _active_med_items_for_patient(
    session: Session, patient_id: UUID
) -> list[PrescriptionItem]:
    ids = list(
        session.execute(
            select(Prescription.id)
            .join(Consultation, Consultation.id == Prescription.consultation_id)
            .where(
                Consultation.patient_id == patient_id,
                Consultation.deleted_at.is_(None),
                Prescription.status != PrescriptionStatus.VOIDED,
                Prescription.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    return _active_prescription_items(session, ids)


def _active_allergies(session: Session, patient_id: UUID) -> list[PatientClinicalItem]:
    return list(
        session.execute(
            select(PatientClinicalItem).where(
                PatientClinicalItem.patient_id == patient_id,
                PatientClinicalItem.item_type == PatientClinicalItemType.ALLERGY,
                PatientClinicalItem.status == ClinicalItemStatus.ACTIVE,
                PatientClinicalItem.deleted_at.is_(None),
            )
        ).scalars().all()
    )


def _drug_allergy_flags(
    session: Session, patient_id: UUID, med_items: Sequence[PrescriptionItem]
) -> list[QualityFlag]:
    """Cruce fármaco-alergia (fase 2): sólo corre si hay medicamentos Y alergias que comparar."""
    allergies = _active_allergies(session, patient_id)
    if not med_items or not allergies:
        return []  # nada que cruzar

    if not pharmacology_source_available():
        return check_drug_allergy([], [], source_available=False)

    cache: dict[str, PharmaResolution] = {}

    def _resolve(name: str) -> PharmaResolution:
        key = normalize_text(name or "")
        if key not in cache:
            cache[key] = resolve_pharmacology(name)
        return cache[key]

    resolved_meds = [
        ResolvedDrug(
            ref=f"prescription_item:{item.id}",
            label=item.medication_name,
            ingredients=_resolve(item.medication_name).ingredients,
            classes=_resolve(item.medication_name).classes,
        )
        for item in med_items
    ]
    resolved_allergies = [
        ResolvedDrug(
            ref=f"patient_clinical_item:{allergy.id}",
            label=allergy.title,
            ingredients=_resolve(allergy.title).ingredients,
            classes=_resolve(allergy.title).classes,
        )
        for allergy in allergies
    ]
    # La fuente está configurada; si NINGUNA resolución respondió, se considera no disponible.
    responded = any(resolution.available for resolution in cache.values())
    return check_drug_allergy(resolved_meds, resolved_allergies, source_available=responded)


def _pharmacology_flags(
    session: Session, patient_id: UUID, med_items: Sequence[PrescriptionItem]
) -> list[QualityFlag]:
    """Reglas de medicación activa sobre los datos reales del paciente.

    - Duplicidad (siempre, sin fuente): un mismo medicamento repetido.
    - Cruce fármaco-alergia (fase 2): vía la fuente de farmacología configurada.
    - Interacciones fármaco-fármaco (fase 3): vía la fuente; 'no disponible' si no la soporta.
    - Ajuste de dosis renal (fase 3): si hay un eGFR medido + un fármaco de eliminación renal.

    Cada regla es independiente: el resultado de una no impide que corran las demás.
    """
    flags: list[QualityFlag] = list(
        check_duplicate_medications(
            [(f"prescription_item:{item.id}", item.medication_name) for item in med_items]
        )
    )
    flags.extend(_drug_allergy_flags(session, patient_id, med_items))
    flags.extend(_interaction_flags(med_items, pharmacology_source_available()))
    flags.extend(_renal_flags(session, patient_id, med_items))
    return flags


def _latest_egfr(session: Session, patient_id: UUID) -> RenalFunction | None:
    """Devuelve el eGFR MEDIDO más reciente del paciente (de un LabResult), o None si no hay.

    Reconoce el analito por nombre (texto libre): eGFR / TFG / filtrado glomerular. Sólo usa un
    valor numérico real; no estima eGFR desde la creatinina (eso exigiría una fórmula con
    edad/sexo y sería fabricar el dato).
    """
    labs = session.execute(
        select(LabResult)
        .where(
            LabResult.patient_id == patient_id,
            LabResult.value_numeric.is_not(None),
            LabResult.deleted_at.is_(None),
        )
        .order_by(LabResult.measured_at.desc())
    ).scalars().all()
    for lab in labs:
        name = normalize_text(lab.analyte_name or "")
        is_egfr = (
            "egfr" in name
            or "gfr" in name
            or "filtrado glomerular" in name
            or "tasa de filtracion glomerular" in name
            or "tfg" in name.split()
        )
        if is_egfr and lab.value_numeric is not None:
            measured = lab.measured_at.date().isoformat() if lab.measured_at else "fecha desconocida"
            return RenalFunction(
                value=float(lab.value_numeric),
                unit=lab.unit,
                source_ref=f"lab_result:{lab.id}",
                measured_label=f"{lab.analyte_name} del {measured}",
            )
    return None


def _interaction_flags(
    med_items: Sequence[PrescriptionItem], source_available: bool
) -> list[QualityFlag]:
    """Interacciones fármaco-fármaco (fase 3): consulta a la fuente cada par de medicamentos.

    Necesita al menos dos medicamentos activos. Si la fuente no está configurada o no soporta
    interacciones, emite el marcador 'no disponible' (NO concluye ausencia). Sólo marca lo que la
    fuente reporta como interacción real.
    """
    if len(med_items) < 2:
        return []
    if not source_available:
        return check_drug_interactions([], available=False)
    findings: list[InteractionFinding] = []
    any_available = False
    pair_cache: dict[frozenset[str], InteractionFinding] = {}
    for i in range(len(med_items)):
        for j in range(i + 1, len(med_items)):
            a, b = med_items[i], med_items[j]
            key = frozenset({normalize_text(a.medication_name), normalize_text(b.medication_name)})
            if key not in pair_cache:
                res = check_interaction(a.medication_name, b.medication_name)
                any_available = any_available or res.available
                pair_cache[key] = InteractionFinding(
                    ref_a=f"prescription_item:{a.id}", label_a=a.medication_name,
                    ref_b=f"prescription_item:{b.id}", label_b=b.medication_name,
                    interacts=res.interacts, severity=res.severity, source=res.source,
                )
            findings.append(pair_cache[key])
    # La fuente está configurada; si NINGÚN par pudo verificarse, las interacciones son
    # 'no disponible' (la fuente no soporta la consulta).
    return check_drug_interactions(findings, available=any_available)


def _renal_flags(
    session: Session, patient_id: UUID, med_items: Sequence[PrescriptionItem]
) -> list[QualityFlag]:
    """Ajuste de dosis renal (fase 3): requiere un eGFR medido + un fármaco de eliminación renal.

    Mapea el fármaco a su ingrediente con la fuente (cae a coincidencia por nombre si no hay
    fuente). Si no hay eGFR, la regla NO dispara: no se fabrica el dato.
    """
    if not med_items:
        return []
    egfr = _latest_egfr(session, patient_id)
    if egfr is None:
        return []
    resolved = [
        ResolvedDrug(
            ref=f"prescription_item:{item.id}",
            label=item.medication_name,
            ingredients=resolve_pharmacology(item.medication_name).ingredients,
            classes=resolve_pharmacology(item.medication_name).classes,
        )
        for item in med_items
    ]
    return check_renal_dose(egfr, resolved)


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

    prescription_ids = _consultation_prescription_ids(session, consultation.id)
    for item in _active_prescription_items(session, prescription_ids):
        flags.extend(check_prescription_item(item))

    # Reglas de medicación activa (fase 2): duplicidad + cruce fármaco-alergia del paciente.
    med_items = _active_med_items_for_consultation(session, consultation.id)
    flags.extend(_pharmacology_flags(session, consultation.patient_id, med_items))

    return flags


def _check_prescription(session: Session, prescription: Prescription) -> list[QualityFlag]:
    flags: list[QualityFlag] = []
    items = _active_prescription_items(session, [prescription.id])
    for item in items:
        flags.extend(check_prescription_item(item))

    # El paciente se deriva de la consulta de la receta.
    consultation = session.get(Consultation, prescription.consultation_id)
    if consultation is not None:
        # Sólo medicamentos de recetas no anuladas para las reglas de medicación activa.
        active_items = items if prescription.status != PrescriptionStatus.VOIDED else []
        flags.extend(_pharmacology_flags(session, consultation.patient_id, active_items))
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

    med_items = _active_med_items_for_patient(session, patient.id)
    flags.extend(_pharmacology_flags(session, patient.id, med_items))
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
