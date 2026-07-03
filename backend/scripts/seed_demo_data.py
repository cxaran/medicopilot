"""Siembra de DATOS DE PRUEBA (demo) para el expediente clínico.

Crea un conjunto realista y variado: pacientes, antecedentes, inmunizaciones,
eventos clínicos, documentos, consultas (borrador y finalizadas) con diagnósticos,
signos vitales, notas SOAP, laboratorios, recetas + renglones, órdenes de estudio,
tareas clínicas, citas y plantillas de receta.

Reutiliza el médico y usuario YA existentes (no crea cuentas). Idempotente por
marcador: si ya hay pacientes sembrados (email @demo.seed) NO vuelve a crear
(usa SEED_FORCE=1 para forzar otra tanda).

Ejecutar DENTRO del contenedor del backend, desde la raíz del repo:
    docker exec medicopilot-dev-backend-1 python -m backend.scripts.seed_demo_data
"""

from __future__ import annotations

import hashlib
import os
import random
from datetime import date, datetime, time, timedelta

from sqlmodel import Session, select

from backend.app.core.database import engine
from backend.app.models import (
    Appointment,
    ClinicalCode,
    ClinicalDocument,
    ClinicalEvent,
    ClinicalNote,
    ClinicalTask,
    Consultation,
    ConsultationAiOutput,
    ConsultationDiagnosis,
    Doctor,
    InstitutionalSetting,
    LabResult,
    MedicalHistoryVersion,
    MedicationTemplate,
    Patient,
    PatientClinicalItem,
    PatientHistoryItem,
    PatientImmunization,
    Prescription,
    PrescriptionItem,
    ScaleResult,
    StudyOrder,
    VitalSign,
)
from backend.app.models.enums import (
    AiOutputStatus,
    AppointmentStatus,
    ClinicalCodeSystem,
    ClinicalDocumentStatus,
    ClinicalDocumentType,
    ClinicalEventStatus,
    ClinicalEventType,
    ClinicalItemStatus,
    ClinicalNoteKind,
    ClinicalNoteStatus,
    ClinicalSeverity,
    ClinicalTaskPriority,
    ClinicalTaskStatus,
    ConsultationAiOutputType,
    ConsultationDiagnosisKind,
    ConsultationStatus,
    ImmunizationRoute,
    ImmunizationStatus,
    LabResultAbnormalFlag,
    MedicalHistoryVersionStatus,
    PatientClinicalItemType,
    PatientHistoryItemCategory,
    PatientStatus,
    PregnancyStatus,
    PrescriptionStatus,
    RecordStatus,
    SettingCategory,
    Sex,
    StudyOrderStatus,
)

# Semilla determinista para que las corridas sean reproducibles.
random.seed(20260702)

NOW = datetime.utcnow()
SEED_EMAIL_DOMAIN = "demo.seed"

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

# --- Catálogos ligeros para variar los datos --------------------------------------

MALE_NAMES = ["Carlos", "José", "Luis", "Miguel", "Roberto", "Fernando", "Andrés", "Ricardo"]
FEMALE_NAMES = ["María", "Ana", "Laura", "Sofía", "Patricia", "Gabriela", "Daniela", "Verónica"]
SURNAMES = ["García", "Hernández", "López", "Martínez", "Rodríguez", "Pérez", "Sánchez",
            "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Vargas", "Castro"]

MED_TEMPLATES = [
    ("Paracetamol", "Tabletas 500 mg", "1 tableta", "cada 8 horas", "5 días",
     "Tomar con alimentos. No exceder 3 g al día."),
    ("Amoxicilina", "Cápsulas 500 mg", "1 cápsula", "cada 8 horas", "7 días",
     "Completar el esquema aunque haya mejoría."),
    ("Ibuprofeno", "Tabletas 400 mg", "1 tableta", "cada 8 horas", "3 días",
     "Tomar después de los alimentos."),
    ("Losartán", "Tabletas 50 mg", "1 tableta", "cada 24 horas", "30 días",
     "Control de presión arterial. Uso continuo."),
    ("Metformina", "Tabletas 850 mg", "1 tableta", "cada 12 horas", "30 días",
     "Tomar con los alimentos. Control glucémico."),
    ("Omeprazol", "Cápsulas 20 mg", "1 cápsula", "cada 24 horas", "14 días",
     "Tomar en ayunas, 30 min antes del desayuno."),
    ("Loratadina", "Tabletas 10 mg", "1 tableta", "cada 24 horas", "7 días",
     "Antihistamínico. Puede causar somnolencia leve."),
    ("Salbutamol", "Inhalador 100 mcg", "2 disparos", "cada 6 horas por razón necesaria", "según evolución",
     "Agitar antes de usar. Enjuagar boca después."),
]

