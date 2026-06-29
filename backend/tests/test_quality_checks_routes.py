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
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import ConsultationStatus, Sex  # noqa: E402
from backend.app.models.lab_result import LabResult  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.models.vital_sign import VitalSign  # noqa: E402
from backend.app.quality_checks import (  # noqa: E402
    RULE_CONSULTATION_NOTE_INCOMPLETE,
    RULE_LAB_VALUE_NON_PHYSICAL,
    RULE_PRESCRIPTION_ITEM_INCOMPLETE,
    RULE_VITALS_OUT_OF_RANGE,
    check_consultation_note,
    check_lab_result,
    check_prescription_item,
    check_vital_sign,
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
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(PrescriptionItem))
            session.execute(delete(Prescription))
            session.execute(delete(VitalSign))
            session.execute(delete(LabResult))
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
