import logging
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

from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pydantic import SecretStr  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.core.settings import settings  # noqa: E402

settings.ai_credential_key = SecretStr(Fernet.generate_key().decode())

from backend.app.agent.crypto import decrypt_secret  # noqa: E402
from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.agent_memory import AgentMemory  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


def _session_user(user_id: uuid.UUID) -> SessionUser:
    return SessionUser(
        id=user_id,
        name="Médica",
        last_name="Tester",
        email=f"u-{user_id.hex[:8]}@example.com",
        permissions=set(),
    )


class AgentMemoryRoutesTest(unittest.TestCase):
    BASE = "/api/v1/users/me/agent-memories"

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

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "title": "Preferencia de saludo",
            "content": "El doctor prefiere notas breves.",
            "kind": "preferencia",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(self.BASE, json=self._payload(**overrides))

    def _stored(self, memory_id: str) -> AgentMemory | None:
        with Session(self.engine) as session:
            return session.get(AgentMemory, uuid.UUID(memory_id))

    def test_create_encrypts_and_owner_reads_decrypted(self) -> None:
        created = self._create(content="secreto-clinico-xyz", kind="hecho_clinico")
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["kind"], "hecho_clinico")
        # El dueño SÍ recibe el contenido descifrado (es su memoria).
        self.assertEqual(body["content"], "secreto-clinico-xyz")

        stored = self._stored(body["id"])
        assert stored is not None
        # En reposo se guarda cifrado, nunca el claro.
        self.assertNotIn("secreto-clinico-xyz", stored.content_encrypted)
        self.assertEqual(decrypt_secret(stored.content_encrypted), "secreto-clinico-xyz")
        # El esquema ORM no tiene un atributo "content" en claro.
        self.assertFalse(hasattr(stored, "content"))

    def test_list_returns_only_owner_memories(self) -> None:
        self._create(title="A1")
        self._as(self.user_b)
        self.assertEqual(self.client.get(self.BASE).json(), [])
        self._create(title="B1")
        self.assertEqual(len(self.client.get(self.BASE).json()), 1)
        self._as(self.user_a)
        listed = self.client.get(self.BASE).json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["title"], "A1")

    def test_other_user_cannot_read_edit_or_delete(self) -> None:
        created = self._create().json()
        memory_id = created["id"]
        self._as(self.user_b)
        self.assertEqual(
            self.client.patch(f"{self.BASE}/{memory_id}", json={"title": "hack"}).status_code,
            404,
        )
        self.assertEqual(self.client.delete(f"{self.BASE}/{memory_id}").status_code, 404)
        # La memoria del dueño sigue intacta.
        self._as(self.user_a)
        self.assertEqual(self.client.get(self.BASE).json()[0]["title"], "Preferencia de saludo")

    def test_filter_by_patient(self) -> None:
        patient_a = uuid.uuid4()
        patient_b = uuid.uuid4()
        self._create(title="P-A", patient_id=str(patient_a))
        self._create(title="P-B", patient_id=str(patient_b))
        self._create(title="Sin paciente")

        all_memories = self.client.get(self.BASE).json()
        self.assertEqual(len(all_memories), 3)

        filtered = self.client.get(self.BASE, params={"patient_id": str(patient_a)}).json()
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["title"], "P-A")
        self.assertEqual(filtered[0]["patient_id"], str(patient_a))

    def test_update_recyphers_content(self) -> None:
        memory_id = self._create().json()["id"]
        response = self.client.patch(
            f"{self.BASE}/{memory_id}",
            json={"title": "Renombrada", "content": "nuevo-contenido"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["title"], "Renombrada")
        self.assertEqual(body["content"], "nuevo-contenido")

        stored = self._stored(memory_id)
        assert stored is not None
        self.assertEqual(decrypt_secret(stored.content_encrypted), "nuevo-contenido")

    def test_update_rejects_unknown_field(self) -> None:
        memory_id = self._create().json()["id"]
        response = self.client.patch(f"{self.BASE}/{memory_id}", json={"user_id": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 422, response.text)

    def test_soft_delete_hides_and_is_idempotent_safe(self) -> None:
        memory_id = self._create().json()["id"]
        deleted = self.client.delete(f"{self.BASE}/{memory_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(self.client.get(self.BASE).json(), [])
        # Segunda baja ya no la encuentra (deleted_at != null -> 404).
        self.assertEqual(self.client.delete(f"{self.BASE}/{memory_id}").status_code, 404)

        stored = self._stored(memory_id)
        assert stored is not None
        self.assertIsNotNone(stored.deleted_at)

    def test_create_validates_kind_enum(self) -> None:
        self.assertEqual(self._create(kind="no-such-kind").status_code, 422)

    def test_content_is_not_written_to_logs(self) -> None:
        records: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                records.append(self.format(record))

        handler = _Capture()
        handler.setFormatter(logging.Formatter("%(message)s"))
        root = logging.getLogger()
        previous_level = root.level
        root.setLevel(logging.DEBUG)
        root.addHandler(handler)
        try:
            response = self._create(content="contenido-no-debe-loguearse-7777")
        finally:
            root.removeHandler(handler)
            root.setLevel(previous_level)

        self.assertEqual(response.status_code, 201, response.text)
        joined = "\n".join(records)
        self.assertNotIn("contenido-no-debe-loguearse-7777", joined)


if __name__ == "__main__":
    unittest.main()
