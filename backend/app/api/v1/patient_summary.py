"""Resumen clínico del paciente para el contexto del copiloto: ``GET /patients/{id}/summary``.

Sólo lectura, gateado por ``patient_summary:read``. Reúne una vista COMPACTA y ya filtrada del
expediente (datos generales, historia, consultas, notas, vitales, recetas, laboratorios/estudios,
seguimiento, archivos y citas) a partir de modelos YA existentes (sin modelo/migración nuevos).

Diseño (ver ``schemas/patient_summary.py``): excluye campos irrelevantes/administrativos y de
auditoría, no expone UUID salvo el del paciente, nunca proyecta bytes de archivos, y omite los
campos nulos/vacíos. Respeta el borrado lógico. No persiste, no muta y no inventa: si el agente
necesita un id para actuar, lo obtiene por las tools (que validan permiso y vigencia).
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter
from sqlmodel import select

from backend.app.api.resource_actions import get_active_or_404
from backend.app.core.database import SessionDep
from backend.app.models.appointment import Appointment
from backend.app.models.clinical_document import ClinicalDocument
from backend.app.models.clinical_note import ClinicalNote
from backend.app.models.clinical_task import ClinicalTask
from backend.app.models.consultation import Consultation
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.enums import (
    ClinicalDocumentStatus,
    ClinicalItemStatus,
    ClinicalTaskStatus,
    MedicalHistoryVersionStatus,
    PregnancyStatus,
    PrescriptionStatus,
)
from backend.app.models.lab_result import LabResult
from backend.app.models.medical_history import MedicalHistoryVersion
from backend.app.models.patient import Patient
from backend.app.models.patient_clinical_item import PatientClinicalItem
from backend.app.models.patient_history_item import PatientHistoryItem
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.models.study_order import StudyOrder
from backend.app.models.vital_sign import VitalSign
from backend.app.schemas.patient_summary import (
    PatientSummaryRead,
    SummaryAppointment,
    SummaryClinicalItem,
    SummaryConsultation,
    SummaryDiagnosis,
    SummaryFile,
    SummaryGeneral,
    SummaryHistoryItem,
    SummaryLab,
    SummaryMedicalHistory,
    SummaryMedication,
    SummaryNote,
    SummaryPrescription,
    SummaryStudy,
    SummaryTask,
    SummaryVitals,
)
from backend.app.security.groups.patient_summary import PatientSummaryPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/patients", tags=["patients"])

# Topes por sección: acotan el costo de tokens del contexto. Para más profundidad el agente usa
# las tools del recurso (que además traen los ids para actuar).
_MAX_CONSULTATIONS = 5
_MAX_NOTES = 5
_MAX_PRESCRIPTIONS = 6
_MAX_LABS = 12
_MAX_STUDIES = 6
_MAX_TASKS = 10
_MAX_FILES = 10
_MAX_APPOINTMENTS = 8
_MAX_CLINICAL_ITEMS = 25
_MAX_HISTORY_ITEMS = 25


def _clean(value: str | None) -> str | None:
    """Normaliza una cadena: vacía o sólo espacios -> None (se omite del JSON)."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _age(birth: date, today: date) -> int:
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def _num(value: object) -> float | None:
    return float(value) if value is not None else None  # type: ignore[arg-type]


