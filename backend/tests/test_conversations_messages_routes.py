"""Tests de persistencia del chat del copiloto (CONVERSATION + MESSAGE).

``Conversation`` persiste cada hilo (de un paciente o el chat global con ``patient_id`` nulo) y
``Message`` cada turno del hilo (rol, contenido, payload), con ``sequence_index`` asignado por el
servidor para mantener el orden. Las pruebas de ruta usan Postgres real (sólo si TEST_POSTGRES_URL
apunta a una base *_test): verifican alta con auditoría, el chat global sin paciente, el append
ordenado, la lectura filtrada por paciente/conversación excluyendo eliminados, el CHECK del enum de
rol, el RBAC y la baja lógica. Persistir el hilo NO es una escritura clínica (no requiere P1).
"""

import os
import unittest
import uuid
from datetime import date, datetime, timezone
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
from sqlalchemy import create_engine, delete, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.conversation import Conversation  # noqa: E402
from backend.app.models.enums import Sex  # noqa: E402
from backend.app.models.message import Message  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

_ALL_PERMS = (
    "conversations:read",
    "conversations:create",
    "messages:read",
    "messages:create",
)


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class ChatPersistencePermissionUnitTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for perm in _ALL_PERMS:
            self.assertIn(perm, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ChatPersistenceRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.other_patient_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Médico", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Patient(id=cls.patient_id, full_name="Paciente Chat",
                                birth_date=date(1980, 1, 1), sex=Sex.MALE))
            session.add(Patient(id=cls.other_patient_id, full_name="Otro Paciente",
                                birth_date=date(1990, 1, 1), sex=Sex.FEMALE))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(Message))
            session.execute(delete(Conversation))
            session.execute(delete(Patient))
            session.execute(delete(User))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as(*_ALL_PERMS)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def _new_conversation(self, **overrides):  # type: ignore[no-untyped-def]
        payload = {"patient_id": str(self.patient_id), "title": "Hilo de prueba"}
        payload.update(overrides)
        return self.client.post("/api/v1/conversations", json=payload)

    def _append(self, conversation_id, role="user", content="Hola", **overrides):  # type: ignore[no-untyped-def]
        payload = {"conversation_id": str(conversation_id), "role": role, "content": content}
        payload.update(overrides)
        return self.client.post("/api/v1/messages", json=payload)

    # ----- Conversaciones -----

    def test_create_conversation_with_patient_persists_audit(self) -> None:
        resp = self._new_conversation()
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["patient_id"], str(self.patient_id))
        self.assertEqual(body["title"], "Hilo de prueba")
        with Session(self.engine) as session:
            item = session.get(Conversation, uuid.UUID(body["id"]))
            assert item is not None
            self.assertEqual(item.created_by, self.actor_id)
            self.assertEqual(item.updated_by, self.actor_id)
            self.assertIsNone(item.deleted_at)

    def test_create_global_conversation_without_patient(self) -> None:
        # El chat global del inicio no lleva paciente (patient_id nulo).
        resp = self._new_conversation(patient_id=None, title=None)
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertIsNone(body["patient_id"])
        self.assertIsNone(body["title"])

    def test_create_conversation_nonexistent_patient_rejected(self) -> None:
        resp = self._new_conversation(patient_id=str(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404, resp.text)

    def test_list_conversations_filtered_by_patient_excludes_deleted(self) -> None:
        mine = self._new_conversation().json()["id"]
        self._new_conversation(patient_id=str(self.other_patient_id)).json()
        deleted_id = self._new_conversation().json()["id"]
        # Baja lógica directa (no hay endpoint DELETE: la baja se ejercita a nivel de modelo).
        with Session(self.engine) as session:
            conv = session.get(Conversation, uuid.UUID(deleted_id))
            assert conv is not None
            conv.deleted_at = datetime.now(timezone.utc)
            conv.deleted_by = self.actor_id
            session.add(conv)
            session.commit()

        listed = self.client.get(
            f"/api/v1/conversations?patient_id={self.patient_id}"
        ).json()
        ids = {row["id"] for row in listed["items"]}
        self.assertIn(mine, ids)
        self.assertNotIn(deleted_id, ids)  # eliminado excluido
        for row in listed["items"]:
            self.assertEqual(row["patient_id"], str(self.patient_id))  # filtro por paciente
        # El detalle de uno eliminado lógicamente devuelve 404.
        self.assertEqual(
            self.client.get(f"/api/v1/conversations/{deleted_id}").status_code, 404
        )

    # ----- Mensajes -----

    def test_append_assigns_sequential_index_and_orders(self) -> None:
        conv = self._new_conversation().json()["id"]
        first = self._append(conv, role="user", content="Primero")
        second = self._append(conv, role="assistant", content="Segundo")
        third = self._append(conv, role="tool", content="Tercero")
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(first.json()["sequence_index"], 0)
        self.assertEqual(second.json()["sequence_index"], 1)
        self.assertEqual(third.json()["sequence_index"], 2)

        listed = self.client.get(f"/api/v1/messages?conversation_id={conv}").json()
        seqs = [row["sequence_index"] for row in listed["items"]]
        self.assertEqual(seqs, sorted(seqs))  # orden ascendente por sequence_index
        contents = [row["content"] for row in listed["items"]]
        self.assertEqual(contents, ["Primero", "Segundo", "Tercero"])

    def test_append_persists_payload_and_role(self) -> None:
        conv = self._new_conversation().json()["id"]
        resp = self._append(
            conv, role="assistant", content="con payload",
            payload={"tool_calls": [{"name": "search_patients"}]},
        )
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["role"], "assistant")
        self.assertEqual(body["payload"], {"tool_calls": [{"name": "search_patients"}]})

    def test_append_to_nonexistent_conversation_rejected(self) -> None:
        resp = self._append(uuid.uuid4())
        self.assertEqual(resp.status_code, 404, resp.text)

    def test_list_messages_excludes_soft_deleted(self) -> None:
        conv = self._new_conversation().json()["id"]
        keep = self._append(conv, content="Se queda").json()["id"]
        gone = self._append(conv, content="Se elimina").json()["id"]
        with Session(self.engine) as session:
            msg = session.get(Message, uuid.UUID(gone))
            assert msg is not None
            msg.deleted_at = datetime.now(timezone.utc)
            msg.deleted_by = self.actor_id
            session.add(msg)
            session.commit()
        listed = self.client.get(f"/api/v1/messages?conversation_id={conv}").json()
        ids = {row["id"] for row in listed["items"]}
        self.assertIn(keep, ids)
        self.assertNotIn(gone, ids)

    def test_invalid_role_rejected_by_api(self) -> None:
        conv = self._new_conversation().json()["id"]
        self.assertEqual(self._append(conv, role="inventado").status_code, 422)

    def test_db_check_constraint_rejects_invalid_role(self) -> None:
        # Inserción CRUDA saltándose Pydantic/ORM: el CHECK del enum no-nativo de rol debe
        # rechazar un valor fuera del dominio. El valor inválido CABE en el VARCHAR (el enum
        # se materializa como VARCHAR dimensionado al valor más largo, 'assistant'): así se
        # ejercita el CHECK, no el límite de longitud.
        conv = self._new_conversation().json()["id"]
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.execute(
                    text(
                        "INSERT INTO messages"
                        " (id, conversation_id, role, content, sequence_index)"
                        " VALUES (:id, :cid, 'invalido', '', 0)"
                    ),
                    {"id": str(uuid.uuid4()), "cid": conv},
                )
                session.commit()

    # ----- RBAC -----

    def test_requires_permission(self) -> None:
        self._as("consultations:read")  # sin conversations:* ni messages:*
        self.assertEqual(
            self.client.get(
                f"/api/v1/conversations?patient_id={self.patient_id}"
            ).status_code,
            403,
        )
        self.assertEqual(self._new_conversation().status_code, 403)
        self.assertEqual(
            self.client.get(f"/api/v1/messages?conversation_id={uuid.uuid4()}").status_code,
            403,
        )
        self.assertEqual(self._append(uuid.uuid4()).status_code, 403)


if __name__ == "__main__":
    unittest.main()
