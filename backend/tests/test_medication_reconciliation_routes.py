"""Tests de la conciliación de medicación (gap case 26, sólo lectura).

Dos bloques:
  - ``ReconcileUnitTest``: lógica PURA (sin BD) — consolidación/dedup por ingrediente, cada tipo
    de discrepancia dispara/silencia, y el camino sin resolutor cae a nombre ('no disponible').
  - ``MedicationReconciliationRoutesTest``: GET /patients/{id}/medication-reconciliation contra
    Postgres real (sólo si TEST_POSTGRES_URL apunta a una base *_test). 404 paciente inexistente,
    RBAC, y NO mutación.
"""

import os
import unittest
import uuid
from datetime import date, datetime
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
from backend.app.core.settings import settings  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.medication_reconciliation import (  # noqa: E402
    FLAG_DUPLICATE,
    FLAG_PRESCRIBED_NOT_REPORTED,
    FLAG_REPORTED_NOT_PRESCRIBED,
    ResolvedMedication,
    reconcile_medications,
)
from backend.app.models import Base  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ClinicalItemStatus,
    ConsultationStatus,
    PatientClinicalItemType,
    Sex,
)
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.patient_clinical_item import PatientClinicalItem  # noqa: E402
from backend.app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


def _med(ref, name, source, ingredients=(), classes=(), covered=False):
    return ResolvedMedication(
        ref=ref, name=name, source=source,
        ingredients=frozenset(ingredients), classes=frozenset(classes), covered=covered,
    )


