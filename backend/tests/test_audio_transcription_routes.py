"""Tests de la transcripción de audio de consulta (F-MEDIOS fase 2).

El STT es un PROVEEDOR configurable; sin proveedor, "no disponible" (nunca fabrica). El
stub local (``stub://``) ejercita el camino end-to-end. Requieren PostgreSQL real para las
rutas (base ``*_test``); las pruebas de unidad del servicio no.
"""

import hashlib
import os
import unittest
import uuid
from datetime import date
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
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.core.settings import settings  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.clinical_document import ClinicalDocument  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ClinicalDocumentStatus,
    ClinicalDocumentType,
    PatientStatus,
    Sex,
)
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services import audio_transcription as stt  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


def _audio_doc(mime: str = "audio/mpeg") -> ClinicalDocument:
    content = b"FAKE-AUDIO-BYTES"
    return ClinicalDocument(
        id=uuid.uuid4(),
        patient_id=uuid.uuid4(),
        document_type=ClinicalDocumentType.AUDIO,
        status=ClinicalDocumentStatus.ACTIVE,
        original_filename="consulta.mp3",
        file_content=content,
        mime_type=mime,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )


class _StubResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class TranscriptionServiceUnitTest(unittest.TestCase):
    """Unidad del servicio: stub, no disponible, no-audio y proveedor real (mock)."""

    def tearDown(self) -> None:
        settings.stt_provider_url = None

    def test_stub_provider_returns_canned_transcript(self) -> None:
        settings.stt_provider_url = "stub://canned"
        result = stt.transcribe_document(_audio_doc())
        self.assertTrue(result.available)
        self.assertEqual(result.transcript, stt.STUB_TRANSCRIPT)
        self.assertIn("PRUEBA", result.provider or "")

    def test_no_provider_is_not_available_and_not_fabricated(self) -> None:
        settings.stt_provider_url = None
        result = stt.transcribe_document(_audio_doc())
        self.assertFalse(result.available)
        self.assertIsNone(result.transcript)
        self.assertIn("no disponible", (result.notes or "").lower())

    def test_non_audio_document_is_rejected(self) -> None:
        settings.stt_provider_url = "stub://canned"
        doc = _audio_doc(mime="application/pdf")
        doc.document_type = ClinicalDocumentType.PDF
        result = stt.transcribe_document(doc)
        self.assertFalse(result.available)
        self.assertIsNone(result.transcript)

    def test_real_provider_http_contract(self) -> None:
        settings.stt_provider_url = "https://stt.example/transcribe"
        with mock.patch.object(
            stt.httpx, "post", return_value=_StubResponse(200, {"text": "hola doctor"})
        ) as posted:
            result = stt.transcribe_document(_audio_doc())
        self.assertTrue(result.available)
        self.assertEqual(result.transcript, "hola doctor")
        self.assertEqual(result.provider, "stt.example")
        self.assertEqual(posted.call_count, 1)

    def test_real_provider_error_is_not_available(self) -> None:
        settings.stt_provider_url = "https://stt.example/transcribe"
        with mock.patch.object(stt.httpx, "post", return_value=_StubResponse(500, {})):
            result = stt.transcribe_document(_audio_doc())
        self.assertFalse(result.available)
        self.assertIsNone(result.transcript)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class TranscriptRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
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
            session.flush()
            session.add(
                Patient(
                    id=cls.patient_id,
                    full_name="Paciente Audio",
                    birth_date=date(1980, 1, 1),
                    sex=Sex.MALE,
                    status=PatientStatus.ACTIVE,
                    created_by=cls.actor_id,
                    updated_by=cls.actor_id,
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
        self._as("clinical_documents:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        settings.stt_provider_url = None
        with Session(self.engine) as session:
            session.execute(delete(ClinicalDocument))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _audio(self, *, deleted: bool = False) -> uuid.UUID:
        did = uuid.uuid4()
        content = b"FAKE-AUDIO-BYTES"
        with Session(self.engine) as session:
            doc = ClinicalDocument(
                id=did,
                patient_id=self.patient_id,
                document_type=ClinicalDocumentType.AUDIO,
                status=ClinicalDocumentStatus.DELETED if deleted else ClinicalDocumentStatus.ACTIVE,
                original_filename="consulta.mp3",
                file_content=content,
                mime_type="audio/mpeg",
                size_bytes=len(content),
                sha256=hashlib.sha256(content).hexdigest(),
                uploaded_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if deleted:
                from backend.app.utils.utc_now import utc_now

                doc.deleted_at = utc_now()
                doc.deleted_by = self.actor_id
            session.add(doc)
            session.commit()
        return did

    def test_audio_document_can_be_persisted(self) -> None:
        # El valor de enum 'audio' es aceptado por el CHECK (migración aplicada).
        did = self._audio()
        self.assertIsNotNone(did)

    def test_transcript_with_stub_provider(self) -> None:
        settings.stt_provider_url = "stub://canned"
        did = self._audio()
        body = self.client.get(f"/api/v1/clinical-documents/{did}/transcript").json()
        self.assertTrue(body["available"])
        self.assertEqual(body["transcript"], stt.STUB_TRANSCRIPT)
        self.assertEqual(body["patient_id"], str(self.patient_id))

    def test_transcript_no_provider_is_unavailable(self) -> None:
        settings.stt_provider_url = None
        did = self._audio()
        body = self.client.get(f"/api/v1/clinical-documents/{did}/transcript").json()
        self.assertFalse(body["available"])
        self.assertIsNone(body["transcript"])

    def test_rbac_denies_without_read(self) -> None:
        settings.stt_provider_url = "stub://canned"
        did = self._audio()
        self._as()
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-documents/{did}/transcript").status_code, 403
        )

    def test_soft_deleted_returns_404(self) -> None:
        settings.stt_provider_url = "stub://canned"
        did = self._audio(deleted=True)
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-documents/{did}/transcript").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