REASONS = [
    "Control de hipertensión arterial", "Cuadro respiratorio agudo", "Dolor abdominal",
    "Control de diabetes mellitus tipo 2", "Cefalea de reciente aparición",
    "Revisión general y chequeo anual", "Dolor lumbar", "Consulta por faringitis",
    "Seguimiento post-operatorio", "Manejo de dislipidemia",
]

DIAGNOSES = [
    ("Hipertensión esencial (primaria)", "I10", "primary"),
    ("Diabetes mellitus tipo 2 sin complicaciones", "E11.9", "primary"),
    ("Infección aguda de vías respiratorias superiores", "J06.9", "primary"),
    ("Cefalea tensional", "G44.2", "secondary"),
    ("Lumbalgia no especificada", "M54.5", "primary"),
    ("Faringitis aguda", "J02.9", "primary"),
    ("Hiperlipidemia mixta", "E78.2", "secondary"),
    ("Gastritis no especificada", "K29.7", "suspected"),
]

LAB_PANEL = [
    ("Glucosa en ayuno", "mg/dL", 70, 100, "2345-7"),
    ("Hemoglobina", "g/dL", 12, 16, "718-7"),
    ("Colesterol total", "mg/dL", 0, 200, "2093-3"),
    ("Creatinina", "mg/dL", 0.6, 1.2, "2160-0"),
    ("Hemoglobina glicosilada A1c", "%", 4, 5.7, "4548-4"),
    ("Triglicéridos", "mg/dL", 0, 150, "2571-8"),
]

STUDIES = [
    ("Biometría hemática completa", "BH"),
    ("Química sanguínea de 6 elementos", "QS6"),
    ("Radiografía de tórax PA", "RXTX"),
    ("Electrocardiograma de reposo", "ECG"),
    ("Ultrasonido abdominal", "USG-ABD"),
    ("Perfil lipídico", "LIP"),
]


def _rand_name(sex: Sex) -> str:
    given = random.choice(FEMALE_NAMES if sex == Sex.FEMALE else MALE_NAMES)
    return f"{given} {random.choice(SURNAMES)} {random.choice(SURNAMES)}"


def _fake_file(kind: str) -> bytes:
    body = f"%PDF-1.4 DEMO {kind} {random.randint(1000, 9999)}\n".encode("utf-8")
    return body + b"0" * 256


