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

# La clave Fernet se fija en el objeto settings (cacheado) para no depender del
# orden de import dentro de la suite canónica.
settings.ai_credential_key = SecretStr(Fernet.generate_key().decode())

from backend.app.agent.crypto import decrypt_secret, encrypt_secret  # noqa: E402
from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.ai_provider_credential import AiProviderCredential  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


def _session_user(user_id: uuid.UUID) -> SessionUser:
    return SessionUser(
        id=user_id,
        name="Médica",
        last_name="Tester",
        email=f"u-{user_id.hex[:8]}@example.com",
        permissions=set(),
    )


class CryptoRoundTripTest(unittest.TestCase):
    def test_encrypt_then_decrypt_returns_original(self) -> None:
        plaintext = "sk-super-secret-value-123"
        token = encrypt_secret(plaintext)
        self.assertNotEqual(token, plaintext)
        self.assertNotIn(plaintext, token)
        self.assertEqual(decrypt_secret(token), plaintext)

    def test_each_encryption_is_nondeterministic(self) -> None:
        # Fernet incluye IV/timestamp: dos cifrados del mismo claro difieren.
        self.assertNotEqual(encrypt_secret("same"), encrypt_secret("same"))


class AiProviderCredentialRoutesTest(unittest.TestCase):
    BASE = "/api/v1/users/me/ai-providers"

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
            "provider": "openai",
            "label": "Mi OpenAI",
            "secret": "sk-plaintext-secret",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(self.BASE, json=self._payload(**overrides))

    def _stored(self, credential_id: str) -> AiProviderCredential | None:
        with Session(self.engine) as session:
            return session.get(AiProviderCredential, uuid.UUID(credential_id))

    def test_create_encrypts_and_never_returns_plaintext(self) -> None:
        created = self._create(secret="sk-top-secret-xyz", default_model="gpt-4o")
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["provider"], "openai")
        self.assertEqual(body["label"], "Mi OpenAI")
        self.assertTrue(body["is_active"])
        self.assertEqual(body["default_model"], "gpt-4o")
        # El claro nunca aparece en la respuesta, ni el campo del secreto.
        self.assertNotIn("sk-top-secret-xyz", created.text)
        self.assertNotIn("secret", body)
        self.assertNotIn("secret_encrypted", body)

        stored = self._stored(body["id"])
        assert stored is not None
        self.assertNotEqual(stored.secret_encrypted, "sk-top-secret-xyz")
        self.assertEqual(decrypt_secret(stored.secret_encrypted), "sk-top-secret-xyz")

    def test_list_returns_only_owner_credentials(self) -> None:
        self._create(label="A1")
        self._as(self.user_b)
        self.assertEqual(self.client.get(self.BASE).json(), [])
        self._create(label="B1")
        self.assertEqual(len(self.client.get(self.BASE).json()), 1)
        self._as(self.user_a)
        listed = self.client.get(self.BASE).json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["label"], "A1")

    def test_other_user_cannot_read_edit_or_delete(self) -> None:
        created = self._create().json()
        cred_id = created["id"]
        self._as(self.user_b)
        self.assertEqual(self.client.patch(f"{self.BASE}/{cred_id}", json={"label": "hack"}).status_code, 404)
        self.assertEqual(self.client.delete(f"{self.BASE}/{cred_id}").status_code, 404)
        # La credencial del dueño sigue intacta.
        self._as(self.user_a)
        self.assertEqual(self.client.get(self.BASE).json()[0]["label"], "Mi OpenAI")

    def test_update_changes_fields_and_recyphers_secret(self) -> None:
        created = self._create().json()
        cred_id = created["id"]
        response = self.client.patch(
            f"{self.BASE}/{cred_id}",
            json={"label": "Renombrada", "is_active": False, "secret": "sk-rotated"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["label"], "Renombrada")
        self.assertFalse(body["is_active"])
        self.assertNotIn("sk-rotated", response.text)

        stored = self._stored(cred_id)
        assert stored is not None
        self.assertEqual(decrypt_secret(stored.secret_encrypted), "sk-rotated")

    def test_update_rejects_unknown_field(self) -> None:
        cred_id = self._create().json()["id"]
        # provider es inmutable / extra forbid -> 422.
        response = self.client.patch(f"{self.BASE}/{cred_id}", json={"provider": "anthropic"})
        self.assertEqual(response.status_code, 422, response.text)

    def test_soft_delete_hides_and_is_idempotent_safe(self) -> None:
        cred_id = self._create().json()["id"]
        deleted = self.client.delete(f"{self.BASE}/{cred_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(self.client.get(self.BASE).json(), [])
        # Segunda baja ya no la encuentra (deleted_at != null -> 404).
        self.assertEqual(self.client.delete(f"{self.BASE}/{cred_id}").status_code, 404)

        stored = self._stored(cred_id)
        assert stored is not None
        self.assertIsNotNone(stored.deleted_at)

    def test_create_validates_provider_enum(self) -> None:
        self.assertEqual(self._create(provider="no-such-provider").status_code, 422)


if __name__ == "__main__":
    unittest.main()
