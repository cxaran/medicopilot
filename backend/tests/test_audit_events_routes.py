"""Tests de la bitácora de auditoría (AUDIT LOG READ, gaps 105/110-112).

``AuditEvent`` es una bitácora append-only ya existente; este recurso sólo la CONSULTA (no hay
modelo ni migración nuevos). Las pruebas de ruta usan Postgres real (sólo si TEST_POSTGRES_URL
apunta a una base *_test): verifican que cada filtro (por actor, acción, tipo de entidad,
entidad y rango de fecha) devuelve exactamente las entradas que corresponden, el orden por fecha
descendente, el RBAC y que la consulta NO muta la bitácora.
"""

import os
import unittest
import uuid
from datetime import datetime, timedelta
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
from sqlalchemy import create_engine, delete, func, select  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.audit_event import AuditEvent  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class AuditEventsPermissionUnitTest(unittest.TestCase):
    def test_permission_declared(self) -> None:
        self.assertIn("audit_events:read", declared_permissions())


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class AuditEventsRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_a = uuid.uuid4()
        cls.actor_b = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.other_entity_id = uuid.uuid4()
        cls.base_time = datetime(2024, 1, 10, 12, 0, 0)
        with Session(cls.engine) as session:
            for actor in (cls.actor_a, cls.actor_b):
                session.add(User(id=actor, name="Médico", last_name="Tester",
                                 email=f"a-{actor}@example.com", hashed_password="x",
                                 is_active=True))
            # Entradas controladas (la bitácora la emite el servidor; aquí se siembran
            # directamente para ejercitar los filtros con conteos exactos).
            # 1) actor_a, paciente, finalize, 2024-01-10
            session.add(AuditEvent(entity_type="patient", entity_id=cls.patient_id,
                                   action="consultation_finalized", actor_user_id=cls.actor_a,
                                   occurred_at=cls.base_time))
            # 2) actor_a, paciente, prescription_approved, 2024-01-12
            session.add(AuditEvent(entity_type="patient", entity_id=cls.patient_id,
                                   action="prescription_approved", actor_user_id=cls.actor_a,
                                   occurred_at=cls.base_time + timedelta(days=2)))
            # 3) actor_b, paciente, access, 2024-01-15
            session.add(AuditEvent(entity_type="patient", entity_id=cls.patient_id,
                                   action="patient_accessed", actor_user_id=cls.actor_b,
                                   occurred_at=cls.base_time + timedelta(days=5)))
            # 4) actor_b, OTRA entidad (no paciente), 2024-01-20
            session.add(AuditEvent(entity_type="prescription", entity_id=cls.other_entity_id,
                                   action="prescription_approved", actor_user_id=cls.actor_b,
                                   occurred_at=cls.base_time + timedelta(days=10)))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(AuditEvent))
            session.execute(delete(User))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("audit_events:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_a, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def _count_in_db(self) -> int:
        with Session(self.engine) as session:
            return session.execute(select(func.count()).select_from(AuditEvent)).scalar_one()

    def test_list_orders_by_occurred_at_desc(self) -> None:
        listed = self.client.get("/api/v1/audit-events").json()
        self.assertEqual(len(listed["items"]), 4)
        times = [row["occurred_at"] for row in listed["items"]]
        self.assertEqual(times, sorted(times, reverse=True))  # más reciente primero

    def test_filter_by_actor(self) -> None:
        listed = self.client.get(
            f"/api/v1/audit-events?actor_user_id={self.actor_a}"
        ).json()
        self.assertEqual(len(listed["items"]), 2)
        for row in listed["items"]:
            self.assertEqual(row["actor_user_id"], str(self.actor_a))

    def test_filter_by_action(self) -> None:
        listed = self.client.get(
            "/api/v1/audit-events?action=prescription_approved"
        ).json()
        self.assertEqual(len(listed["items"]), 2)
        for row in listed["items"]:
            self.assertEqual(row["action"], "prescription_approved")

    def test_filter_by_entity_type(self) -> None:
        listed = self.client.get("/api/v1/audit-events?entity_type=prescription").json()
        self.assertEqual(len(listed["items"]), 1)
        self.assertEqual(listed["items"][0]["entity_type"], "prescription")

    def test_filter_by_patient_via_entity(self) -> None:
        # El rastro de un paciente se reconstruye por entity_type + entity_id.
        listed = self.client.get(
            f"/api/v1/audit-events?entity_type=patient&entity_id={self.patient_id}"
        ).json()
        self.assertEqual(len(listed["items"]), 3)
        for row in listed["items"]:
            self.assertEqual(row["entity_id"], str(self.patient_id))

    def test_filter_by_date_range(self) -> None:
        # Rango de calendario sobre occurred_at: del 11 al 16 -> entradas 2 (12) y 3 (15).
        listed = self.client.get(
            "/api/v1/audit-events?occurred_at_after=2024-01-11&occurred_at_before=2024-01-16"
        ).json()
        actions = {row["action"] for row in listed["items"]}
        self.assertEqual(len(listed["items"]), 2)
        self.assertEqual(actions, {"prescription_approved", "patient_accessed"})

    def test_requires_audit_permission(self) -> None:
        self._as("reports:read")  # un rol de calidad/agregados NO basta para la bitácora
        self.assertEqual(self.client.get("/api/v1/audit-events").status_code, 403)

    def test_detail_returns_event(self) -> None:
        listed = self.client.get("/api/v1/audit-events").json()
        event_id = listed["items"][0]["id"]
        detail = self.client.get(f"/api/v1/audit-events/{event_id}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["id"], event_id)

    def test_read_does_not_mutate(self) -> None:
        before = self._count_in_db()
        self.client.get("/api/v1/audit-events")
        self.client.get(f"/api/v1/audit-events?actor_user_id={self.actor_a}")
        self.assertEqual(self._count_in_db(), before)  # la consulta no crea ni borra eventos


if __name__ == "__main__":
    unittest.main()