def seed() -> None:
    with Session(engine) as s:
        doctor = s.exec(select(Doctor).where(Doctor.status == RecordStatus.ACTIVE)).first()
        if doctor is None:
            raise SystemExit("No hay un médico activo; no se puede sembrar.")
        actor = doctor.user_id  # created_by / updated_by
        snapshot = {f: getattr(doctor, f, None) for f in _SNAPSHOT_FIELDS}

        already = s.exec(
            select(Patient).where(Patient.email.like(f"%@{SEED_EMAIL_DOMAIN}"))
        ).first()
        if already is not None and os.environ.get("SEED_FORCE") != "1":
            print("Ya existen pacientes de demo (email @demo.seed). Usa SEED_FORCE=1 para forzar.")
            return

        audit = {"created_by": actor, "updated_by": actor}

        # 1) Plantillas de receta del médico (idempotente por nombre).
        existing_templates = {
            t.medication_name
            for t in s.exec(select(MedicationTemplate).where(MedicationTemplate.doctor_id == doctor.id)).all()
        }
        for name, pres, dose, freq, dur, instr in MED_TEMPLATES:
            if name in existing_templates:
                continue
            s.add(MedicationTemplate(
                doctor_id=doctor.id, medication_name=name, presentation=pres,
                default_dose=dose, default_frequency=freq, default_duration=dur,
                default_instructions=instr, use_count=random.randint(0, 25),
                status=RecordStatus.ACTIVE, **audit,
            ))
        s.flush()

        counts = {k: 0 for k in (
            "patients", "consultations", "diagnoses", "vitals", "notes", "labs",
            "prescriptions", "items", "studies", "tasks", "appointments",
            "history", "immunizations", "events", "documents",
        )}

        n_patients = 10
        for i in range(n_patients):
            sex = random.choice([Sex.FEMALE, Sex.MALE])
            age = random.randint(3, 82)
            bdate = date(NOW.year - age, random.randint(1, 12), random.randint(1, 28))
            is_pregnant = sex == Sex.FEMALE and 18 <= age <= 42 and random.random() < 0.2
            patient = Patient(
                full_name=_rand_name(sex),
                birth_date=bdate,
                sex=sex,
                phone=f"55{random.randint(10000000, 99999999)}",
                email=f"paciente{i + 1}@{SEED_EMAIL_DOMAIN}",
                address=f"Calle {random.choice(SURNAMES)} #{random.randint(1, 500)}, CDMX",
                occupation=random.choice(["Docente", "Comerciante", "Ingeniero", "Estudiante",
                                          "Empleado", "Ama de casa", "Jubilado", "Enfermero"]),
                marital_status=random.choice(["Soltero(a)", "Casado(a)", "Unión libre", "Viudo(a)"]),
                emergency_contact_name=_rand_name(random.choice([Sex.FEMALE, Sex.MALE])),
                emergency_contact_relationship=random.choice(["Cónyuge", "Padre", "Madre", "Hermano(a)", "Hijo(a)"]),
                emergency_contact_phone=f"55{random.randint(10000000, 99999999)}",
                status=PatientStatus.ACTIVE,
                pregnancy_status=PregnancyStatus.PREGNANT if is_pregnant else PregnancyStatus.NONE,
                pregnancy_since=(NOW.date() - timedelta(days=random.randint(30, 240))) if is_pregnant else None,
                **audit,
            )
            s.add(patient)
            s.flush()
            counts["patients"] += 1

            # 2) Antecedentes (varias categorías).
            for cat, desc in [
                (PatientHistoryItemCategory.PATOLOGICO, "Hipertensión arterial en tratamiento"),
                (PatientHistoryItemCategory.FAMILIAR, "Diabetes mellitus tipo 2 (línea materna)"),
                (PatientHistoryItemCategory.QUIRURGICO, "Apendicectomía"),
                (PatientHistoryItemCategory.NO_PATOLOGICO, "Tabaquismo negado. Alcohol ocasional."),
            ]:
                if random.random() < 0.7:
                    s.add(PatientHistoryItem(
                        patient_id=patient.id, category=cat, description=desc,
                        notes="Registro de demostración.", **audit,
                    ))
                    counts["history"] += 1

            # 3) Inmunizaciones.
            for vac, route in [("Influenza estacional", ImmunizationRoute.INTRAMUSCULAR),
                               ("Tétanos-difteria (Td)", ImmunizationRoute.INTRAMUSCULAR),
                               ("COVID-19 (refuerzo)", ImmunizationRoute.INTRAMUSCULAR)]:
                if random.random() < 0.7:
                    s.add(PatientImmunization(
                        patient_id=patient.id, vaccine_name=vac,
                        dose_number=random.randint(1, 3),
                        administered_on=NOW.date() - timedelta(days=random.randint(30, 900)),
                        status=ImmunizationStatus.APLICADA, route=route,
                        lot_number=f"LOT{random.randint(1000, 9999)}",
                        site=random.choice(["Deltoides izquierdo", "Deltoides derecho"]),
                        **audit,
                    ))
                    counts["immunizations"] += 1

            # 4) Evento clínico (algunos pacientes).
            if random.random() < 0.4:
                start = NOW - timedelta(days=random.randint(60, 700))
                etype = random.choice(list(ClinicalEventType))
                s.add(ClinicalEvent(
                    patient_id=patient.id, event_type=etype,
                    title=f"{etype.value.capitalize()} previa",
                    description="Evento clínico de demostración en la línea de tiempo.",
                    started_at=start, ended_at=start + timedelta(days=random.randint(1, 6)),
                    status=ClinicalEventStatus.RESOLVED, **audit,
                ))
                counts["events"] += 1

            # 5) Documento clínico.
            if random.random() < 0.6:
                content = _fake_file("LAB")
                s.add(ClinicalDocument(
                    patient_id=patient.id,
                    document_type=random.choice([ClinicalDocumentType.LABORATORY,
                                                 ClinicalDocumentType.STUDY,
                                                 ClinicalDocumentType.PDF]),
                    status=ClinicalDocumentStatus.ACTIVE,
                    original_filename=f"resultado_{random.randint(100, 999)}.pdf",
                    file_content=content, mime_type="application/pdf",
                    size_bytes=len(content), sha256=hashlib.sha256(content).hexdigest(),
                    document_date=NOW.date() - timedelta(days=random.randint(1, 200)),
                    description="Documento de demostración.", uploaded_by=actor,
                ))
                counts["documents"] += 1

            # 6) Consultas (1-3), algunas finalizadas.
            for c in range(random.randint(1, 3)):
                consulted = NOW - timedelta(days=random.randint(1, 400), hours=random.randint(0, 8))
                finalized = random.random() < 0.6
                reason = random.choice(REASONS)
                consultation = Consultation(
                    patient_id=patient.id, attending_doctor_id=doctor.id,
                    consulted_at=consulted, reason_for_visit=reason,
                    current_illness="Paciente refiere sintomatología de varios días de evolución.",
                    interrogation="Interrogatorio por aparatos y sistemas sin datos de alarma.",
                    physical_examination="Signos vitales estables. Exploración física dentro de parámetros.",
                    clinical_assessment="Cuadro compatible con el diagnóstico integrado.",
                    treatment="Manejo farmacológico y medidas generales.",
                    instructions="Reposo relativo, hidratación y datos de alarma explicados.",
                    prognosis="Bueno para la vida y la función.",
                    follow_up_plan="Cita de control en 2 semanas o antes si empeora.",
                    status=ConsultationStatus.FINALIZED if finalized else ConsultationStatus.DRAFT,
                    finalized_by_doctor_id=doctor.id if finalized else None,
                    finalized_at=consulted + timedelta(minutes=40) if finalized else None,
                    **audit,
                )
                s.add(consultation)
                s.flush()
                counts["consultations"] += 1

                # Diagnóstico(s).
                dx_text, dx_code, dx_kind = random.choice(DIAGNOSES)
                diag = ConsultationDiagnosis(
                    consultation_id=consultation.id,
                    diagnosis_kind=ConsultationDiagnosisKind(dx_kind),
                    diagnosis_text=dx_text, coding_system="cie10", code=dx_code,
                    notes="Impresión diagnóstica de demostración.", **audit,
                )
                s.add(diag)
                s.flush()
                counts["diagnoses"] += 1

                # Signos vitales.
                s.add(VitalSign(
                    consultation_id=consultation.id, measured_at=consulted,
                    weight_kg=round(random.uniform(45, 105), 1),
                    height_cm=round(random.uniform(150, 185), 1),
                    temperature_c=round(random.uniform(36.0, 38.5), 1),
                    systolic_bp=random.randint(100, 160), diastolic_bp=random.randint(60, 100),
                    heart_rate_bpm=random.randint(58, 110), respiratory_rate_rpm=random.randint(12, 22),
                    oxygen_saturation=round(random.uniform(90, 99), 0),
                    capillary_glucose=round(random.uniform(80, 200), 0),
                    pain_scale=random.randint(0, 7),
                    observations="Toma de demostración.", **audit,
                ))
                counts["vitals"] += 1

                # Nota SOAP.
                s.add(ClinicalNote(
                    patient_id=patient.id, consultation_id=consultation.id,
                    kind=ClinicalNoteKind.NOTA_SOAP,
                    status=ClinicalNoteStatus.APPROVED if finalized else ClinicalNoteStatus.DRAFT,
                    subjective=f"Paciente acude por {reason.lower()}.",
                    objective="Exploración física sin datos de gravedad. Signos vitales estables.",
                    assessment=dx_text,
                    plan="Se indica tratamiento farmacológico y medidas generales. Cita de control.",
                    **audit,
                ))
                counts["notes"] += 1

                # Laboratorios (2-3 analitos).
                for name, unit, lo, hi, code in random.sample(LAB_PANEL, k=random.randint(2, 3)):
                    val = round(random.uniform(lo * 0.6 if lo else 20, hi * 1.6), 1)
                    flag = LabResultAbnormalFlag.HIGH if val > hi else (
                        LabResultAbnormalFlag.LOW if lo and val < lo else LabResultAbnormalFlag.NORMAL)
                    s.add(LabResult(
                        patient_id=patient.id, consultation_id=consultation.id,
                        analyte_name=name, analyte_code=code, value_numeric=val, unit=unit,
                        reference_range_low=lo or None, reference_range_high=hi,
                        abnormal_flag=flag, measured_at=consulted,
                        source_name="Laboratorio Demo", method="Automatizado", **audit,
                    ))
                    counts["labs"] += 1

                # Receta + renglones (draft o aprobada; permitida aun si la consulta está finalizada).
                # El CHECK ck_prescriptions_prescription_status_state exige que un draft tenga los
                # campos de aprobación en SQL NULL: por eso se OMITEN (JSONB convertiría None→'null').
                approved = finalized and random.random() < 0.7
                rx_kwargs = dict(
                    consultation_id=consultation.id, related_diagnosis_id=diag.id,
                    observations="Indicaciones entregadas al paciente.",
                    status=PrescriptionStatus.APPROVED if approved else PrescriptionStatus.DRAFT,
                    **audit,
                )
                if approved:
                    rx_kwargs.update(
                        doctor_snapshot=snapshot,
                        approved_by_doctor_id=doctor.id,
                        approved_at=consulted + timedelta(minutes=45),
                    )
                rx = Prescription(**rx_kwargs)
                s.add(rx)
                s.flush()
                counts["prescriptions"] += 1
                for pos, (mname, pres, dose, freq, dur, instr) in enumerate(
                    random.sample(MED_TEMPLATES, k=random.randint(1, 3)), start=1
                ):
                    s.add(PrescriptionItem(
                        prescription_id=rx.id, position=pos, medication_name=mname,
                        presentation=pres, dose=dose, frequency=freq, duration=dur,
                        instructions=instr, **audit,
                    ))
                    counts["items"] += 1

                # Orden de estudio.
                if random.random() < 0.5:
                    sname, scode = random.choice(STUDIES)
                    s.add(StudyOrder(
                        patient_id=patient.id, ordered_by=doctor.id, study_name=sname, code=scode,
                        reason="Apoyo diagnóstico.", ordered_at=consulted,
                        status=random.choice([StudyOrderStatus.PENDING, StudyOrderStatus.RESULTED]),
                        **audit,
                    ))
                    counts["studies"] += 1

            # 7) Tareas clínicas de seguimiento.
            for _ in range(random.randint(1, 2)):
                open_task = random.random() < 0.6
                s.add(ClinicalTask(
                    owner_id=actor, patient_id=patient.id,
                    title=random.choice(["Llamar para resultados", "Revisar laboratorios",
                                         "Confirmar cita de control", "Verificar apego a tratamiento"]),
                    description="Tarea de seguimiento de demostración.",
                    due_at=NOW + timedelta(days=random.randint(-5, 20)),
                    priority=random.choice(list(ClinicalTaskPriority)),
                    status=ClinicalTaskStatus.OPEN if open_task else ClinicalTaskStatus.DONE,
                    **audit,
                ))
                counts["tasks"] += 1

            # 8) Citas (pasada y futura).
            for offset, st in [(-random.randint(5, 60), AppointmentStatus.ATTENDED),
                               (random.randint(2, 40), AppointmentStatus.CONFIRMED)]:
                d = NOW.date() + timedelta(days=offset)
                s.add(Appointment(
                    patient_id=patient.id, doctor_id=doctor.id,
                    reason=random.choice(REASONS), duration_minutes=random.choice([20, 30, 45]),
                    status=st, scheduled_date=d,
                    scheduled_time=time(random.randint(8, 18), random.choice([0, 15, 30, 45])),
                    internal_notes="Cita de demostración.", **audit,
                ))
                counts["appointments"] += 1

        s.commit()
        print("Siembra completada:")
        for k, v in counts.items():
            print(f"  {k:>14}: {v}")


