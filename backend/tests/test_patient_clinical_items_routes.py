"""Tests de integración del recurso Patient Clinical Items.

Requieren un PostgreSQL real: el dato clínico cuelga de un paciente, y
``patients.record_number`` se genera con una IDENTITY de base de datos (no
soportada por SQLite). Además las FK (``patient_id`` y auditoría) se enforced en
PostgreSQL. Se ejecutan solo si ``TEST_POSTGRES_URL`` apunta a una base cuyo
nombre termine en ``_test`` (mismo gate que ``test_query_postgres``).

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_patient_clinical_items_routes
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
from backend.app.models.enums import PatientStatus, Sex  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.patient_clinical_item import PatientClinicalItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.utils.utc_now import utc_now  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


ALL_PERMS = (
    "patient_clinical_items:read",
    "patient_clinical_items:create",
    "patient_clinical_items:update",
    "patient_clinical_items:delete",
)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PatientClinicalItemRoutesTest(unittest.TestCase):
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
        self._as(*ALL_PERMS)
        self.client = TestClient(app)
        # Paciente vigente al que cuelgan los datos clínicos de la prueba.
        self.patient_id = self._seed_patient()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(PatientClinicalItem))
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

    def _seed_patient(self, deleted: bool = False) -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            patient = Patient(
                id=patient_id,
                full_name="María García",
                birth_date=date(1990, 5, 4),
                sex=Sex.FEMALE,
                status=PatientStatus.ACTIVE,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if deleted:
                patient.deleted_at = utc_now()
                patient.deleted_by = self.actor_id
            session.add(patient)
            session.commit()
        return patient_id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "item_type": "allergy",
            "title": "Penicilina",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(
            "/api/v1/patient-clinical-items", json=self._payload(**overrides)
        )

    # --- creación / lectura ---

    def test_create_then_list_and_get(self) -> None:
        created = self._create(
            details="Reacción cutánea",
            severity="high",
            started_on="2020-01-01",
        )
        self.assertEqual(created.status_code, 201, created.text)
        item = created.json()
        self.assertEqual(item["title"], "Penicilina")
        self.assertEqual(item["item_type"], "allergy")
        self.assertEqual(item["severity"], "high")
        self.assertEqual(item["status"], "active")
        self.assertEqual(item["patient_id"], str(self.patient_id))

        listed = self.client.get("/api/v1/patient-clinical-items").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], item["id"])

        got = self.client.get(f"/api/v1/patient-clinical-items/{item['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], item["id"])

    def test_create_requires_existing_patient(self) -> None:
        response = self._create(patient_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404, response.text)

    def test_create_rejects_soft_deleted_patient(self) -> None:
        deleted_patient = self._seed_patient(deleted=True)
        response = self._create(patient_id=str(deleted_patient))
        self.assertEqual(response.status_code, 404, response.text)

    # --- actualización ---

    def test_patient_id_is_immutable_via_patch(self) -> None:
        item = self._create().json()
        other_patient = self._seed_patient()
        rejected = self.client.patch(
            f"/api/v1/patient-clinical-items/{item['id']}",
            json={"patient_id": str(other_patient)},
        )
        # ``patient_id`` no está declarado en el PATCH -> 422 (extra forbid).
        self.assertEqual(rejected.status_code, 422, rejected.text)
        reread = self.client.get(f"/api/v1/patient-clinical-items/{item['id']}").json()
        self.assertEqual(reread["patient_id"], str(self.patient_id))

    def test_patch_updates_fields_and_status(self) -> None:
        item = self._create().json()
        response = self.client.patch(
            f"/api/v1/patient-clinical-items/{item['id']}",
            json={"details": "Actualizado", "status": "resolved", "severity": "low"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["details"], "Actualizado")
        self.assertEqual(body["status"], "resolved")
        self.assertEqual(body["severity"], "low")

    # --- borrado lógico ---

    def test_soft_delete_hides_from_list_and_get(self) -> None:
        item = self._create().json()

        deleted = self.client.delete(f"/api/v1/patient-clinical-items/{item['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(
            self.client.get("/api/v1/patient-clinical-items").json()["pagination"]["total"],
            0,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/patient-clinical-items/{item['id']}").status_code,
            404,
        )
        # Segundo delete -> 404 (ya no visible).
        self.assertEqual(
            self.client.delete(f"/api/v1/patient-clinical-items/{item['id']}").status_code,
            404,
        )

    def test_resolved_item_is_still_readable(self) -> None:
        item = self._create().json()
        self.client.patch(
            f"/api/v1/patient-clinical-items/{item['id']}", json={"status": "resolved"}
        )
        # ``resolved`` NO se oculta: sigue en lista y es legible.
        listed = self.client.get("/api/v1/patient-clinical-items").json()
        self.assertEqual(listed["pagination"]["total"], 1)
        got = self.client.get(f"/api/v1/patient-clinical-items/{item['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["status"], "resolved")

    # --- query: filtros y búsqueda ---

    def test_filter_by_patient_id(self) -> None:
        self._create()
        other_patient = self._seed_patient()
        self._create(patient_id=str(other_patient), title="Hipertensión")

        mine = self.client.get(
            "/api/v1/patient-clinical-items",
            params={"patient_id": str(self.patient_id)},
        ).json()
        self.assertEqual(mine["pagination"]["total"], 1)
        self.assertEqual(mine["items"][0]["title"], "Penicilina")

    def test_filter_by_item_type_status_and_severity(self) -> None:
        self._create(item_type="allergy", severity="high")
        self._create(
            item_type="chronic_condition",
            title="Diabetes",
            status="inactive",
            severity="low",
        )

        by_type = self.client.get(
            "/api/v1/patient-clinical-items", params={"item_type": "chronic_condition"}
        ).json()
        self.assertEqual(by_type["pagination"]["total"], 1)
        self.assertEqual(by_type["items"][0]["title"], "Diabetes")

        by_status = self.client.get(
            "/api/v1/patient-clinical-items", params={"status": "inactive"}
        ).json()
        self.assertEqual(by_status["pagination"]["total"], 1)

        by_severity = self.client.get(
            "/api/v1/patient-clinical-items", params={"severity": "high"}
        ).json()
        self.assertEqual(by_severity["pagination"]["total"], 1)
        self.assertEqual(by_severity["items"][0]["title"], "Penicilina")

    def test_search_by_title_and_details(self) -> None:
        self._create(title="Penicilina", details="Reacción severa")
        self._create(title="Aspirina", details="Tolerada")

        by_title = self.client.get(
            "/api/v1/patient-clinical-items", params={"q": "Penic"}
        ).json()
        self.assertEqual(by_title["pagination"]["total"], 1)
        self.assertEqual(by_title["items"][0]["title"], "Penicilina")

        by_details = self.client.get(
            "/api/v1/patient-clinical-items", params={"q": "Tolerada"}
        ).json()
        self.assertEqual(by_details["pagination"]["total"], 1)
        self.assertEqual(by_details["items"][0]["title"], "Aspirina")

    def test_sort_by_title(self) -> None:
        self._create(title="Zinc")
        self._create(title="Amoxicilina")
        ordered = self.client.get(
            "/api/v1/patient-clinical-items", params={"sort": "title"}
        ).json()
        titles = [item["title"] for item in ordered["items"]]
        self.assertEqual(titles, ["Amoxicilina", "Zinc"])

    # --- validación / conflictos ---

    def test_ended_before_started_is_rejected(self) -> None:
        response = self._create(started_on="2021-01-01", ended_on="2020-01-01")
        self.assertEqual(response.status_code, 422, response.text)

    def test_audit_fields_not_accepted_as_input(self) -> None:
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(deleted_at="2020-01-01T00:00:00").status_code, 422)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        # Sin permiso de creación.
        self._as("patient_clinical_items:read")
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(self.client.get("/api/v1/patient-clinical-items").status_code, 200)

        # Con creación, sin lectura.
        self._as("patient_clinical_items:create")
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(self.client.get("/api/v1/patient-clinical-items").status_code, 403)

        # Sin permiso de actualización ni borrado.
        item_id = created.json()["id"]
        self._as("patient_clinical_items:read")
        self.assertEqual(
            self.client.patch(
                f"/api/v1/patient-clinical-items/{item_id}", json={"title": "X"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/patient-clinical-items/{item_id}").status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()
