import os
import unittest
import uuid


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
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


ALL_DOCTOR_PERMS = ("doctors:read", "doctors:create", "doctors:update", "doctors:delete")


def _session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Admin",
        last_name="Tester",
        email="admin@example.com",
        permissions=set(permissions),
    )


class DoctorRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as(*ALL_DOCTOR_PERMS)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: _session_user(*permissions)

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "user_id": str(uuid.uuid4()),
            "professional_name": "Dra. House",
            "professional_license_number": "LIC-123",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post("/api/v1/doctors", json=self._payload(**overrides))

    def test_create_then_list_and_get(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        doctor = created.json()
        self.assertEqual(doctor["professional_name"], "Dra. House")
        self.assertEqual(doctor["status"], "active")

        listed = self.client.get("/api/v1/doctors").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], doctor["id"])

        got = self.client.get(f"/api/v1/doctors/{doctor['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], doctor["id"])

    def test_patch_updates_fields_and_status(self) -> None:
        doctor = self._create().json()
        response = self.client.patch(
            f"/api/v1/doctors/{doctor['id']}",
            json={"specialty": "Cardiología", "status": "suspended"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["specialty"], "Cardiología")
        self.assertEqual(body["status"], "suspended")

    def test_soft_delete_hides_from_list_and_get(self) -> None:
        doctor = self._create().json()

        deleted = self.client.delete(f"/api/v1/doctors/{doctor['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(self.client.get("/api/v1/doctors").json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"/api/v1/doctors/{doctor['id']}").status_code, 404)
        # Una segunda baja ya no encuentra el perfil (eliminado lógicamente -> 404).
        self.assertEqual(self.client.delete(f"/api/v1/doctors/{doctor['id']}").status_code, 404)

    def test_status_filter(self) -> None:
        self._create(professional_license_number="L-A")
        suspended = self._create(
            professional_license_number="L-B", status="suspended"
        ).json()

        active = self.client.get("/api/v1/doctors", params={"status": "active"}).json()
        self.assertEqual(active["pagination"]["total"], 1)

        only_suspended = self.client.get(
            "/api/v1/doctors", params={"status": "suspended"}
        ).json()
        self.assertEqual(only_suspended["pagination"]["total"], 1)
        self.assertEqual(only_suspended["items"][0]["id"], suspended["id"])

    def test_duplicate_license_conflicts(self) -> None:
        self.assertEqual(self._create(professional_license_number="DUP").status_code, 201)
        conflict = self._create(professional_license_number="DUP")
        self.assertEqual(conflict.status_code, 409, conflict.text)

    def test_rbac_create_requires_permission(self) -> None:
        self._as("doctors:read")
        self.assertEqual(self._create().status_code, 403)
        # El permiso de lectura sí permite listar.
        self.assertEqual(self.client.get("/api/v1/doctors").status_code, 200)

    def test_missing_doctor_returns_404(self) -> None:
        self.assertEqual(
            self.client.get(f"/api/v1/doctors/{uuid.uuid4()}").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
