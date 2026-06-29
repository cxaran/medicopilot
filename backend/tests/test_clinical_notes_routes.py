"""Tests de integración de notas clínicas (EPIC DOCS fase 1: nota SOAP).

Requieren PostgreSQL real. Se ejecutan solo si ``TEST_POSTGRES_URL`` apunta a una base
cuyo nombre termina en ``_test``.

Cubren el invariante de la fase 1: la nota se persiste como BORRADOR (status='draft', NUNCA
auto-finalizada) ligada al paciente derivado de la consulta; render Markdown correcto;
consulta inexistente/eliminada rechazada; RBAC; baja lógica excluida.
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
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.clinical_note import ClinicalNote  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import Sex  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

_ALL_PERMS = (
    "clinical_notes:read",
    "clinical_notes:create",
    "clinical_notes:update",
    "clinical_notes:delete",
)


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class ClinicalNotesPermissionsTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in _ALL_PERMS:
            self.assertIn(permission, declared)

    def test_markdown_render_marks_empty_sections_without_inventing(self) -> None:
        note = ClinicalNote(subjective="Dolor torácico de 2 horas.", objective=None,
                            assessment=None, plan="Reposo y control en 24h.")
        md = note.content_markdown
        self.assertIn("# Nota SOAP", md)
        self.assertIn("Dolor torácico", md)
        self.assertIn("Reposo y control", md)
        # Las secciones sin datos se marcan; no se inventa contenido.
        self.assertIn("_(sin información registrada)_", md)
        self.assertIn("## O — Objetivo", md)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ClinicalNotesRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.consultation_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(
                User(id=cls.actor_id, name="Admin", last_name="Tester",
                     email=f"actor-{cls.actor_id}@example.com", hashed_password="x", is_active=True)
            )
            doctor_id = uuid.uuid4()
            session.add(
                Doctor(id=doctor_id, user_id=cls.actor_id, professional_name="Dra. House",
                       professional_license_number=f"LIC-{doctor_id}")
            )
            session.add(
                Patient(id=cls.patient_id, full_name="Paciente Nota",
                        birth_date=date(1980, 1, 1), sex=Sex.MALE)
            )
            session.add(
                Consultation(id=cls.consultation_id, patient_id=cls.patient_id,
                             attending_doctor_id=doctor_id, consulted_at=datetime(2026, 1, 1, 10, 0),
                             reason_for_visit="Dolor torácico")
            )
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(ClinicalNote))
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
        self._as(*_ALL_PERMS)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ClinicalNote))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Admin", last_name="Tester",
            email="admin@example.com", permissions=set(permissions),
        )

    def _create(self, **overrides):
        body: dict = {
            "consultation_id": str(self.consultation_id),
            "subjective": "Refiere dolor torácico opresivo de 2 horas.",
            "objective": "TA 130/85, FC 88. Ruidos cardiacos rítmicos.",
            "assessment": "Probable angina; descartar SICA.",
            "plan": "ECG, troponinas; valoración por cardiología.",
        }
        body.update(overrides)
        return self.client.post("/api/v1/clinical-notes", json=body)

    def test_create_persists_draft_linked_to_patient_and_consultation(self) -> None:
        resp = self._create()
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["status"], "draft")  # NUNCA auto-finalizada
        self.assertEqual(body["consultation_id"], str(self.consultation_id))
        self.assertEqual(body["patient_id"], str(self.patient_id))  # derivado de la consulta
        self.assertIn("# Nota SOAP", body["content_markdown"])
        self.assertIn("dolor torácico", body["content_markdown"].lower())
        # Persistió y se recupera.
        got = self.client.get(f"/api/v1/clinical-notes/{body['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["status"], "draft")

    def test_create_requires_at_least_one_section(self) -> None:
        resp = self.client.post("/api/v1/clinical-notes",
                                json={"consultation_id": str(self.consultation_id)})
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_create_rejects_client_supplied_patient_or_status(self) -> None:
        # patient_id y status los gobierna el servidor (extra forbid).
        self.assertEqual(self._create(patient_id=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(status="approved").status_code, 422)

    def test_create_rejects_nonexistent_consultation(self) -> None:
        resp = self._create(consultation_id=str(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404, resp.text)

    def test_list_filters_by_patient_and_consultation(self) -> None:
        self.assertEqual(self._create().status_code, 201)
        by_patient = self.client.get(f"/api/v1/clinical-notes?patient_id={self.patient_id}")
        self.assertEqual(by_patient.status_code, 200, by_patient.text)
        self.assertGreaterEqual(by_patient.json()["pagination"]["total"], 1)
        by_cons = self.client.get(
            f"/api/v1/clinical-notes?consultation_id={self.consultation_id}"
        )
        self.assertGreaterEqual(by_cons.json()["pagination"]["total"], 1)
        # Filtro por estado: todas nacen en draft.
        drafts = self.client.get(f"/api/v1/clinical-notes?patient_id={self.patient_id}&status=draft")
        self.assertGreaterEqual(drafts.json()["pagination"]["total"], 1)
        approved = self.client.get(
            f"/api/v1/clinical-notes?patient_id={self.patient_id}&status=approved"
        )
        self.assertEqual(approved.json()["pagination"]["total"], 0)

    def test_update_edits_sections(self) -> None:
        created = self._create().json()
        patch = self.client.patch(
            f"/api/v1/clinical-notes/{created['id']}",
            json={"plan": "Alta con indicaciones; control en 48h."},
        )
        self.assertEqual(patch.status_code, 200, patch.text)
        self.assertIn("Alta con indicaciones", patch.json()["plan"])
        self.assertIn("Alta con indicaciones", patch.json()["content_markdown"])

    def test_read_requires_read_permission(self) -> None:
        self._as()
        self.assertEqual(self.client.get("/api/v1/clinical-notes").status_code, 403)

    def test_create_requires_create_permission(self) -> None:
        self._as("clinical_notes:read")
        self.assertEqual(self._create().status_code, 403)

    def test_soft_deleted_excluded(self) -> None:
        created = self._create().json()
        self.assertEqual(
            self.client.delete(f"/api/v1/clinical-notes/{created['id']}").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-notes/{created['id']}").status_code, 404
        )
        listed = self.client.get(f"/api/v1/clinical-notes?patient_id={self.patient_id}")
        ids = {item["id"] for item in listed.json()["items"]}
        self.assertNotIn(created["id"], ids)


if __name__ == "__main__":
    unittest.main()
