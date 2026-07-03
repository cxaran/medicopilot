"""Tests del RESUMEN DEL PACIENTE para el contexto del copiloto (sólo lectura).

``GET /patients/{id}/summary`` reúne una vista compacta del expediente. Las pruebas de ruta usan
Postgres real (sólo si TEST_POSTGRES_URL apunta a una base *_test) y verifican:
  - que cada sección traiga los datos correctos,
  - las REGLAS de filtrado (sin datos administrativos, sin UUID anidados, sin bytes, nulos omitidos),
  - el 404 de paciente inexistente, el RBAC y que NO se mute nada.
"""

import hashlib
import os
import unittest
import uuid
from datetime import date, timedelta
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
from backend.app.models.appointment import Appointment  # noqa: E402
from backend.app.models.clinical_document import ClinicalDocument  # noqa: E402
from backend.app.models.clinical_note import ClinicalNote  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    AppointmentStatus,
    ClinicalDocumentStatus,
    ClinicalDocumentType,
    ClinicalItemStatus,
    ClinicalNoteKind,
    ClinicalNoteStatus,
    ConsultationDiagnosisKind,
    ConsultationStatus,
    LabResultAbnormalFlag,
    PatientClinicalItemType,
    PatientStatus,
    PrescriptionStatus,
    Sex,
)
from backend.app.models.lab_result import LabResult  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.patient_clinical_item import PatientClinicalItem  # noqa: E402
from backend.app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.models.vital_sign import VitalSign  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402
from backend.app.utils.utc_now import utc_now  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class PatientSummaryPermissionUnitTest(unittest.TestCase):
    def test_permission_declared(self) -> None:
        self.assertIn("patient_summary:read", declared_permissions())


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PatientSummaryRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        now = utc_now()
        cls.actor_id = uuid.uuid4()
        cls.doctor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.consultation_id = uuid.uuid4()
        cls.prescription_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Médico", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Doctor(id=cls.doctor_id, user_id=cls.actor_id,
                               professional_name="Dra. House",
                               professional_license_number=f"LIC-{cls.doctor_id}"))
            # Paciente con datos ADMINISTRATIVOS que NO deben salir en el resumen.
            session.add(Patient(
                id=cls.patient_id, full_name="Ana Ruiz", birth_date=date(1985, 3, 10),
                sex=Sex.FEMALE, status=PatientStatus.ACTIVE, occupation="Docente",
                phone="5512345678", address="Calle Falsa 123", curp="RUAA850310MDFXXX01",
                email="ana@example.com", emergency_contact_name="Luis Ruiz"))
            session.flush()

            session.add(Consultation(
                id=cls.consultation_id, patient_id=cls.patient_id,
                attending_doctor_id=cls.doctor_id, consulted_at=now - timedelta(days=2),
                reason_for_visit="Control de hipertensión",
                clinical_assessment="Hipertensión controlada",
                status=ConsultationStatus.FINALIZED,
                finalized_by_doctor_id=cls.doctor_id, finalized_at=now - timedelta(days=2)))
            session.flush()  # la consulta debe existir antes de las filas que la referencian
            session.add(ConsultationDiagnosis(
                consultation_id=cls.consultation_id,
                diagnosis_kind=ConsultationDiagnosisKind.PRIMARY,
                diagnosis_text="Hipertensión esencial", coding_system="cie10", code="I10"))
            # Vitales con SÓLO peso: el resto null -> deben OMITIRSE del JSON.
            session.add(VitalSign(
                consultation_id=cls.consultation_id, measured_at=now - timedelta(days=2),
                weight_kg=Decimal("72.5")))
            session.add(ClinicalNote(
                patient_id=cls.patient_id, consultation_id=cls.consultation_id,
                kind=ClinicalNoteKind.NOTA_SOAP, status=ClinicalNoteStatus.APPROVED,
                assessment="Hipertensión esencial", plan="Continuar losartán"))
            session.add(PatientClinicalItem(
                patient_id=cls.patient_id, item_type=PatientClinicalItemType.ALLERGY,
                title="Alergia a penicilina", status=ClinicalItemStatus.ACTIVE))
            session.add(LabResult(
                patient_id=cls.patient_id, analyte_name="Glucosa",
                value_numeric=Decimal("180"), unit="mg/dL",
                abnormal_flag=LabResultAbnormalFlag.HIGH, measured_at=now - timedelta(days=1)))
            content = b"%PDF-1.4 demo\x00\x01"
            session.add(ClinicalDocument(
                patient_id=cls.patient_id, document_type=ClinicalDocumentType.LABORATORY,
                status=ClinicalDocumentStatus.ACTIVE, original_filename="lab.pdf",
                file_content=content, mime_type="application/pdf", size_bytes=len(content),
                sha256=hashlib.sha256(content).hexdigest(), uploaded_by=cls.actor_id))
            session.add(Appointment(
                patient_id=cls.patient_id, doctor_id=cls.doctor_id,
                scheduled_date=(now + timedelta(days=7)).date(), reason="Revisión",
                status=AppointmentStatus.CONFIRMED))
            session.flush()

            rx = Prescription(id=cls.prescription_id, consultation_id=cls.consultation_id,
                              status=PrescriptionStatus.DRAFT)
            session.add(rx)
            session.flush()
            session.add(PrescriptionItem(
                prescription_id=cls.prescription_id, position=1, medication_name="Losartán",
                dose="50 mg", frequency="cada 24 horas", duration="30 días"))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            for model in (PrescriptionItem, Prescription, ClinicalDocument, Appointment,
                          LabResult, PatientClinicalItem, ClinicalNote, VitalSign,
                          ConsultationDiagnosis, Consultation, Doctor, Patient, User):
                session.execute(delete(model))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("patient_summary:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def _summary(self, patient_id=None):  # type: ignore[no-untyped-def]
        return self.client.get(f"/api/v1/patients/{patient_id or self.patient_id}/summary")

    def test_sections_populated(self) -> None:
        body = self._summary().json()
        self.assertEqual(body["patient_id"], str(self.patient_id))
        self.assertEqual(body["datos_generales"]["nombre"], "Ana Ruiz")
        self.assertEqual(body["datos_generales"]["edad"], utc_now().year - 1985 - (
            (utc_now().month, utc_now().day) < (3, 10)))
        self.assertEqual(body["resumen_clinico"][0]["titulo"], "Alergia a penicilina")
        self.assertEqual(body["consultas"][0]["diagnosticos"][0]["codigo"], "I10")
        self.assertEqual(body["notas"][0]["plan"], "Continuar losartán")
        self.assertEqual(body["recetas"][0]["medicamentos"][0]["medicamento"], "Losartán")
        self.assertEqual(body["laboratorios"][0]["marca"], "high")
        self.assertEqual(body["archivos"][0]["nombre"], "lab.pdf")
        self.assertEqual(body["citas"][0]["motivo"], "Revisión")

    def test_excludes_administrative_fields(self) -> None:
        general = self._summary().json()["datos_generales"]
        for field in ("telefono", "phone", "direccion", "address", "curp", "correo", "email"):
            self.assertNotIn(field, general)

    def test_only_patient_uuid_no_nested_ids(self) -> None:
        body = self._summary().json()
        # Ninguna sección anidada expone ids de recurso (el agente los pide por tools).
        for section in ("consultas", "notas", "recetas", "laboratorios", "archivos", "citas",
                        "resumen_clinico"):
            for item in body.get(section, []):
                for key in item:
                    self.assertFalse(
                        key.endswith("_id") or key == "id",
                        f"{section} expone un id: {key}")

    def test_nulls_and_bytes_omitted(self) -> None:
        body = self._summary().json()
        vitals = body["signos_vitales"]
        self.assertIn("peso_kg", vitals)
        # Las mediciones no capturadas se omiten (no aparecen como null).
        self.assertNotIn("temperatura_c", vitals)
        self.assertNotIn("frecuencia_cardiaca", vitals)
        # El archivo nunca expone bytes ni hash.
        file_item = body["archivos"][0]
        for field in ("file_content", "bytes", "sha256", "size_bytes"):
            self.assertNotIn(field, file_item)

    def test_missing_patient_404(self) -> None:
        self.assertEqual(self._summary(uuid.uuid4()).status_code, 404)

    def test_requires_permission(self) -> None:
        self._as("consultations:read")
        self.assertEqual(self._summary().status_code, 403)

    def test_does_not_mutate(self) -> None:
        self._summary().raise_for_status()
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            assert consultation is not None
            self.assertIsNone(consultation.updated_at)
            prescription = session.get(Prescription, self.prescription_id)
            assert prescription is not None
            self.assertEqual(prescription.status, PrescriptionStatus.DRAFT)
            self.assertIsNone(prescription.updated_at)


if __name__ == "__main__":
    unittest.main()