@router.get("/{patient_id}/summary", response_model=PatientSummaryRead, response_model_exclude_none=True)
def get_patient_summary(
    patient_id: UUID,
    session: SessionDep,
    _: PatientSummaryPermissions.READ.requiere,
) -> PatientSummaryRead:
    """Resumen clínico compacto del paciente para el contexto del copiloto. Sólo lectura."""
    now = utc_now()
    patient = get_active_or_404(session, Patient, patient_id, "Paciente no encontrado")

    # Consultas del paciente (vigentes), reutilizadas para vitales/recetas (atados por consulta).
    consultations = list(
        session.execute(
            select(Consultation)
            .where(Consultation.patient_id == patient_id, Consultation.deleted_at.is_(None))
            .order_by(Consultation.consulted_at.desc())
        ).scalars().all()
    )
    consultation_ids = [c.id for c in consultations]

    # --- Datos generales (sin teléfono/dirección/CURP/correo/contactos) ---
    datos_generales = SummaryGeneral(
        nombre=patient.full_name,
        edad=_age(patient.birth_date, now.date()),
        sexo=patient.sex.value,
        ocupacion=_clean(patient.occupation),
        embarazo=(
            patient.pregnancy_status.value
            if patient.pregnancy_status != PregnancyStatus.NONE
            else None
        ),
    )

    # --- Historia clínica: resumen clínico (items activos) + antecedentes + versión vigente ---
    clinical_items = list(
        session.execute(
            select(PatientClinicalItem)
            .where(
                PatientClinicalItem.patient_id == patient_id,
                PatientClinicalItem.status == ClinicalItemStatus.ACTIVE,
                PatientClinicalItem.deleted_at.is_(None),
            )
            .order_by(PatientClinicalItem.created_at.desc())
            .limit(_MAX_CLINICAL_ITEMS)
        ).scalars().all()
    )
    resumen_clinico = [
        SummaryClinicalItem(
            tipo=item.item_type.value,
            titulo=item.title,
            detalle=_clean(item.details),
            severidad=item.severity.value if item.severity is not None else None,
        )
        for item in clinical_items
    ]

    history_items = list(
        session.execute(
            select(PatientHistoryItem)
            .where(
                PatientHistoryItem.patient_id == patient_id,
                PatientHistoryItem.deleted_at.is_(None),
            )
            .order_by(PatientHistoryItem.created_at.desc())
            .limit(_MAX_HISTORY_ITEMS)
        ).scalars().all()
    )
    antecedentes = [
        SummaryHistoryItem(
            categoria=item.category.value,
            descripcion=item.description,
            parentesco=_clean(item.relationship_to_patient),
            notas=_clean(item.notes),
        )
        for item in history_items
    ]

    current_history = session.execute(
        select(MedicalHistoryVersion)
        .where(
            MedicalHistoryVersion.patient_id == patient_id,
            MedicalHistoryVersion.status == MedicalHistoryVersionStatus.CURRENT,
            MedicalHistoryVersion.deleted_at.is_(None),
        )
        .order_by(MedicalHistoryVersion.version_number.desc())
    ).scalars().first()
    historia_clinica = None
    if current_history is not None:
        hc = SummaryMedicalHistory(
            antecedentes_familiares=_clean(current_history.family_history),
            antecedentes_patologicos=_clean(current_history.pathological_history),
            antecedentes_no_patologicos=_clean(current_history.non_pathological_history),
            cirugias_previas=_clean(current_history.previous_surgeries),
            hospitalizaciones=_clean(current_history.hospitalizations),
            habitos=_clean(current_history.relevant_habits),
            gineco_obstetricos=_clean(current_history.gyneco_obstetric_history),
            observaciones=_clean(current_history.clinical_observations),
        )
        # Sólo si algún bloque tiene contenido (si no, se omite entero).
        if any(hc.model_dump(exclude_none=True).values()):
            historia_clinica = hc

    # --- Consultas recientes + sus diagnósticos ---
    recent_consultations = consultations[:_MAX_CONSULTATIONS]
    diagnoses_by_consultation: dict[UUID, list[SummaryDiagnosis]] = {}
    if recent_consultations:
        rc_ids = [c.id for c in recent_consultations]
        for diag in session.execute(
            select(ConsultationDiagnosis).where(
                ConsultationDiagnosis.consultation_id.in_(rc_ids),
                ConsultationDiagnosis.deleted_at.is_(None),
            )
        ).scalars().all():
            diagnoses_by_consultation.setdefault(diag.consultation_id, []).append(
                SummaryDiagnosis(
                    tipo=diag.diagnosis_kind.value,
                    texto=diag.diagnosis_text,
                    codigo=_clean(diag.code),
                )
            )
    consultas = [
        SummaryConsultation(
            fecha=c.consulted_at,
            estado=c.status.value,
            motivo=c.reason_for_visit,
            evaluacion=_clean(c.clinical_assessment),
            diagnosticos=diagnoses_by_consultation.get(c.id, []),
        )
        for c in recent_consultations
    ]

    # --- Notas clínicas recientes (SOAP u otras) ---
    notes = list(
        session.execute(
            select(ClinicalNote)
            .where(ClinicalNote.patient_id == patient_id, ClinicalNote.deleted_at.is_(None))
            .order_by(ClinicalNote.created_at.desc())
            .limit(_MAX_NOTES)
        ).scalars().all()
    )
    notas = [
        SummaryNote(
            tipo=note.kind.value,
            estado=note.status.value,
            fecha=note.created_at,
            evaluacion=_clean(note.assessment),
            plan=_clean(note.plan),
        )
        for note in notes
    ]

    # --- Últimos signos vitales (por consulta del paciente; sólo mediciones presentes) ---
    signos_vitales = None
    if consultation_ids:
        vital = session.execute(
            select(VitalSign)
            .where(
                VitalSign.consultation_id.in_(consultation_ids),
                VitalSign.deleted_at.is_(None),
            )
            .order_by(VitalSign.measured_at.desc())
        ).scalars().first()
        if vital is not None:
            signos_vitales = SummaryVitals(
                fecha=vital.measured_at,
                peso_kg=_num(vital.weight_kg),
                talla_cm=_num(vital.height_cm),
                temperatura_c=_num(vital.temperature_c),
                presion_sistolica=vital.systolic_bp,
                presion_diastolica=vital.diastolic_bp,
                frecuencia_cardiaca=vital.heart_rate_bpm,
                frecuencia_respiratoria=vital.respiratory_rate_rpm,
                saturacion_o2=_num(vital.oxygen_saturation),
                glucosa_capilar=_num(vital.capillary_glucose),
                dolor=vital.pain_scale,
            )

    # --- Recetas recientes NO anuladas (por consulta del paciente) + sus medicamentos ---
    recetas: list[SummaryPrescription] = []
    if consultation_ids:
        prescriptions = list(
            session.execute(
                select(Prescription)
                .where(
                    Prescription.consultation_id.in_(consultation_ids),
                    Prescription.status != PrescriptionStatus.VOIDED,
                    Prescription.deleted_at.is_(None),
                )
                .order_by(Prescription.created_at.desc())
                .limit(_MAX_PRESCRIPTIONS)
            ).scalars().all()
        )
        items_by_rx: dict[UUID, list[SummaryMedication]] = {}
        if prescriptions:
            rx_ids = [p.id for p in prescriptions]
            for it in session.execute(
                select(PrescriptionItem)
                .where(
                    PrescriptionItem.prescription_id.in_(rx_ids),
                    PrescriptionItem.deleted_at.is_(None),
                )
                .order_by(PrescriptionItem.position)
            ).scalars().all():
                items_by_rx.setdefault(it.prescription_id, []).append(
                    SummaryMedication(
                        medicamento=it.medication_name,
                        dosis=_clean(it.dose),
                        frecuencia=_clean(it.frequency),
                        duracion=_clean(it.duration),
                    )
                )
        recetas = [
            SummaryPrescription(
                estado=p.status.value,
                fecha=p.approved_at or p.created_at,
                medicamentos=items_by_rx.get(p.id, []),
            )
            for p in prescriptions
        ]

    # --- Laboratorios recientes (con su marca de anormalidad) ---
    labs = list(
        session.execute(
            select(LabResult)
            .where(LabResult.patient_id == patient_id, LabResult.deleted_at.is_(None))
            .order_by(LabResult.measured_at.desc())
            .limit(_MAX_LABS)
        ).scalars().all()
    )
    laboratorios = [
        SummaryLab(
            analito=lab.analyte_name,
            valor=(
                str(_num(lab.value_numeric))
                if lab.value_numeric is not None
                else _clean(lab.value_text)
            ),
            unidad=_clean(lab.unit),
            marca=lab.abnormal_flag.value,
            fecha=lab.measured_at,
        )
        for lab in labs
    ]

    # --- Estudios ordenados recientes ---
    studies = list(
        session.execute(
            select(StudyOrder)
            .where(StudyOrder.patient_id == patient_id, StudyOrder.deleted_at.is_(None))
            .order_by(StudyOrder.ordered_at.desc())
            .limit(_MAX_STUDIES)
        ).scalars().all()
    )
    estudios = [
        SummaryStudy(estudio=st.study_name, estado=st.status.value, fecha=st.ordered_at)
        for st in studies
    ]

    # --- Seguimiento: tareas abiertas ---
    tasks = list(
        session.execute(
            select(ClinicalTask)
            .where(
                ClinicalTask.patient_id == patient_id,
                ClinicalTask.status == ClinicalTaskStatus.OPEN,
                ClinicalTask.deleted_at.is_(None),
            )
            .order_by(ClinicalTask.due_at)
            .limit(_MAX_TASKS)
        ).scalars().all()
    )
    seguimiento = [
        SummaryTask(titulo=t.title, prioridad=t.priority.value, vence=t.due_at) for t in tasks
    ]

    # --- Archivos clínicos (sólo metadatos, NUNCA bytes) ---
    files = list(
        session.execute(
            select(ClinicalDocument)
            .where(
                ClinicalDocument.patient_id == patient_id,
                ClinicalDocument.status == ClinicalDocumentStatus.ACTIVE,
            )
            .order_by(ClinicalDocument.uploaded_at.desc())
            .limit(_MAX_FILES)
        ).scalars().all()
    )
    archivos = [
        SummaryFile(
            nombre=f.original_filename, tipo=f.document_type.value, fecha=f.document_date
        )
        for f in files
    ]

    # --- Citas próximas (desde hoy) ---
    appointments = list(
        session.execute(
            select(Appointment)
            .where(
                Appointment.patient_id == patient_id,
                Appointment.scheduled_date >= now.date(),
                Appointment.deleted_at.is_(None),
            )
            .order_by(Appointment.scheduled_date, Appointment.scheduled_time)
            .limit(_MAX_APPOINTMENTS)
        ).scalars().all()
    )
    citas = [
        SummaryAppointment(
            fecha=a.scheduled_date,
            hora=a.scheduled_time,
            motivo=a.reason,
            estado=a.status.value,
        )
        for a in appointments
    ]

    return PatientSummaryRead(
        patient_id=patient.id,
        generado_en=now,
        datos_generales=datos_generales,
        resumen_clinico=resumen_clinico,
        antecedentes=antecedentes,
        historia_clinica=historia_clinica,
        consultas=consultas,
        notas=notas,
        signos_vitales=signos_vitales,
        recetas=recetas,
        laboratorios=laboratorios,
        estudios=estudios,
        seguimiento=seguimiento,
        archivos=archivos,
        citas=citas,
    )
