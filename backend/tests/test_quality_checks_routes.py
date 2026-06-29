"""Tests de las verificaciones de calidad/seguridad clínica (NUEVO CLUSTER, fase 1).

Dos bloques:
  - ``QualityRulesUnitTest``: reglas PURAS (sin BD) — cada regla DISPARA en un caso malo
    fabricado y queda EN SILENCIO en un caso bueno; los umbrales son los citados.
  - ``QualityChecksRoutesTest``: el endpoint POST /quality/check contra Postgres real
    (sólo si TEST_POSTGRES_URL apunta a una base *_test). Verifica que se marquen las
    incidencias correctas, que un objetivo inexistente dé 404, RBAC, y que NO se mute nada.
"""

import os
import unittest
import uuid
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import urlparse


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "MedicoPilot Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "medicopilot",
}

os.environ.update(DEV_ENV)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, delete  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.core.settings import settings  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ClinicalItemStatus,
    ConsultationStatus,
    PatientClinicalItemType,
    Sex,
)
from backend.app.models.lab_result import LabResult  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.patient_clinical_item import PatientClinicalItem  # noqa: E402
from backend.app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.models.vital_sign import VitalSign  # noqa: E402
from backend.app.quality_checks import (  # noqa: E402
    DRUG_ALLERGY_UNAVAILABLE_REF,
    DRUG_INTERACTION_UNAVAILABLE_REF,
    RULE_CONSULTATION_NOTE_INCOMPLETE,
    RULE_DRUG_ALLERGY,
    RULE_DRUG_INTERACTION,
    RULE_DUPLICATE_MEDICATION,
    RULE_LAB_VALUE_NON_PHYSICAL,
    RULE_PRESCRIPTION_ITEM_INCOMPLETE,
    RULE_RENAL_DOSE,
    RULE_VITALS_OUT_OF_RANGE,
    InteractionFinding,
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
    resolve_pharmacology,
)
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class QualityRulesUnitTest(unittest.TestCase):
    """Reglas puras: disparan en lo malo, callan en lo bueno; umbrales citados."""

    def test_permission_declared(self) -> None:
        self.assertIn("quality_checks:read", declared_permissions())

    def test_vitals_fire_out_of_range_and_silent_when_plausible(self) -> None:
        bad = VitalSign(
            id=uuid.uuid4(), consultation_id=uuid.uuid4(), measured_at=datetime(2026, 1, 1),
            systolic_bp=400, diastolic_bp=80, temperature_c=Decimal("98.6"),  # 98.6 °F mal capturado
        )
        flags = check_vital_sign(bad)
        rules = {f.rule_id for f in flags}
        self.assertEqual(rules, {RULE_VITALS_OUT_OF_RANGE})
        # Cita el umbral en cada bandera.
        self.assertTrue(all(f.threshold_cited for f in flags))
        fields = {f.source_ref.split(".")[-1] for f in flags}
        self.assertIn("systolic_bp", fields)
        self.assertIn("temperature_c", fields)
        self.assertTrue(any("40–300" in (f.threshold_cited or "") for f in flags))

        good = VitalSign(
            id=uuid.uuid4(), consultation_id=uuid.uuid4(), measured_at=datetime(2026, 1, 1),
            systolic_bp=120, diastolic_bp=80, temperature_c=Decimal("36.7"),
            heart_rate_bpm=72, respiratory_rate_rpm=16, oxygen_saturation=Decimal("98"),
        )
        self.assertEqual(check_vital_sign(good), [])

    def test_lab_fires_on_negative_and_silent_on_normal(self) -> None:
        bad = LabResult(
            id=uuid.uuid4(), patient_id=uuid.uuid4(), analyte_name="Hemoglobina",
            value_numeric=Decimal("-5"), unit="g/dL", measured_at=datetime(2026, 1, 1),
        )
        flags = check_lab_result(bad)
        self.assertEqual({f.rule_id for f in flags}, {RULE_LAB_VALUE_NON_PHYSICAL})
        self.assertTrue(all(f.threshold_cited for f in flags))

        # Un valor alto pero FÍSICO (anormal, no imposible) NO se marca.
        normal = LabResult(
            id=uuid.uuid4(), patient_id=uuid.uuid4(), analyte_name="Glucosa",
            value_numeric=Decimal("450"), unit="mg/dL", measured_at=datetime(2026, 1, 1),
        )
        self.assertEqual(check_lab_result(normal), [])

    def test_consultation_note_fires_on_empty_draft_and_silent_when_complete(self) -> None:
        draft = Consultation(
            id=uuid.uuid4(), patient_id=uuid.uuid4(), attending_doctor_id=uuid.uuid4(),
            consulted_at=datetime(2026, 1, 1), reason_for_visit="Dolor",
            status=ConsultationStatus.DRAFT,
        )
        flags = check_consultation_note(draft)
        self.assertEqual({f.rule_id for f in flags}, {RULE_CONSULTATION_NOTE_INCOMPLETE})
        # S/O/A + Plan -> cuatro banderas.
        self.assertEqual(len(flags), 4)

        complete = Consultation(
            id=uuid.uuid4(), patient_id=uuid.uuid4(), attending_doctor_id=uuid.uuid4(),
            consulted_at=datetime(2026, 1, 1), reason_for_visit="Dolor",
            status=ConsultationStatus.DRAFT, current_illness="Inicia hace 2 días.",
            physical_examination="Sin hallazgos.", clinical_assessment="Cuadro viral.",
            treatment="Sintomático.",
        )
        self.assertEqual(check_consultation_note(complete), [])

    def test_consultation_note_silent_when_finalized(self) -> None:
        # Una consulta finalizada (firmada) no aplica a la regla de pre-firma.
        finalized = Consultation(
            id=uuid.uuid4(), patient_id=uuid.uuid4(), attending_doctor_id=uuid.uuid4(),
            consulted_at=datetime(2026, 1, 1), reason_for_visit="Dolor",
            status=ConsultationStatus.FINALIZED,
        )
        self.assertEqual(check_consultation_note(finalized), [])

    def test_prescription_item_fires_on_missing_dose_or_frequency(self) -> None:
        incomplete = PrescriptionItem(
            id=uuid.uuid4(), prescription_id=uuid.uuid4(), position=1,
            medication_name="Paracetamol",
        )
        flags = check_prescription_item(incomplete)
        self.assertEqual({f.rule_id for f in flags}, {RULE_PRESCRIPTION_ITEM_INCOMPLETE})
        fields = {f.source_ref.split(".")[-1] for f in flags}
        self.assertEqual(fields, {"dose", "frequency"})

        complete = PrescriptionItem(
            id=uuid.uuid4(), prescription_id=uuid.uuid4(), position=1,
            medication_name="Paracetamol", dose="500 mg", frequency="cada 8 horas",
        )
        self.assertEqual(check_prescription_item(complete), [])

    # --- fase 2: cruce fármaco-alergia + duplicidad ---

    def test_drug_allergy_fires_on_overlap_and_silent_when_disjoint(self) -> None:
        med = ResolvedDrug(ref="prescription_item:1", label="Ibuprofeno 400 mg",
                           ingredients=frozenset({"ibuprofeno"}), classes=frozenset({"aine"}))
        allergy_match = ResolvedDrug(ref="patient_clinical_item:1", label="AINEs",
                                     classes=frozenset({"aine"}))
        flags = check_drug_allergy([med], [allergy_match], source_available=True)
        self.assertEqual({f.rule_id for f in flags}, {RULE_DRUG_ALLERGY})
        self.assertEqual(flags[0].severity.value, "warning")
        self.assertIn("aine", flags[0].source_ref)  # cita lo coincidente
        self.assertTrue(flags[0].threshold_cited)

        allergy_other = ResolvedDrug(ref="patient_clinical_item:2", label="Penicilina",
                                     ingredients=frozenset({"penicilina"}),
                                     classes=frozenset({"penicilina"}))
        self.assertEqual(check_drug_allergy([med], [allergy_other], source_available=True), [])

    def test_drug_allergy_reports_no_disponible_when_source_unavailable(self) -> None:
        med = ResolvedDrug(ref="prescription_item:1", label="X")
        allergy = ResolvedDrug(ref="patient_clinical_item:1", label="Y")
        flags = check_drug_allergy([med], [allergy], source_available=False)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0].rule_id, RULE_DRUG_ALLERGY)
        self.assertEqual(flags[0].severity.value, "info")
        self.assertEqual(flags[0].source_ref, DRUG_ALLERGY_UNAVAILABLE_REF)
        # Nunca fabrica una coincidencia ni concluye ausencia.
        self.assertIn("no disponible", flags[0].message_es.lower())

    def test_duplicate_medications_fires_on_dup_and_silent_on_unique(self) -> None:
        dup = check_duplicate_medications([
            ("prescription_item:1", "Paracetamol"),
            ("prescription_item:2", "paracetamol"),  # mismo nombre normalizado
        ])
        self.assertEqual({f.rule_id for f in dup}, {RULE_DUPLICATE_MEDICATION})
        self.assertIn("prescription_item:1", dup[0].source_ref)
        self.assertIn("prescription_item:2", dup[0].source_ref)

        unique = check_duplicate_medications([
            ("prescription_item:1", "Paracetamol"),
            ("prescription_item:2", "Ibuprofeno"),
        ])
        self.assertEqual(unique, [])

    def test_pharmacology_resolver_stub_and_unconfigured(self) -> None:
        original = settings.pharma_mcp_server_url
        try:
            settings.pharma_mcp_server_url = "stub://pharma"
            res = resolve_pharmacology("Ibuprofeno 400 mg")
            self.assertTrue(res.available)
            self.assertIn("aine", res.classes)  # resuelve clase del stub
            # No cubierto por el stub -> disponible pero sin coincidencias (no es 'no disponible').
            none = resolve_pharmacology("Fármaco Inexistente XYZ")
            self.assertTrue(none.available)
            self.assertEqual(none.ingredients, frozenset())
            settings.pharma_mcp_server_url = None
            off = resolve_pharmacology("Ibuprofeno")
            self.assertFalse(off.available)  # sin fuente -> no disponible
        finally:
            settings.pharma_mcp_server_url = original

    # --- fase 3: interacciones fármaco-fármaco ---

    def test_drug_interaction_fires_only_on_reported_pair(self) -> None:
        interacting = InteractionFinding(
            ref_a="prescription_item:1", label_a="Warfarina 5 mg",
            ref_b="prescription_item:2", label_b="Ibuprofeno 400 mg",
            interacts=True, severity="grave", source="AINE + anticoagulante.",
        )
        no_interaction = InteractionFinding(
            ref_a="prescription_item:1", label_a="Warfarina",
            ref_b="prescription_item:3", label_b="Paracetamol",
            interacts=False,
        )
        flags = check_drug_interactions([interacting, no_interaction], available=True)
        self.assertEqual({f.rule_id for f in flags}, {RULE_DRUG_INTERACTION})
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0].severity.value, "warning")
        self.assertIn("Warfarina", flags[0].message_es)
        self.assertIn("grave", flags[0].message_es)  # cita la severidad que dio la fuente
        self.assertIn("prescription_item:1", flags[0].source_ref)
        self.assertIn("prescription_item:2", flags[0].source_ref)
        self.assertEqual(flags[0].threshold_cited, "AINE + anticoagulante.")

    def test_drug_interaction_no_disponible_when_unavailable(self) -> None:
        flags = check_drug_interactions([], available=False)
        self.assertEqual(len(flags), 1)
        self.assertEqual(flags[0].rule_id, RULE_DRUG_INTERACTION)
        self.assertEqual(flags[0].severity.value, "info")
        self.assertEqual(flags[0].source_ref, DRUG_INTERACTION_UNAVAILABLE_REF)
        self.assertIn("no disponible", flags[0].message_es.lower())

    def test_interaction_resolver_stub_and_unconfigured(self) -> None:
        original = settings.pharma_mcp_server_url
        try:
            settings.pharma_mcp_server_url = "stub://pharma"
            hit = check_interaction("Warfarina 5 mg", "Ibuprofeno 400 mg")
            self.assertTrue(hit.available)
            self.assertTrue(hit.interacts)  # par conocido por el stub de prueba
            self.assertTrue(hit.severity)
            self.assertTrue(hit.source)
            # Par sin interacción conocida: disponible, pero NO interactúa (no se inventa).
            miss = check_interaction("Paracetamol", "Metformina 850 mg")
            self.assertTrue(miss.available)
            self.assertFalse(miss.interacts)
            # Sin fuente -> no disponible (jamás infiere).
            settings.pharma_mcp_server_url = None
            off = check_interaction("Warfarina", "Ibuprofeno")
            self.assertFalse(off.available)
            self.assertFalse(off.interacts)
        finally:
            settings.pharma_mcp_server_url = original

    # --- fase 3: ajuste de dosis renal ---

    def test_renal_dose_fires_below_threshold_and_silent_normal(self) -> None:
        egfr_low = RenalFunction(value=25.0, unit="mL/min/1.73m2",
                                 source_ref="lab_result:1", measured_label="eGFR del 2026-04-01")
        metformina = ResolvedDrug(ref="prescription_item:1", label="Metformina 850 mg",
                                  ingredients=frozenset({"metformina"}))
        flags = check_renal_dose(egfr_low, [metformina])
        self.assertEqual({f.rule_id for f in flags}, {RULE_RENAL_DOSE})
        self.assertEqual(flags[0].severity.value, "warning")
        self.assertIn("Metformina", flags[0].message_es)
        self.assertIn("lab_result:1", flags[0].source_ref)
        self.assertTrue(flags[0].threshold_cited)  # cita umbral + fuente + valor

        # eGFR normal (90): no dispara.
        egfr_ok = RenalFunction(value=90.0, unit="mL/min/1.73m2",
                                source_ref="lab_result:2", measured_label="eGFR del 2026-04-01")
        self.assertEqual(check_renal_dose(egfr_ok, [metformina]), [])

    def test_renal_dose_silent_when_egfr_absent_and_matches_by_name(self) -> None:
        # Sin eGFR -> NO dispara (no fabrica el dato).
        metformina = ResolvedDrug(ref="prescription_item:1", label="Metformina 850 mg")
        self.assertEqual(check_renal_dose(None, [metformina]), [])

        # Sin ingredientes resueltos (fuente caída), empareja por NOMBRE normalizado.
        egfr_low = RenalFunction(value=20.0, unit=None,
                                 source_ref="lab_result:1", measured_label="eGFR del 2026-04-01")
        flags = check_renal_dose(egfr_low, [metformina])
        self.assertEqual({f.rule_id for f in flags}, {RULE_RENAL_DOSE})

        # Un fármaco que NO es de la tabla renal no dispara aunque el eGFR sea bajo.
        paracetamol = ResolvedDrug(ref="prescription_item:2", label="Paracetamol 500 mg",
                                   ingredients=frozenset({"paracetamol"}))
        self.assertEqual(check_renal_dose(egfr_low, [paracetamol]), [])


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class QualityChecksRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.doctor_id = uuid.uuid4()
        # Consulta "sucia": borrador con nota incompleta + un signo vital imposible.
        cls.bad_consultation_id = uuid.uuid4()
        # Consulta "limpia": borrador con SOAP completo y signos vitales plausibles.
        cls.clean_consultation_id = uuid.uuid4()
        cls.prescription_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Admin", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Doctor(id=cls.doctor_id, user_id=cls.actor_id,
                               professional_name="Dra. House",
                               professional_license_number=f"LIC-{cls.doctor_id}"))
            session.add(Patient(id=cls.patient_id, full_name="Paciente QA",
                                birth_date=date(1980, 1, 1), sex=Sex.MALE))
            session.flush()  # asegura paciente/médico antes de las filas dependientes
            # Consulta sucia (borrador, nota vacía salvo el motivo NOT NULL).
            session.add(Consultation(id=cls.bad_consultation_id, patient_id=cls.patient_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 1, 1, 10, 0),
                                     reason_for_visit="Dolor torácico",
                                     status=ConsultationStatus.DRAFT))
            session.flush()  # consulta antes de signos/labs/recetas que la referencian
            # TA sistólica 400 (imposible) y temperatura 98.6 (°F mal capturados). Respeta los
            # CHECK de la tabla (sistólica>=diastólica, temp>0).
            session.add(VitalSign(id=uuid.uuid4(), consultation_id=cls.bad_consultation_id,
                                  measured_at=datetime(2026, 1, 1, 10, 5),
                                  systolic_bp=400, diastolic_bp=80,
                                  temperature_c=Decimal("98.6")))
            # Lab negativo del paciente (físicamente imposible).
            session.add(LabResult(id=uuid.uuid4(), patient_id=cls.patient_id,
                                  consultation_id=cls.bad_consultation_id,
                                  analyte_name="Hemoglobina", value_numeric=Decimal("-5"),
                                  unit="g/dL", measured_at=datetime(2026, 1, 1, 9, 0)))
            # Receta en borrador con un medicamento sin dosis ni frecuencia.
            session.add(Prescription(id=cls.prescription_id,
                                     consultation_id=cls.bad_consultation_id))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.prescription_id,
                                         position=1, medication_name="Paracetamol"))
            # Consulta limpia.
            session.add(Consultation(id=cls.clean_consultation_id, patient_id=cls.patient_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 2, 1, 10, 0),
                                     reason_for_visit="Control",
                                     status=ConsultationStatus.DRAFT,
                                     current_illness="Estable.",
                                     physical_examination="Normal.",
                                     clinical_assessment="Sano.", treatment="Ninguno."))
            session.add(VitalSign(id=uuid.uuid4(), consultation_id=cls.clean_consultation_id,
                                  measured_at=datetime(2026, 2, 1, 10, 5),
                                  systolic_bp=120, diastolic_bp=80,
                                  temperature_c=Decimal("36.7"), heart_rate_bpm=72))
            session.flush()

            # --- fase 2: paciente con ALERGIA documentada + receta que coincide y duplica ---
            cls.patient2_id = uuid.uuid4()
            cls.pharma_consultation_id = uuid.uuid4()
            cls.pharma_rx_id = uuid.uuid4()
            session.add(Patient(id=cls.patient2_id, full_name="Paciente Alergia",
                                birth_date=date(1990, 5, 5), sex=Sex.FEMALE))
            session.flush()
            # Alergia activa a Ibuprofeno (el stub la resuelve a clase 'aine').
            session.add(PatientClinicalItem(
                id=uuid.uuid4(), patient_id=cls.patient2_id,
                item_type=PatientClinicalItemType.ALLERGY, title="Ibuprofeno",
                status=ClinicalItemStatus.ACTIVE))
            session.add(Consultation(id=cls.pharma_consultation_id, patient_id=cls.patient2_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 3, 1, 10, 0),
                                     reason_for_visit="Dolor", status=ConsultationStatus.DRAFT,
                                     current_illness="x", physical_examination="x",
                                     clinical_assessment="x", treatment="x"))
            session.add(Prescription(id=cls.pharma_rx_id,
                                     consultation_id=cls.pharma_consultation_id))
            session.flush()
            # Medicamento que coincide con la alergia (Ibuprofeno) + DUPLICIDAD de Paracetamol.
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.pharma_rx_id,
                                         position=1, medication_name="Ibuprofeno 400 mg",
                                         dose="400 mg", frequency="cada 8 h"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.pharma_rx_id,
                                         position=2, medication_name="Paracetamol",
                                         dose="500 mg", frequency="cada 8 h"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.pharma_rx_id,
                                         position=3, medication_name="paracetamol",
                                         dose="500 mg", frequency="cada 12 h"))

            # --- fase 3: paciente con par interactuante (Warfarina+Ibuprofeno) + fármaco de
            # eliminación renal (Metformina) + eGFR medido por debajo del umbral. ---
            cls.patient3_id = uuid.uuid4()
            cls.fase3_consultation_id = uuid.uuid4()
            cls.fase3_rx_id = uuid.uuid4()
            session.add(Patient(id=cls.patient3_id, full_name="Paciente Farmacología",
                                birth_date=date(1955, 3, 3), sex=Sex.MALE))
            session.flush()
            # eGFR bajo (25 mL/min/1.73m²): valor POSITIVO (no dispara la regla de lab no físico).
            session.add(LabResult(id=uuid.uuid4(), patient_id=cls.patient3_id,
                                  analyte_name="eGFR (CKD-EPI)", value_numeric=Decimal("25"),
                                  unit="mL/min/1.73m2", measured_at=datetime(2026, 4, 1, 9, 0)))
            session.add(Consultation(id=cls.fase3_consultation_id, patient_id=cls.patient3_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 4, 1, 10, 0),
                                     reason_for_visit="Control", status=ConsultationStatus.DRAFT,
                                     current_illness="x", physical_examination="x",
                                     clinical_assessment="x", treatment="x"))
            session.add(Prescription(id=cls.fase3_rx_id,
                                     consultation_id=cls.fase3_consultation_id))
            session.flush()
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.fase3_rx_id,
                                         position=1, medication_name="Warfarina 5 mg",
                                         dose="5 mg", frequency="cada 24 h"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.fase3_rx_id,
                                         position=2, medication_name="Ibuprofeno 400 mg",
                                         dose="400 mg", frequency="cada 8 h"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=cls.fase3_rx_id,
                                         position=3, medication_name="Metformina 850 mg",
                                         dose="850 mg", frequency="cada 12 h"))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(PrescriptionItem))
            session.execute(delete(Prescription))
            session.execute(delete(VitalSign))
            session.execute(delete(LabResult))
            session.execute(delete(PatientClinicalItem))
            session.execute(delete(Consultation))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("quality_checks:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Admin", last_name="Tester",
            email="admin@example.com", permissions=set(permissions),
        )

    def _check(self, target_type: str, target_id):  # type: ignore[no-untyped-def]
        return self.client.post(
            "/api/v1/quality/check",
            json={"target_type": target_type, "target_id": str(target_id)},
        )

    def test_consultation_dirty_returns_expected_flags_with_citations(self) -> None:
        resp = self._check("consultation", self.bad_consultation_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        rules = {f["rule_id"] for f in body["flags"]}
        self.assertIn(RULE_VITALS_OUT_OF_RANGE, rules)
        self.assertIn(RULE_CONSULTATION_NOTE_INCOMPLETE, rules)
        self.assertIn(RULE_LAB_VALUE_NON_PHYSICAL, rules)
        self.assertIn(RULE_PRESCRIPTION_ITEM_INCOMPLETE, rules)
        self.assertEqual(body["flag_count"], len(body["flags"]))
        # Toda bandera trae mensaje, origen y umbral citado.
        for flag in body["flags"]:
            self.assertTrue(flag["message"])
            self.assertTrue(flag["source_ref"])
            self.assertTrue(flag["threshold_cited"])
            self.assertIn(flag["severity"], ("info", "warning"))
        # El umbral de TA está citado (40–300 mmHg).
        self.assertTrue(any("40–300" in (f["threshold_cited"] or "")
                            for f in body["flags"] if f["rule_id"] == RULE_VITALS_OUT_OF_RANGE))

    def test_consultation_clean_returns_no_flags(self) -> None:
        resp = self._check("consultation", self.clean_consultation_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["flags"], [])
        self.assertEqual(resp.json()["flag_count"], 0)

    def test_prescription_target_flags_incomplete_item(self) -> None:
        resp = self._check("prescription", self.prescription_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        rules = {f["rule_id"] for f in resp.json()["flags"]}
        self.assertEqual(rules, {RULE_PRESCRIPTION_ITEM_INCOMPLETE})

    def test_patient_target_flags_negative_lab(self) -> None:
        resp = self._check("patient", self.patient_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        rules = {f["rule_id"] for f in resp.json()["flags"]}
        self.assertEqual(rules, {RULE_LAB_VALUE_NON_PHYSICAL})

    def test_nonexistent_target_rejected(self) -> None:
        self.assertEqual(self._check("consultation", uuid.uuid4()).status_code, 404)
        self.assertEqual(self._check("prescription", uuid.uuid4()).status_code, 404)
        self.assertEqual(self._check("patient", uuid.uuid4()).status_code, 404)

    def test_invalid_target_type_rejected(self) -> None:
        resp = self.client.post("/api/v1/quality/check",
                                json={"target_type": "doctor", "target_id": str(uuid.uuid4())})
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_requires_quality_checks_read_permission(self) -> None:
        self._as("consultations:read")
        self.assertEqual(self._check("consultation", self.bad_consultation_id).status_code, 403)

    def _with_pharma_stub(self) -> None:
        original = settings.pharma_mcp_server_url
        settings.pharma_mcp_server_url = "stub://pharma"
        self.addCleanup(setattr, settings, "pharma_mcp_server_url", original)

    def _without_pharma(self) -> None:
        original = settings.pharma_mcp_server_url
        settings.pharma_mcp_server_url = None
        self.addCleanup(setattr, settings, "pharma_mcp_server_url", original)

    def test_drug_allergy_flag_with_stub_source(self) -> None:
        self._with_pharma_stub()
        body = self._check("consultation", self.pharma_consultation_id).json()
        allergy_flags = [f for f in body["flags"] if f["rule_id"] == RULE_DRUG_ALLERGY]
        self.assertEqual(len(allergy_flags), 1, body["flags"])
        flag = allergy_flags[0]
        self.assertEqual(flag["severity"], "warning")
        self.assertIn("Ibuprofeno", flag["message"])
        self.assertTrue(flag["threshold_cited"])
        # Cita lo coincidente (ingrediente/clase) en el origen.
        self.assertIn("aine", flag["source_ref"])
        self.assertNotEqual(flag["source_ref"], DRUG_ALLERGY_UNAVAILABLE_REF)

    def test_drug_allergy_no_disponible_without_source(self) -> None:
        self._without_pharma()
        body = self._check("consultation", self.pharma_consultation_id).json()
        allergy_flags = [f for f in body["flags"] if f["rule_id"] == RULE_DRUG_ALLERGY]
        self.assertEqual(len(allergy_flags), 1, body["flags"])
        self.assertEqual(allergy_flags[0]["source_ref"], DRUG_ALLERGY_UNAVAILABLE_REF)
        self.assertEqual(allergy_flags[0]["severity"], "info")
        # Las demás reglas SIGUEN corriendo (p. ej. la duplicidad).
        rules = {f["rule_id"] for f in body["flags"]}
        self.assertIn(RULE_DUPLICATE_MEDICATION, rules)

    def test_duplicate_medications_flag(self) -> None:
        self._without_pharma()
        body = self._check("consultation", self.pharma_consultation_id).json()
        dup = [f for f in body["flags"] if f["rule_id"] == RULE_DUPLICATE_MEDICATION]
        self.assertEqual(len(dup), 1, body["flags"])
        self.assertIn("Paracetamol", dup[0]["message"])

    def test_clean_consultation_has_no_pharma_flags(self) -> None:
        # La consulta limpia no tiene recetas ni alergias: ninguna regla de fase 2 dispara.
        self._with_pharma_stub()
        body = self._check("consultation", self.clean_consultation_id).json()
        rules = {f["rule_id"] for f in body["flags"]}
        self.assertNotIn(RULE_DRUG_ALLERGY, rules)
        self.assertNotIn(RULE_DUPLICATE_MEDICATION, rules)

    def test_patient_target_runs_pharma_rules(self) -> None:
        self._with_pharma_stub()
        body = self._check("patient", self.patient2_id).json()
        rules = {f["rule_id"] for f in body["flags"]}
        self.assertIn(RULE_DRUG_ALLERGY, rules)
        self.assertIn(RULE_DUPLICATE_MEDICATION, rules)

    # --- fase 3: interacciones + ajuste de dosis renal ---

    def test_drug_interaction_flag_with_stub_source(self) -> None:
        self._with_pharma_stub()
        body = self._check("consultation", self.fase3_consultation_id).json()
        inter = [f for f in body["flags"] if f["rule_id"] == RULE_DRUG_INTERACTION]
        self.assertEqual(len(inter), 1, body["flags"])
        flag = inter[0]
        self.assertEqual(flag["severity"], "warning")
        self.assertNotEqual(flag["source_ref"], DRUG_INTERACTION_UNAVAILABLE_REF)
        self.assertTrue(flag["threshold_cited"])
        # El par citado es Warfarina + Ibuprofeno.
        self.assertIn("Warfarina", flag["message"])
        self.assertIn("Ibuprofeno", flag["message"])

    def test_drug_interaction_no_disponible_without_source(self) -> None:
        self._without_pharma()
        body = self._check("consultation", self.fase3_consultation_id).json()
        inter = [f for f in body["flags"] if f["rule_id"] == RULE_DRUG_INTERACTION]
        self.assertEqual(len(inter), 1, body["flags"])
        self.assertEqual(inter[0]["source_ref"], DRUG_INTERACTION_UNAVAILABLE_REF)
        self.assertEqual(inter[0]["severity"], "info")

    def test_renal_dose_flag_fires_with_low_egfr(self) -> None:
        self._with_pharma_stub()
        body = self._check("consultation", self.fase3_consultation_id).json()
        renal = [f for f in body["flags"] if f["rule_id"] == RULE_RENAL_DOSE]
        self.assertEqual(len(renal), 1, body["flags"])
        self.assertIn("Metformina", renal[0]["message"])
        self.assertIn("eGFR", renal[0]["message"])
        self.assertTrue(renal[0]["threshold_cited"])
        self.assertIn("lab_result:", renal[0]["source_ref"])

    def test_renal_dose_fires_by_name_without_source(self) -> None:
        # Sin fuente, el mapeo cae a NOMBRE: 'Metformina 850 mg' empareja la tabla renal igual.
        self._without_pharma()
        body = self._check("consultation", self.fase3_consultation_id).json()
        renal = [f for f in body["flags"] if f["rule_id"] == RULE_RENAL_DOSE]
        self.assertEqual(len(renal), 1, body["flags"])

    def test_renal_dose_silent_when_no_egfr(self) -> None:
        # patient2 tiene medicamentos pero NO eGFR: la regla renal no dispara (no fabrica el dato).
        self._with_pharma_stub()
        body = self._check("patient", self.patient2_id).json()
        rules = {f["rule_id"] for f in body["flags"]}
        self.assertNotIn(RULE_RENAL_DOSE, rules)

    def test_check_does_not_mutate_records(self) -> None:
        # Ejecutar la verificación NO debe escribir nada: el borrador sigue siendo borrador,
        # sin updated_at, y el signo vital conserva su valor.
        self._check("consultation", self.bad_consultation_id).raise_for_status()
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.bad_consultation_id)
            assert consultation is not None
            self.assertEqual(consultation.status, ConsultationStatus.DRAFT)
            self.assertIsNone(consultation.updated_at)
            self.assertIsNone(consultation.finalized_at)
            vital = session.execute(
                VitalSign.__table__.select().where(
                    VitalSign.consultation_id == self.bad_consultation_id
                )
            ).first()
            self.assertIsNotNone(vital)
            self.assertEqual(vital.systolic_bp, 400)
            self.assertIsNone(vital.updated_at)


if __name__ == "__main__":
    unittest.main()