# --- Catálogos y datos clínicos complementarios -----------------------------------

CLINICAL_CODES = [
    (ClinicalCodeSystem.CIE10, "I10", "Hipertensión esencial (primaria)"),
    (ClinicalCodeSystem.CIE10, "E11.9", "Diabetes mellitus tipo 2 sin complicaciones"),
    (ClinicalCodeSystem.CIE10, "J06.9", "Infección aguda de vías respiratorias superiores"),
    (ClinicalCodeSystem.CIE10, "M54.5", "Lumbalgia"),
    (ClinicalCodeSystem.CIE10, "J02.9", "Faringitis aguda"),
    (ClinicalCodeSystem.CIE10, "E78.5", "Hiperlipidemia no especificada"),
    (ClinicalCodeSystem.LOINC, "2345-7", "Glucosa en suero o plasma"),
    (ClinicalCodeSystem.LOINC, "4548-4", "Hemoglobina glicosilada A1c"),
    (ClinicalCodeSystem.LOINC, "2093-3", "Colesterol total"),
    (ClinicalCodeSystem.LOINC, "718-7", "Hemoglobina"),
    (ClinicalCodeSystem.ATC, "N02BE01", "Paracetamol"),
    (ClinicalCodeSystem.ATC, "J01CA04", "Amoxicilina"),
    (ClinicalCodeSystem.ATC, "C09CA01", "Losartán"),
    (ClinicalCodeSystem.ATC, "A10BA02", "Metformina"),
]

