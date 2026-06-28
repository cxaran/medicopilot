"""Tests de integración de Study Orders y Clinical Tasks (G4 slice B).

Requieren PostgreSQL real (FK a patients/doctors/lab_results/user). Se ejecutan solo
si ``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en ``_test``.
"""

import os
import unittest
import uuid
from datetime import date
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
from backend.app.models.clinical_task import ClinicalTask  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import PatientStatus, RecordStatus, Sex  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.study_order import StudyOrder  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class StudyTasksCatalogTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in (
            "study_orders:read",
            "study_orders:create",
            "study_orders:update",
            "study_orders:delete",
            "clinical_tasks:read",
            "clinical_tasks:create",
            "clinical_tasks:update",
            "clinical_tasks:delete",
        ):
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class StudyOrderTaskRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(
                User(
                    id=cls.actor_id,
                    name="Admin",
                    last_name="Tester",
                    email=f"actor-{cls.actor_id}@example.com",
                    hashed_password="x",
                    is_active=True,
                )
            )
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as(
            "study_orders:read",
            "study_orders:create",
            "study_orders:update",
            "study_orders:delete",
            "clinical_tasks:read",
            "clinical_tasks:create",
            "clinical_tasks:update",
            "clinical_tasks:delete",
        )
        self.client = TestClient(app)
        self.patient_id = self._seed_patient()
        self.doctor_id = self._seed_doctor()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(StudyOrder))
            session.execute(delete(ClinicalTask))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _seed_patient(self) -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=patient_id,
                    full_name="María García",
                    birth_date=date(1990, 5, 4),
                    sex=Sex.FEMALE,
                    status=PatientStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return patient_id

    def _seed_doctor(self) -> uuid.UUID:
        doctor_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Doctor(
                    id=doctor_id,
                    user_id=self.actor_id,
                    professional_name="Dra. House",
                    professional_license_number=f"LIC-{doctor_id}",
                    status=RecordStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return doctor_id

    # --- Study orders ---

    def _order_payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "ordered_by": str(self.doctor_id),
            "study_name": "Biometría hemática",
        }
        payload.update(overrides)
        return payload

    def test_study_order_create_and_defaults(self) -> None:
        created = self.client.post("/api/v1/study-orders", json=self._order_payload())
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "pending")
        self.assertIsNotNone(body["ordered_at"])

    def test_study_order_missing_doctor_404(self) -> None:
        self.assertEqual(
            self.client.post(
                "/api/v1/study-orders", json=self._order_payload(ordered_by=str(uuid.uuid4()))
            ).status_code,
            404,
        )

    def test_study_order_filters(self) -> None:
        self.client.post("/api/v1/study-orders", json=self._order_payload(ordered_at="2026-01-10T09:00:00"))
        self.client.post(
            "/api/v1/study-orders",
            json=self._order_payload(study_name="Química sanguínea", ordered_at="2026-03-10T09:00:00", status="resulted"),
        )
        base = {"patient_id": str(self.patient_id)}
        # status filter
        resulted = self.client.get("/api/v1/study-orders", params={**base, "status": "resulted"}).json()
        self.assertEqual(resulted["pagination"]["total"], 1)
        # date range in/out
        in_range = self.client.get(
            "/api/v1/study-orders", params={**base, "ordered_at_from": "2026-02-01", "ordered_at_to": "2026-04-01"}
        ).json()
        self.assertEqual(in_range["pagination"]["total"], 1)
        out = self.client.get(
            "/api/v1/study-orders", params={**base, "ordered_at_from": "2026-06-01", "ordered_at_to": "2026-12-31"}
        ).json()
        self.assertEqual(out["pagination"]["total"], 0)

    def test_study_order_patch_and_delete(self) -> None:
        order = self.client.post("/api/v1/study-orders", json=self._order_payload()).json()
        patched = self.client.patch(
            f"/api/v1/study-orders/{order['id']}", json={"status": "in_progress"}
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["status"], "in_progress")
        self.assertEqual(self.client.delete(f"/api/v1/study-orders/{order['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/study-orders/{order['id']}").status_code, 404)

    def test_study_order_rbac(self) -> None:
        self._as("study_orders:read")
        self.assertEqual(
            self.client.post("/api/v1/study-orders", json=self._order_payload()).status_code, 403
        )

    # --- Clinical tasks ---

    def _task_payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {"title": "Llamar al paciente"}
        payload.update(overrides)
        return payload

    def test_task_create_defaults_owner_to_current_user(self) -> None:
        created = self.client.post("/api/v1/clinical-tasks", json=self._task_payload())
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["owner_id"], str(self.actor_id))
        self.assertEqual(body["priority"], "medium")
        self.assertEqual(body["status"], "open")

    def test_task_filters_status_priority_and_due_range(self) -> None:
        self.client.post(
            "/api/v1/clinical-tasks",
            json=self._task_payload(title="Urgente", priority="high", due_at="2026-03-10T09:00:00"),
        )
        self.client.post(
            "/api/v1/clinical-tasks",
            json=self._task_payload(title="Hecha", status="done", due_at="2026-06-10T09:00:00"),
        )
        base = {"owner_id": str(self.actor_id)}
        high = self.client.get("/api/v1/clinical-tasks", params={**base, "priority": "high"}).json()
        self.assertEqual(high["pagination"]["total"], 1)
        open_tasks = self.client.get("/api/v1/clinical-tasks", params={**base, "status": "open"}).json()
        self.assertEqual(open_tasks["pagination"]["total"], 1)
        in_range = self.client.get(
            "/api/v1/clinical-tasks", params={**base, "due_at_from": "2026-02-01", "due_at_to": "2026-04-01"}
        ).json()
        self.assertEqual(in_range["pagination"]["total"], 1)
        out = self.client.get(
            "/api/v1/clinical-tasks", params={**base, "due_at_from": "2026-08-01", "due_at_to": "2026-12-31"}
        ).json()
        self.assertEqual(out["pagination"]["total"], 0)

    def test_task_with_patient_link(self) -> None:
        created = self.client.post(
            "/api/v1/clinical-tasks", json=self._task_payload(patient_id=str(self.patient_id))
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["patient_id"], str(self.patient_id))
        # Paciente inexistente -> 404.
        self.assertEqual(
            self.client.post(
                "/api/v1/clinical-tasks", json=self._task_payload(patient_id=str(uuid.uuid4()))
            ).status_code,
            404,
        )

    def test_task_patch_and_delete(self) -> None:
        task = self.client.post("/api/v1/clinical-tasks", json=self._task_payload()).json()
        patched = self.client.patch(f"/api/v1/clinical-tasks/{task['id']}", json={"status": "done"})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["status"], "done")
        self.assertEqual(self.client.delete(f"/api/v1/clinical-tasks/{task['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/clinical-tasks/{task['id']}").status_code, 404)

    def test_task_rbac(self) -> None:
        self._as("clinical_tasks:read")
        self.assertEqual(
            self.client.post("/api/v1/clinical-tasks", json=self._task_payload()).status_code, 403
        )


if __name__ == "__main__":
    unittest.main()
