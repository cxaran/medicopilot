"""Tests de la configuración del sistema (singleton) y su checklist derivado.

Con PostgreSQL (TEST_POSTGRES_URL hacia una base *_test): API del singleton
(lectura segura, PATCH con candado de despliegue, RBAC), política EFECTIVA de
registro público consumida por /auth/policy y los gates de registro, checklist
derivado del estado real (institución, respaldos, credenciales de IA), descarte
del onboarding y auditoría con SOLO nombres de campos.
"""

import os
import unittest
import uuid
from unittest import mock
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
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.core.settings import settings  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.audit_event import AuditEvent  # noqa: E402
from backend.app.models.backup import BackupSettings  # noqa: E402
from backend.app.models.setup import PlatformSetup  # noqa: E402
from backend.app.models.system_settings import SystemSettings  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services import system_settings_service as system  # noqa: E402

_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class SystemSettingsApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        with Session(cls.engine) as session:
            actor = User(
                name="Admin",
                last_name="Sistema",
                email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
                hashed_password="x",
                token="t-" + uuid.uuid4().hex,
            )
            session.add(actor)
            session.commit()
            cls.actor_id = actor.id

    def setUp(self) -> None:
        # El checklist DERIVA de otras tablas (respaldos, médicos, credenciales de
        # IA): se limpian aquí para aislar el estado de corridas previas de otras
        # suites contra la misma base *_test.
        from backend.app.models.ai_provider_credential import AiProviderCredential
        from backend.app.models.doctor import Doctor

        with Session(self.engine) as session:
            session.execute(delete(AuditEvent))
            session.execute(delete(SystemSettings))
            session.execute(delete(PlatformSetup))
            session.execute(delete(BackupSettings))
            session.execute(delete(Doctor))
            session.execute(delete(AiProviderCredential))
            session.add(SystemSettings())
            session.add(PlatformSetup(id=1, status="completed"))
            session.commit()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("system_settings:read", "system_settings:configure")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Sistema",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _settings_id(self) -> str:
        page = self.client.get("/api/v1/system-settings")
        self.assertEqual(page.status_code, 200, page.text)
        return page.json()["items"][0]["id"]

    # -- Singleton: lectura y edición ----------------------------------------------

    def test_detail_exposes_effective_policy_and_environment(self) -> None:
        sid = self._settings_id()
        detail = self.client.get(f"/api/v1/system-settings/{sid}")
        self.assertEqual(detail.status_code, 200, detail.text)
        body = detail.json()
        self.assertFalse(body["public_registration_enabled"])
        self.assertTrue(body["registration_allowed_by_deployment"])  # local
        self.assertFalse(body["public_registration_effective"])
        self.assertEqual(body["environment"], "local")

    def test_patch_updates_policy_and_audits_field_names_only(self) -> None:
        sid = self._settings_id()
        resp = self.client.patch(
            f"/api/v1/system-settings/{sid}",
            json={"public_registration_enabled": True, "institution_name": "Clínica Eseasa"},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertTrue(body["public_registration_enabled"])
        self.assertTrue(body["public_registration_effective"])
        self.assertEqual(body["institution_name"], "Clínica Eseasa")
        with Session(self.engine) as session:
            event = session.exec(
                select(AuditEvent).where(AuditEvent.action == "system_settings_updated")
            ).one()
            self.assertEqual(event.actor_user_id, self.actor_id)
            fields = (event.changed_fields or {}).get("fields", [])
            # Solo NOMBRES de campos: jamás valores.
            self.assertEqual(fields, ["institution_name", "public_registration_enabled"])
            self.assertNotIn("Clínica Eseasa", str(event.changed_fields))

    def test_deployment_gate_blocks_enabling_registration(self) -> None:
        sid = self._settings_id()
        with mock.patch.object(settings, "registration_allowed", False):
            resp = self.client.patch(
                f"/api/v1/system-settings/{sid}",
                json={"public_registration_enabled": True},
            )
        self.assertEqual(resp.status_code, 409, resp.text)
        self.assertIn("registration_locked_by_deployment", resp.text)

    def test_rbac(self) -> None:
        sid = self._settings_id()
        self._as()  # sin permisos
        self.assertEqual(self.client.get("/api/v1/system-settings").status_code, 403)
        self._as("system_settings:read")  # lectura sin configurar
        self.assertEqual(self.client.get(f"/api/v1/system-settings/{sid}").status_code, 200)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/system-settings/{sid}", json={"institution_name": "X"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/v1/system-settings/setup-checklist/dismiss").status_code,
            403,
        )

    # -- Política efectiva en auth --------------------------------------------------

    def test_auth_policy_and_register_gates_read_database(self) -> None:
        sid = self._settings_id()
        policy = self.client.get("/api/v1/auth/policy")
        self.assertEqual(policy.status_code, 200)
        self.assertFalse(policy.json()["registration_enabled"])
        register = self.client.post(
            "/api/v1/auth/register/request", json={"email": "nuevo@example.com"}
        )
        self.assertEqual(register.status_code, 403)

        self.client.patch(
            f"/api/v1/system-settings/{sid}", json={"public_registration_enabled": True}
        )
        policy = self.client.get("/api/v1/auth/policy")
        self.assertTrue(policy.json()["registration_enabled"])

        # El gate del despliegue manda incluso con la política en true.
        with mock.patch.object(settings, "registration_allowed", False):
            policy = self.client.get("/api/v1/auth/policy")
            self.assertFalse(policy.json()["registration_enabled"])

    # -- Checklist derivado ----------------------------------------------------------

    def test_checklist_derives_from_real_state(self) -> None:
        sid = self._settings_id()
        checklist = self.client.get("/api/v1/system-settings/setup-checklist").json()
        by_key = {item["key"]: item for item in checklist["items"]}
        self.assertEqual(by_key["institution"]["status"], "pending")
        self.assertEqual(by_key["registration"]["status"], "complete")
        self.assertEqual(by_key["domain"]["status"], "pending")
        self.assertEqual(by_key["email"]["status"], "complete")  # local: Mailpit
        self.assertEqual(by_key["backups"]["status"], "pending")
        self.assertFalse(checklist["dismissed"])
        self.assertGreater(checklist["pending_count"], 0)

        # Configurar institución y habilitar respaldos cambia el estado DERIVADO.
        self.client.patch(
            f"/api/v1/system-settings/{sid}", json={"institution_name": "Clínica"}
        )
        with Session(self.engine) as session:
            session.add(
                BackupSettings(
                    timezone="UTC",
                    daily_time=__import__("datetime").time(2, 0),
                    filename_prefix="medicopilot",
                    retention_daily_count=7,
                    retention_monthly_count=12,
                    retention_yearly_count=5,
                    enabled=True,
                )
            )
            session.commit()
        checklist = self.client.get("/api/v1/system-settings/setup-checklist").json()
        by_key = {item["key"]: item for item in checklist["items"]}
        self.assertEqual(by_key["institution"]["status"], "complete")
        self.assertEqual(by_key["backups"]["status"], "complete")

    def test_dismiss_onboarding_persists(self) -> None:
        resp = self.client.post("/api/v1/system-settings/setup-checklist/dismiss")
        self.assertEqual(resp.status_code, 204)
        checklist = self.client.get("/api/v1/system-settings/setup-checklist").json()
        self.assertTrue(checklist["dismissed"])

    # -- Correo configurable y política de reset --------------------------------------

    def _with_fernet_key(self):  # type: ignore[no-untyped-def]
        from cryptography.fernet import Fernet
        from pydantic import SecretStr

        return mock.patch.object(
            settings, "backup_token_encryption_key", SecretStr(Fernet.generate_key().decode())
        )

    def test_smtp_secret_is_write_only_and_encrypted(self) -> None:
        sid = self._settings_id()
        with self._with_fernet_key():
            resp = self.client.patch(
                f"/api/v1/system-settings/{sid}",
                json={
                    "email_mode": "smtp",
                    "email_smtp_host": "smtp.example.com",
                    "email_smtp_port": 587,
                    "email_from_address": "clinica@example.com",
                    "email_smtp_password": "super-secreta-123",
                },
            )
            self.assertEqual(resp.status_code, 200, resp.text)
            body = resp.json()
            self.assertTrue(body["email_smtp_password_configured"])
            self.assertIsNone(body["email_transport_reason"])
            # El secreto JAMÁS aparece en la respuesta ni en claro en la fila.
            self.assertNotIn("super-secreta-123", resp.text)
            with Session(self.engine) as session:
                row = session.exec(select(SystemSettings)).one()
                assert row.email_smtp_password_ciphertext is not None
                self.assertNotIn("super-secreta-123", row.email_smtp_password_ciphertext)

            # Omitir el campo lo CONSERVA; enviar null lo BORRA.
            keep = self.client.patch(
                f"/api/v1/system-settings/{sid}", json={"email_from_name": "Clínica"}
            )
            self.assertTrue(keep.json()["email_smtp_password_configured"])
            clear = self.client.patch(
                f"/api/v1/system-settings/{sid}", json={"email_smtp_password": None}
            )
            self.assertFalse(clear.json()["email_smtp_password_configured"])

        # La auditoría lleva SOLO nombres de campos (nunca el secreto).
        with Session(self.engine) as session:
            events = session.exec(
                select(AuditEvent).where(AuditEvent.action == "system_settings_updated")
            ).all()
            self.assertGreater(len(events), 0)
            self.assertNotIn("super-secreta-123", str([e.changed_fields for e in events]))

    def test_send_test_email_persists_outcome(self) -> None:
        sid = self._settings_id()
        with mock.patch(
            "backend.app.services.email_service._send_via_fastapi_mail",
            new_callable=mock.AsyncMock,
        ) as send:
            ok = self.client.post(f"/api/v1/system-settings/{sid}/send-test-email", json={})
            self.assertEqual(ok.status_code, 200, ok.text)
            self.assertEqual(ok.json()["email_last_test_status"], "ok")
            send.assert_awaited_once()
            # El destinatario por defecto es el administrador que ejecuta.
            self.assertEqual(send.await_args.kwargs["email_to"], "admin@example.com")

            send.side_effect = RuntimeError("boom")
            fail = self.client.post(f"/api/v1/system-settings/{sid}/send-test-email", json={})
            self.assertEqual(fail.json()["email_last_test_status"], "failed")
            self.assertIn("RuntimeError", fail.json()["email_last_test_error"])

    def test_production_environment_mode_rejects_dev_mailbox(self) -> None:
        from backend.app.services.email_service import transport_unavailable_reason

        with Session(self.engine) as session:
            row = session.exec(select(SystemSettings)).one()
        # En local, Mailpit es válido; en producción, el mismo transporte se niega.
        self.assertIsNone(transport_unavailable_reason(row))
        with mock.patch.object(settings, "environment", "production"):
            reason = transport_unavailable_reason(row)
            self.assertIsNotNone(reason)
            assert reason is not None
            self.assertIn("buzón de desarrollo", reason)

    def test_password_reset_policy_reads_database(self) -> None:
        sid = self._settings_id()
        policy = self.client.get("/api/v1/auth/policy").json()
        self.assertTrue(policy["password_reset_enabled"])
        self.client.patch(
            f"/api/v1/system-settings/{sid}", json={"password_reset_enabled": False}
        )
        policy = self.client.get("/api/v1/auth/policy").json()
        self.assertFalse(policy["password_reset_enabled"])
        forgot = self.client.post(
            "/api/v1/auth/password/forgot", json={"email": "x@example.com"}
        )
        self.assertEqual(forgot.status_code, 403)

    # -- Servicio: bootstrap aplica la política --------------------------------------

    def test_apply_bootstrap_choices_updates_singleton(self) -> None:
        with Session(self.engine) as session:
            system.apply_bootstrap_choices(
                session,
                public_registration_enabled=True,
                institution_name="  Consultorio Norte  ",
            )
            session.commit()
            row = session.exec(select(SystemSettings)).one()
            self.assertTrue(row.public_registration_enabled)
            self.assertEqual(row.institution_name, "Consultorio Norte")


if __name__ == "__main__":
    unittest.main()