INSTITUTIONAL_SETTINGS = [
    ("vital.systolic_bp.max", SettingCategory.VITAL_THRESHOLD, {"max": 140, "unit": "mmHg"},
     "Umbral superior de presión arterial sistólica para marcar revisión."),
    ("vital.temperature.max", SettingCategory.VITAL_THRESHOLD, {"max": 38.0, "unit": "C"},
     "Temperatura por encima de la cual se considera fiebre."),
    ("vital.oxygen_saturation.min", SettingCategory.VITAL_THRESHOLD, {"min": 92, "unit": "%"},
     "Saturación de oxígeno mínima aceptable."),
    ("lab.hba1c.target", SettingCategory.LAB_TARGET, {"max": 7.0, "unit": "%"},
     "Meta de control glucémico (HbA1c) para pacientes diabéticos."),
    ("followup.default_days", SettingCategory.FOLLOW_UP, {"days": 14},
     "Días por defecto para agendar cita de control."),
    ("protocol.htas.review_days", SettingCategory.PROTOCOL, {"days": 30},
     "Periodicidad de revisión para pacientes hipertensos."),
]

CLINICAL_ITEMS = [
    (PatientClinicalItemType.ALLERGY, "Alergia a penicilina", "Reacción cutánea documentada.",
     ClinicalSeverity.HIGH),
    (PatientClinicalItemType.CHRONIC_CONDITION, "Hipertensión arterial", "En tratamiento con losartán.",
     ClinicalSeverity.MODERATE),
    (PatientClinicalItemType.CURRENT_MEDICATION, "Metformina 850 mg", "Cada 12 horas.", None),
    (PatientClinicalItemType.RELEVANT_HABIT, "Tabaquismo", "5 cigarrillos/día.", ClinicalSeverity.MODERATE),
    (PatientClinicalItemType.CLINICAL_ALERT, "Riesgo de caídas", "Antecedente de mareo ortostático.",
     ClinicalSeverity.HIGH),
]