class ReconcileUnitTest(unittest.TestCase):
    def test_permission_declared(self) -> None:
        self.assertIn("medication_reconciliation:read", declared_permissions())

    def test_dedup_by_ingredient_marca_consistente_sin_bandera(self) -> None:
        # Marca y genérico del mismo ingrediente -> una sola entrada con ambas fuentes -> sin flag.
        meds = [
            _med("prescription_item:1", "Ibuprofeno", "prescribed", ["ibuprofeno"], ["aine"], True),
            _med("patient_clinical_item:1", "Advil", "reported", ["ibuprofeno"], ["aine"], True),
        ]
        consolidated, flags = reconcile_medications(meds, source_available=True)
        self.assertEqual(len(consolidated), 1)
        self.assertEqual(consolidated[0].ingredient_or_class, "ibuprofeno")
        self.assertEqual(consolidated[0].resolver_status, "resolved")
        self.assertEqual(flags, [])  # consistente: prescrito y reportado

    def test_prescribed_not_reported(self) -> None:
        meds = [_med("prescription_item:1", "Ibuprofeno", "prescribed", ["ibuprofeno"], [], True)]
        _, flags = reconcile_medications(meds, source_available=True)
        self.assertEqual([f.kind for f in flags], [FLAG_PRESCRIBED_NOT_REPORTED])
        self.assertEqual(flags[0].source_refs, ("prescription_item:1",))

    def test_reported_not_prescribed(self) -> None:
        meds = [_med("patient_clinical_item:1", "Metformina", "reported", ["metformina"], [], True)]
        _, flags = reconcile_medications(meds, source_available=True)
        self.assertEqual([f.kind for f in flags], [FLAG_REPORTED_NOT_PRESCRIBED])

    def test_duplicate_within_source(self) -> None:
        meds = [
            _med("prescription_item:1", "Paracetamol", "prescribed", ["paracetamol"], [], True),
            _med("prescription_item:2", "Tempra", "prescribed", ["paracetamol"], [], True),
        ]
        _, flags = reconcile_medications(meds, source_available=True)
        kinds = {f.kind for f in flags}
        self.assertIn(FLAG_DUPLICATE, kinds)

    def test_resolver_unavailable_cae_a_nombre_y_marca_no_disponible(self) -> None:
        # Sin resolutor, marca y genérico NO se agrupan (nombres distintos) y el estado es
        # 'no_disponible' (no se fabrica ingrediente/clase).
        meds = [
            _med("prescription_item:1", "Ibuprofeno", "prescribed"),
            _med("patient_clinical_item:1", "Advil", "reported"),
        ]
        consolidated, flags = reconcile_medications(meds, source_available=False)
        self.assertEqual(len(consolidated), 2)
        for c in consolidated:
            self.assertEqual(c.resolver_status, "no_disponible")
            self.assertIsNone(c.ingredient_or_class)
        self.assertEqual(
            {f.kind for f in flags},
            {FLAG_PRESCRIBED_NOT_REPORTED, FLAG_REPORTED_NOT_PRESCRIBED},
        )


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class MedicationReconciliationRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.doctor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()      # con discrepancias
        cls.consistent_id = uuid.uuid4()   # sin discrepancias
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Admin", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Doctor(id=cls.doctor_id, user_id=cls.actor_id,
                               professional_name="Dra. House",
                               professional_license_number=f"LIC-{cls.doctor_id}"))
            session.add(Patient(id=cls.patient_id, full_name="Paciente Discrepante",
                                birth_date=date(1980, 1, 1), sex=Sex.MALE))
            session.add(Patient(id=cls.consistent_id, full_name="Paciente Consistente",
                                birth_date=date(1985, 1, 1), sex=Sex.FEMALE))
            session.flush()
            # Paciente con discrepancias.
            cons = uuid.uuid4()
            rx = uuid.uuid4()
            session.add(Consultation(id=cons, patient_id=cls.patient_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 1, 1, 10, 0),
                                     reason_for_visit="x", status=ConsultationStatus.DRAFT))
            session.flush()
            session.add(Prescription(id=rx, consultation_id=cons))
            session.flush()
            # Prescrito: Ibuprofeno (no reportado) + Amoxicilina x2 (duplicado).
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=rx, position=1,
                                         medication_name="Ibuprofeno 400 mg"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=rx, position=2,
                                         medication_name="Amoxicilina 500 mg"))
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=rx, position=3,
                                         medication_name="amoxicilina"))
            # Reportado: Metformina (no prescrita).
            session.add(PatientClinicalItem(
                id=uuid.uuid4(), patient_id=cls.patient_id,
                item_type=PatientClinicalItemType.CURRENT_MEDICATION, title="Metformina",
                status=ClinicalItemStatus.ACTIVE))
            # Paciente consistente: Ibuprofeno prescrito Y reportado.
            cons2 = uuid.uuid4()
            rx2 = uuid.uuid4()
            session.add(Consultation(id=cons2, patient_id=cls.consistent_id,
                                     attending_doctor_id=cls.doctor_id,
                                     consulted_at=datetime(2026, 2, 1, 10, 0),
                                     reason_for_visit="x", status=ConsultationStatus.DRAFT))
            session.flush()
            session.add(Prescription(id=rx2, consultation_id=cons2))
            session.flush()
            session.add(PrescriptionItem(id=uuid.uuid4(), prescription_id=rx2, position=1,
                                         medication_name="Ibuprofeno"))
            session.add(PatientClinicalItem(
                id=uuid.uuid4(), patient_id=cls.consistent_id,
                item_type=PatientClinicalItemType.CURRENT_MEDICATION, title="Advil",
                status=ClinicalItemStatus.ACTIVE))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(PrescriptionItem))
            session.execute(delete(Prescription))
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
        self._as("medication_reconciliation:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Admin", last_name="Tester",
            email="admin@example.com", permissions=set(permissions),
        )

    def _with_pharma_stub(self) -> None:
        original = settings.pharma_mcp_server_url
        settings.pharma_mcp_server_url = "stub://pharma"
        self.addCleanup(setattr, settings, "pharma_mcp_server_url", original)

    def _without_pharma(self) -> None:
        original = settings.pharma_mcp_server_url
        settings.pharma_mcp_server_url = None
        self.addCleanup(setattr, settings, "pharma_mcp_server_url", original)

    def _get(self, patient_id):
        return self.client.get(f"/api/v1/patients/{patient_id}/medication-reconciliation")

    def test_discrepancies_with_stub_resolver(self) -> None:
        self._with_pharma_stub()
        resp = self._get(self.patient_id)
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertTrue(body["resolver_available"])
        kinds = {f["kind"] for f in body["flags"]}
        self.assertIn(FLAG_PRESCRIBED_NOT_REPORTED, kinds)  # Ibuprofeno prescrito, no reportado
        self.assertIn(FLAG_REPORTED_NOT_PRESCRIBED, kinds)  # Metformina reportada, no prescrita
        self.assertIn(FLAG_DUPLICATE, kinds)                # Amoxicilina x2
        # Consolidado no vacío y cada bandera cita orígenes.
        self.assertTrue(body["consolidated"])
        for flag in body["flags"]:
            self.assertTrue(flag["source_refs"])
            self.assertTrue(flag["message"])

    def test_consistent_patient_has_no_flags(self) -> None:
        self._with_pharma_stub()
        body = self._get(self.consistent_id).json()
        self.assertEqual(body["flags"], [])
        self.assertEqual(body["flag_count"], 0)
        # Ibuprofeno + Advil se consolidan en una sola entrada (mismo ingrediente).
        self.assertEqual(len(body["consolidated"]), 1)

    def test_resolver_off_degrades_to_no_disponible(self) -> None:
        self._without_pharma()
        body = self._get(self.consistent_id).json()
        self.assertFalse(body["resolver_available"])
        # Sin resolutor, Ibuprofeno y Advil NO se agrupan -> aparecen discrepancias por nombre.
        for entry in body["consolidated"]:
            self.assertEqual(entry["resolver_status"], "no_disponible")

    def test_nonexistent_patient_rejected(self) -> None:
        self.assertEqual(self._get(uuid.uuid4()).status_code, 404)

    def test_requires_permission(self) -> None:
        self._as("patients:read")
        self.assertEqual(self._get(self.patient_id).status_code, 403)

    def test_does_not_mutate(self) -> None:
        self._with_pharma_stub()
        self._get(self.patient_id).raise_for_status()
        with Session(self.engine) as session:
            items = session.execute(
                PrescriptionItem.__table__.select()
            ).fetchall()
            # Nada se eliminó ni cambió de cantidad por consultar la conciliación.
            self.assertGreaterEqual(len(items), 4)
            for item in items:
                self.assertIsNone(item.updated_at)


if __name__ == "__main__":
    unittest.main()
