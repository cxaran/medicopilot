"""Tests de integración del recurso Clinical Events (eventos clínicos).

Requieren PostgreSQL real: dependen de la FK a ``patients`` y del CHECK de fechas
(``ended_at >= started_at``), que SQLite no representa fielmente. Se ejecutan solo si
``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en ``_test``.
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
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.clinical_event import ClinicalEvent  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ClinicalEventType,
    PatientStatus,
    Sex,
)
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402
from backend.app.utils.utc_now import utc_now  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


ALL_PERMS = (
    "clinical_events:read",
    "clinical_events:create",
    "clinical_events:update",
    "clinical_events:delete",
)
_BASE = "/api/v1/clinical-events"


class ClinicalEventsCatalogTest(unittest.TestCase):
    def test_four_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ClinicalEventRoutesTest(unittest.TestCase):
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
        self.patient_id = self._seed_patient()
        self.other_patient_id = self._seed_patient(full_name="Juan Pérez")

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ClinicalEvent))
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

    def _seed_patient(self, *, full_name: str = "María García") -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=patient_id,
                    full_name=full_name,
                    birth_date=date(1990, 5, 4),
                    sex=Sex.FEMALE,
                    status=PatientStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return patient_id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "event_type": "hospitalization",
            "title": "Ingreso por neumonía",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    # --- creación ---

    def test_create_minimal(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["event_type"], "hospitalization")
        self.assertEqual(body["title"], "Ingreso por neumonía")
        self.assertIsNotNone(body["started_at"])

    def test_create_referral_with_specialty_and_destination(self) -> None:
        created = self._create(
            event_type="referral",
            title="Referencia a cardiología",
            specialty="Cardiología",
            destination="Hospital General",
            status="active",
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["specialty"], "Cardiología")
        self.assertEqual(created.json()["destination"], "Hospital General")

    def test_create_missing_patient_404(self) -> None:
        self.assertEqual(self._create(patient_id=str(uuid.uuid4())).status_code, 404)

    def test_create_bad_dates_rejected(self) -> None:
        # ended_at anterior a started_at -> 422.
        self.assertEqual(
            self._create(
                started_at="2026-03-10T10:00:00", ended_at="2026-03-01T10:00:00"
            ).status_code,
            422,
        )

    def test_started_at_future_rejected(self) -> None:
        future = (utc_now() + timedelta(days=1)).isoformat()
        self.assertEqual(self._create(started_at=future).status_code, 422)

    def test_reject_audit_fields(self) -> None:
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)

    # --- filtros ---

    def test_filter_by_patient(self) -> None:
        self._create()
        self._create(patient_id=str(self.other_patient_id), title="Otro")
        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(listed["pagination"]["total"], 1)

    def test_filter_by_type_and_status(self) -> None:
        self._create(event_type="hospitalization")
        self._create(event_type="emergency", title="Urgencia", status="resolved")
        by_type = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id), "event_type": "emergency"}
        ).json()
        self.assertEqual(by_type["pagination"]["total"], 1)
        by_status = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id), "status": "resolved"}
        ).json()
        self.assertEqual(by_status["pagination"]["total"], 1)

    def test_filter_started_at_range(self) -> None:
        self._create(started_at="2026-01-10T08:00:00")
        self._create(started_at="2026-03-10T08:00:00", title="Marzo")
        self._create(started_at="2026-06-10T08:00:00", title="Junio")
        base = {"patient_id": str(self.patient_id)}
        between = self.client.get(
            _BASE, params={**base, "started_at_from": "2026-02-01", "started_at_to": "2026-05-01"}
        ).json()
        self.assertEqual(between["pagination"]["total"], 1)
        # Negativo: rango sin eventos -> vacío.
        empty = self.client.get(
            _BASE, params={**base, "started_at_from": "2026-08-01", "started_at_to": "2026-12-31"}
        ).json()
        self.assertEqual(empty["pagination"]["total"], 0)

    def test_default_sort_desc(self) -> None:
        self._create(started_at="2026-01-10T08:00:00", title="Enero")
        self._create(started_at="2026-06-10T08:00:00", title="Junio")
        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual([i["title"] for i in listed["items"]], ["Junio", "Enero"])

    # --- edición / borrado / RBAC ---

    def test_patch_and_soft_delete(self) -> None:
        event = self._create().json()
        patched = self.client.patch(f"{_BASE}/{event['id']}", json={"status": "resolved"})
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["status"], "resolved")
        self.assertEqual(self.client.delete(f"{_BASE}/{event['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{_BASE}/{event['id']}").status_code, 404)

    def test_patch_rejects_patient_id_change(self) -> None:
        event = self._create().json()
        response = self.client.patch(
            f"{_BASE}/{event['id']}", json={"patient_id": str(self.other_patient_id)}
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_rbac_enforced_per_operation(self) -> None:
        event = self._create().json()
        self._as("clinical_events:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self._as("clinical_events:read")  # sin create/update/delete
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{event['id']}", json={"status": "resolved"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{event['id']}").status_code, 403)

    # --- invariante de base de datos ---

    def test_db_check_constraint_dates(self) -> None:
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.add(
                    ClinicalEvent(
                        patient_id=self.patient_id,
                        event_type=ClinicalEventType.HOSPITALIZATION,
                        title="Fechas inválidas",
                        started_at=utc_now(),
                        ended_at=utc_now() - timedelta(days=2),
                        created_by=self.actor_id,
                        updated_by=self.actor_id,
                    )
                )
                session.commit()


if __name__ == "__main__":
    unittest.main()