SCALES = [
    ("qsofa", {"altered_mentation": False, "respiratory_rate_ge_22": True, "systolic_bp_le_100": False},
     1, "Bajo riesgo (qSOFA 1)"),
    ("curb65", {"confusion": False, "urea_gt_7": False, "respiratory_rate_ge_30": False,
                "low_bp": True, "age_ge_65": True}, 2, "Riesgo intermedio (CURB-65 2)"),
]


def seed_extras() -> None:
    """Llena las tablas clínicas complementarias que quedaron vacías. Guardas propias por
    tabla → se puede correr aunque los pacientes demo ya existan."""
    with Session(engine) as s:
        doctor = s.exec(select(Doctor).where(Doctor.status == RecordStatus.ACTIVE)).first()
        if doctor is None:
            raise SystemExit("No hay un médico activo; no se puede sembrar.")
        actor = doctor.user_id
        audit = {"created_by": actor, "updated_by": actor}
        force = os.environ.get("SEED_FORCE") == "1"
        counts = {k: 0 for k in ("codes", "settings", "clinical_items", "history_versions",
                                 "scales", "ai_outputs")}

        # 1) Catálogo de códigos clínicos (guarda: sólo si vacío).
        if force or s.exec(select(ClinicalCode)).first() is None:
            for system, code, term in CLINICAL_CODES:
                s.add(ClinicalCode(system=system, code=code, display_term=term, **audit))
                counts["codes"] += 1

        # 2) Configuración institucional (guarda: sólo si vacío).
        if force or s.exec(select(InstitutionalSetting)).first() is None:
            for key, cat, value, desc in INSTITUTIONAL_SETTINGS:
                s.add(InstitutionalSetting(
                    key=key, category=cat, value=value, description=desc, **audit))
                counts["settings"] += 1

        # 3-6) Datos por paciente demo (guarda: sólo si patient_clinical_items vacío).
        if force or s.exec(select(PatientClinicalItem)).first() is None:
            patients = s.exec(
                select(Patient).where(Patient.email.like(f"%@{SEED_EMAIL_DOMAIN}"))
            ).all()
            for idx, patient in enumerate(patients):
                # Resumen clínico: subconjunto variable de items (alergias, crónicos, etc.).
                for item_type, title, details, severity in random.sample(
                    CLINICAL_ITEMS, k=random.randint(2, len(CLINICAL_ITEMS))
                ):
                    s.add(PatientClinicalItem(
                        patient_id=patient.id, item_type=item_type, title=title, details=details,
                        severity=severity, status=ClinicalItemStatus.ACTIVE,
                        started_on=NOW.date() - timedelta(days=random.randint(60, 1500)),
                        **audit,
                    ))
                    counts["clinical_items"] += 1

                # Historia clínica: una versión CURRENT por paciente.
                s.add(MedicalHistoryVersion(
                    patient_id=patient.id, version_number=1,
                    status=MedicalHistoryVersionStatus.CURRENT,
                    family_history="Madre con diabetes mellitus tipo 2. Padre con hipertensión.",
                    pathological_history="Hipertensión arterial de 5 años de evolución.",
                    non_pathological_history="Tabaquismo ocasional. Alcohol social. Ejercicio 2x/semana.",
                    previous_surgeries="Apendicectomía en la infancia.",
                    hospitalizations="Sin hospitalizaciones recientes relevantes.",
                    relevant_habits="Alimentación mixta. Sueño de 6-7 horas.",
                    gyneco_obstetric_history="No aplica / sin datos relevantes.",
                    clinical_observations="Paciente con adecuado apego a tratamiento.",
                    reviewed_by_doctor_id=doctor.id, reviewed_at=NOW - timedelta(days=idx + 1),
                    **audit,
                ))
                counts["history_versions"] += 1

                # Consultas del paciente para anclar escalas y salidas de IA.
                consultations = s.exec(
                    select(Consultation).where(Consultation.patient_id == patient.id)
                ).all()

                # Resultados de escalas clínicas (1-2 por paciente).
                for scale_id, inputs, score, label in random.sample(SCALES, k=random.randint(1, 2)):
                    cons = random.choice(consultations) if consultations else None
                    s.add(ScaleResult(
                        patient_id=patient.id,
                        consultation_id=cons.id if cons else None,
                        scale_id=scale_id, inputs=inputs, score=score,
                        interpretation_label=label,
                        source="Cálculo determinista de demostración (fuente citada en la escala).",
                        computed_at=NOW - timedelta(days=random.randint(1, 120)),
                        **audit,
                    ))
                    counts["scales"] += 1

                # Salida del copiloto de IA (borrador) en alguna consulta.
                if consultations and random.random() < 0.8:
                    cons = random.choice(consultations)
                    s.add(ConsultationAiOutput(
                        consultation_id=cons.id,
                        output_type=random.choice([ConsultationAiOutputType.CLINICAL_NOTE,
                                                   ConsultationAiOutputType.SUMMARY,
                                                   ConsultationAiOutputType.SUGGESTION]),
                        content="Borrador generado por el copiloto para revisión del médico. "
                                "No sustituye el juicio clínico ni se guarda de forma autónoma.",
                        status=AiOutputStatus.DRAFT,
                        model_name="claude-haiku-4-5", model_version="2025-10-01",
                        generation_metadata={"provider": "opencode_zen", "demo": True},
                        **audit,
                    ))
                    counts["ai_outputs"] += 1

        s.commit()
        print("Complemento clínico sembrado:")
        for k, v in counts.items():
            print(f"  {k:>16}: {v}")


if __name__ == "__main__":
    seed()
    seed_extras()
