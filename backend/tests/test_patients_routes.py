"""Tests de integración del recurso Patients.

Requieren un PostgreSQL real porque ``patients.record_number`` se genera con una
IDENTITY de base de datos (no soportada por SQLite). Se ejecutan solo si
``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termine en ``_test`` (mismo
gate que ``test_query_postgres``), para no tocar bases de desarrollo o producción.

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_patients_routes
"""

import os
import unittest
import uuid
from datetime import date, timedelta
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
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


ALL_PATIENT_PERMS = ("patients:read", "patients:create", "patients:update", "patients:delete")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PatientRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        # Usuario actor real: las FK de auditoría (created_by/updated_by) se enforced
        # en PostgreSQL, por lo que el id del usuario autenticado debe existir.
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
        self._as(*ALL_PATIENT_PERMS)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
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

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "full_name": "María García",
            "birth_date": "1990-05-04",
            "sex": "female",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post("/api/v1/patients", json=self._payload(**overrides))

    # --- creación / lectura ---

    def test_create_then_list_and_get(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        patient = created.json()
        self.assertEqual(patient["full_name"], "María García")
        self.assertEqual(patient["status"], "active")

        listed = self.client.get("/api/v1/patients").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], patient["id"])

        got = self.client.get(f"/api/v1/patients/{patient['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], patient["id"])

    def test_record_number_is_server_generated_and_immutable(self) -> None:
        a = self._create().json()
        b = self._create(full_name="Otro Paciente").json()
        self.assertIsInstance(a["record_number"], int)
        self.assertIsInstance(b["record_number"], int)
        self.assertNotEqual(a["record_number"], b["record_number"])

        # PATCH no puede modificar record_number (campo no declarado -> 422 extra forbid).
        rejected = self.client.patch(
            f"/api/v1/patients/{a['id']}", json={"record_number": 999999}
        )
        self.assertEqual(rejected.status_code, 422, rejected.text)
        reread = self.client.get(f"/api/v1/patients/{a['id']}").json()
        self.assertEqual(reread["record_number"], a["record_number"])

    def test_patch_updates_fields_and_status(self) -> None:
        patient = self._create().json()
        response = self.client.patch(
            f"/api/v1/patients/{patient['id']}",
            json={"phone": "8112345678", "status": "inactive"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["phone"], "8112345678")
        self.assertEqual(body["status"], "inactive")

    # --- borrado lógico ---

    def test_soft_delete_hides_from_list_and_get(self) -> None:
        patient = self._create().json()

        deleted = self.client.delete(f"/api/v1/patients/{patient['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(self.client.get("/api/v1/patients").json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"/api/v1/patients/{patient['id']}").status_code, 404)
        # Segundo delete -> 404 (ya no visible).
        self.assertEqual(self.client.delete(f"/api/v1/patients/{patient['id']}").status_code, 404)

    def test_archived_patient_is_still_readable(self) -> None:
        patient = self._create().json()
        self.client.patch(
            f"/api/v1/patients/{patient['id']}", json={"status": "archived"}
        )
        # archived NO se oculta: sigue en lista y es legible.
        listed = self.client.get("/api/v1/patients").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        got = self.client.get(f"/api/v1/patients/{patient['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["status"], "archived")

    # --- query: filtros y búsqueda ---

    def test_filter_by_status(self) -> None:
        self._create()
        archived = self._create(full_name="Archivado", status="archived").json()

        active = self.client.get("/api/v1/patients", params={"status": "active"}).json()
        self.assertEqual(active["pagination"]["total"], 1)

        only_archived = self.client.get(
            "/api/v1/patients", params={"status": "archived"}
        ).json()
        self.assertEqual(only_archived["pagination"]["total"], 1)
        self.assertEqual(only_archived["items"][0]["id"], archived["id"])

    def test_filter_by_record_number_exact(self) -> None:
        a = self._create().json()
        self._create(full_name="Otro")
        found = self.client.get(
            "/api/v1/patients", params={"record_number": a["record_number"]}
        ).json()
        self.assertEqual(found["pagination"]["total"], 1)
        self.assertEqual(found["items"][0]["id"], a["id"])

    def test_search_by_name_curp_and_phone(self) -> None:
        self._create(full_name="Juan Pérez", curp="PEPJ900101HnLrra01", phone="8110000001")
        self._create(full_name="Ana López", curp="LOXA850202MnLpnn02", phone="8120000002")

        by_name = self.client.get("/api/v1/patients", params={"q": "Pérez"}).json()
        self.assertEqual(by_name["pagination"]["total"], 1)
        self.assertEqual(by_name["items"][0]["full_name"], "Juan Pérez")

        # CURP se normaliza a mayúsculas al crear; la búsqueda libre la encuentra.
        by_curp = self.client.get("/api/v1/patients", params={"q": "PEPJ900101"}).json()
        self.assertEqual(by_curp["pagination"]["total"], 1)

        by_phone = self.client.get("/api/v1/patients", params={"q": "8120000002"}).json()
        self.assertEqual(by_phone["pagination"]["total"], 1)
        self.assertEqual(by_phone["items"][0]["full_name"], "Ana López")

    # --- validación / conflictos ---

    def test_curp_is_normalized_on_create(self) -> None:
        created = self._create(curp="  pepj900101hnlrra01  ").json()
        self.assertEqual(created["curp"], "PEPJ900101HNLRRA01")

    def test_duplicate_curp_conflicts(self) -> None:
        self.assertEqual(self._create(curp="ABCD900101HNLRRA01").status_code, 201)
        conflict = self._create(full_name="Otro", curp="ABCD900101HNLRRA01")
        self.assertEqual(conflict.status_code, 409, conflict.text)

    def test_future_birth_date_is_rejected(self) -> None:
        future = (date.today() + timedelta(days=1)).isoformat()
        response = self._create(birth_date=future)
        self.assertEqual(response.status_code, 422, response.text)

    def test_record_number_and_audit_not_accepted_as_input(self) -> None:
        # record_number en creación -> 422 (campo no declarado, extra forbid).
        self.assertEqual(self._create(record_number=5).status_code, 422)
        # campos de auditoría / borrado en creación -> 422.
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(deleted_at="2020-01-01T00:00:00").status_code, 422)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        # Sin permiso de creación.
        self._as("patients:read")
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(self.client.get("/api/v1/patients").status_code, 200)

        # Con creación, sin lectura.
        self._as("patients:create")
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(self.client.get("/api/v1/patients").status_code, 403)

        # Sin permiso de actualización ni borrado.
        patient_id = created.json()["id"]
        self._as("patients:read")
        self.assertEqual(
            self.client.patch(f"/api/v1/patients/{patient_id}", json={"phone": "1"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/patients/{patient_id}").status_code, 403
        )


if __name__ == "__main__":
    unittest.main()
