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
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import RecordStatus  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


ALL_PERMS = (
    "medication_templates:read",
    "medication_templates:create",
    "medication_templates:update",
    "medication_templates:delete",
)


def _session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Admin",
        last_name="Tester",
        email="admin@example.com",
        permissions=set(permissions),
    )


class MedicationTemplateRoutesTest(unittest.TestCase):
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
        self._as(*ALL_PERMS)
        self.client = TestClient(app)
        self.doctor_id = self._seed_doctor()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: _session_user(*permissions)

    def _seed_doctor(self, deleted: bool = False) -> uuid.UUID:
        """Inserta un médico directamente (las FK no se aplican en sqlite de prueba)."""
        with Session(self.engine) as session:
            doctor = Doctor(
                user_id=uuid.uuid4(),
                professional_name="Dra. House",
                professional_license_number=f"LIC-{uuid.uuid4().hex[:8]}",
                status=RecordStatus.ACTIVE,
            )
            if deleted:
                from backend.app.utils.utc_now import utc_now

                doctor.deleted_at = utc_now()
            session.add(doctor)
            session.commit()
            session.refresh(doctor)
            return doctor.id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "doctor_id": str(self.doctor_id),
            "medication_name": "Paracetamol",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(
            "/api/v1/medication-templates", json=self._payload(**overrides)
        )

    def test_create_then_list_and_get(self) -> None:
        created = self._create(presentation="500mg", default_dose="1 tableta")
        self.assertEqual(created.status_code, 201, created.text)
        tpl = created.json()
        self.assertEqual(tpl["medication_name"], "Paracetamol")
        # use_count y status nacen gobernados por el servidor.
        self.assertEqual(tpl["use_count"], 0)
        self.assertEqual(tpl["status"], "active")

        listed = self.client.get("/api/v1/medication-templates").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], tpl["id"])

        got = self.client.get(f"/api/v1/medication-templates/{tpl['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], tpl["id"])

    def test_create_rejects_server_governed_fields(self) -> None:
        # use_count es gobernado por el servidor: enviarlo da 422 (extra forbid).
        rejected = self._create(use_count=99)
        self.assertEqual(rejected.status_code, 422, rejected.text)

    def test_create_with_missing_doctor_returns_404(self) -> None:
        response = self._create(doctor_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404, response.text)

    def test_create_with_deleted_doctor_returns_404(self) -> None:
        deleted_doctor = self._seed_doctor(deleted=True)
        response = self._create(doctor_id=str(deleted_doctor))
        self.assertEqual(response.status_code, 404, response.text)

    def test_patch_updates_fields_and_status(self) -> None:
        tpl = self._create().json()
        response = self.client.patch(
            f"/api/v1/medication-templates/{tpl['id']}",
            json={"default_frequency": "cada 8h", "status": "inactive"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["default_frequency"], "cada 8h")
        self.assertEqual(body["status"], "inactive")

    def test_patch_rejects_doctor_id_change(self) -> None:
        # doctor_id es inmutable: no se declara en el schema de update (extra forbid).
        tpl = self._create().json()
        response = self.client.patch(
            f"/api/v1/medication-templates/{tpl['id']}",
            json={"doctor_id": str(uuid.uuid4())},
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_soft_delete_hides_from_list_and_get(self) -> None:
        tpl = self._create().json()

        deleted = self.client.delete(f"/api/v1/medication-templates/{tpl['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(
            self.client.get("/api/v1/medication-templates").json()["pagination"]["total"],
            0,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/medication-templates/{tpl['id']}").status_code, 404
        )
        # Una segunda baja ya no encuentra la plantilla (eliminada lógicamente -> 404).
        self.assertEqual(
            self.client.delete(f"/api/v1/medication-templates/{tpl['id']}").status_code,
            404,
        )

    def test_status_filter(self) -> None:
        self._create(medication_name="Amoxicilina")
        inactive = self._create(medication_name="Ibuprofeno", status="inactive").json()

        active = self.client.get(
            "/api/v1/medication-templates", params={"status": "active"}
        ).json()
        self.assertEqual(active["pagination"]["total"], 1)

        only_inactive = self.client.get(
            "/api/v1/medication-templates", params={"status": "inactive"}
        ).json()
        self.assertEqual(only_inactive["pagination"]["total"], 1)
        self.assertEqual(only_inactive["items"][0]["id"], inactive["id"])

    def test_doctor_filter(self) -> None:
        other_doctor = self._seed_doctor()
        self._create(medication_name="Loratadina")
        mine = self.client.get(
            "/api/v1/medication-templates", params={"doctor_id": str(self.doctor_id)}
        ).json()
        self.assertEqual(mine["pagination"]["total"], 1)
        other = self.client.get(
            "/api/v1/medication-templates", params={"doctor_id": str(other_doctor)}
        ).json()
        self.assertEqual(other["pagination"]["total"], 0)

    def test_duplicate_medication_conflicts(self) -> None:
        self.assertEqual(
            self._create(medication_name="Naproxeno", presentation="250mg").status_code,
            201,
        )
        conflict = self._create(medication_name="Naproxeno", presentation="250mg")
        self.assertEqual(conflict.status_code, 409, conflict.text)

    def test_rbac_create_requires_permission(self) -> None:
        self._as("medication_templates:read")
        self.assertEqual(self._create().status_code, 403)
        # El permiso de lectura sí permite listar.
        self.assertEqual(self.client.get("/api/v1/medication-templates").status_code, 200)

    def test_missing_template_returns_404(self) -> None:
        self.assertEqual(
            self.client.get(
                f"/api/v1/medication-templates/{uuid.uuid4()}"
            ).status_code,
            404,
        )


if __name__ == "__main__":
    unittest.main()
