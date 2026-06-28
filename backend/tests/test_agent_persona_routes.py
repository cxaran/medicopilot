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


def _session_user(user_id: uuid.UUID) -> SessionUser:
    return SessionUser(
        id=user_id,
        name="Médica",
        last_name="Tester",
        email=f"u-{user_id.hex[:8]}@example.com",
        permissions=set(),
    )


class AgentPersonaRoutesTest(unittest.TestCase):
    BASE = "/api/v1/users/me/agent-persona"

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
        self.user_a = uuid.uuid4()
        self.user_b = uuid.uuid4()
        self._as(self.user_a)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, user_id: uuid.UUID) -> None:
        app.dependency_overrides[get_current_user] = lambda: _session_user(user_id)

    def test_get_empty_when_unset(self) -> None:
        body = self.client.get(self.BASE).json()
        self.assertIsNone(body["tone"])
        self.assertIsNone(body["specialty_focus"])

    def test_upsert_creates_then_updates_and_round_trips(self) -> None:
        created = self.client.put(
            self.BASE,
            json={"tone": "breve", "specialty_focus": "pediatría", "language_locale": "es-MX"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["tone"], "breve")
        # Persiste y se lee de vuelta.
        self.assertEqual(self.client.get(self.BASE).json()["specialty_focus"], "pediatría")
        # Upsert parcial: solo cambia lo enviado, conserva el resto.
        updated = self.client.put(self.BASE, json={"tone": "formal"})
        self.assertEqual(updated.json()["tone"], "formal")
        self.assertEqual(updated.json()["specialty_focus"], "pediatría")

    def test_singleton_per_user_no_duplicate(self) -> None:
        self.client.put(self.BASE, json={"tone": "a"})
        self.client.put(self.BASE, json={"tone": "b"})
        from backend.app.models.agent_persona import AgentPersona

        with Session(self.engine) as session:
            rows = session.query(AgentPersona).filter(AgentPersona.user_id == self.user_a).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].tone, "b")

    def test_owner_isolation(self) -> None:
        self.client.put(self.BASE, json={"tone": "de-A"})
        self._as(self.user_b)
        # El usuario B no ve la persona de A; arranca vacía.
        self.assertIsNone(self.client.get(self.BASE).json()["tone"])
        self.client.put(self.BASE, json={"tone": "de-B"})
        self.assertEqual(self.client.get(self.BASE).json()["tone"], "de-B")
        # La de A sigue intacta.
        self._as(self.user_a)
        self.assertEqual(self.client.get(self.BASE).json()["tone"], "de-A")

    def test_rejects_unknown_field(self) -> None:
        self.assertEqual(self.client.put(self.BASE, json={"foo": "bar"}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
