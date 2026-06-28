"""Tests del endpoint de CONTENIDO de documentos clínicos (F-MEDIOS fase 1).

El servidor solo superficie el contenido (texto de PDF o referencia de visión de imagen);
NO interpreta valores clínicos. Requieren PostgreSQL real (base ``*_test``).
"""

import hashlib
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
from backend.app.services.document_content import build_document_content  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


def make_text_pdf(text: str) -> bytes:
    """PDF mínimo de una página con una capa de texto extraíble por pypdf (o vacía)."""
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    ]
    stream = b"BT /F1 12 Tf 72 720 Td (" + text.encode("latin-1") + b") Tj ET"
    objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
    for off in offsets:
        out += ("%010d 00000 n \n" % off).encode()
    out += b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
    out += b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
    return bytes(out)


# PNG 1x1 transparente (cabecera real PNG) para el caso de imagen.
_PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000154a24f1f0000000049454e44ae426082"
)


class DocumentContentExtractionUnitTest(unittest.TestCase):
    """Unidad del servicio de extracción (sin DB): no interpreta, solo superficie."""

    def _doc(self, mime: str, content: bytes) -> ClinicalDocument:
        return ClinicalDocument(
            id=uuid.uuid4(),
            patient_id=uuid.uuid4(),
            document_type=ClinicalDocumentType.PDF,
            status=ClinicalDocumentStatus.ACTIVE,
            original_filename="x",
            file_content=content,
            mime_type=mime,
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )

    def test_pdf_text_extracted(self) -> None:
        c = build_document_content(self._doc("application/pdf", make_text_pdf("HbA1c 7.2 %")))
        self.assertEqual(c.content_kind, "text")
        self.assertIn("HbA1c", c.text or "")

    def test_pdf_without_text_layer_is_not_fabricated(self) -> None:
        c = build_document_content(self._doc("application/pdf", make_text_pdf("")))
        self.assertEqual(c.content_kind, "text")
        self.assertIsNone(c.text)
        self.assertIn("escaneado", (c.notes or "").lower())

    def test_image_returns_vision_reference_not_text(self) -> None:
        c = build_document_content(self._doc("image/png", _PNG_1X1))
        self.assertEqual(c.content_kind, "image")
        self.assertIsNone(c.text)
        self.assertIn("/download", c.download_url)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class DocumentContentRoutesTest(unittest.TestCase):
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
                    full_name="Paciente Medios",
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

    def _doc(self, *, mime: str, content: bytes, doc_type: ClinicalDocumentType, deleted: bool = False) -> uuid.UUID:
        did = uuid.uuid4()
        with Session(self.engine) as session:
            doc = ClinicalDocument(
                id=did,
                patient_id=self.patient_id,
                document_type=doc_type,
                status=ClinicalDocumentStatus.DELETED if deleted else ClinicalDocumentStatus.ACTIVE,
                original_filename="reporte",
                file_content=content,
                mime_type=mime,
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

    def test_pdf_content_returns_text_and_attribution(self) -> None:
        did = self._doc(
            mime="application/pdf",
            content=make_text_pdf("HbA1c 7.2 % (ref 4.0-5.6)"),
            doc_type=ClinicalDocumentType.PDF,
        )
        r = self.client.get(f"/api/v1/clinical-documents/{did}/content")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["content_kind"], "text")
        self.assertIn("HbA1c", body["text"])
        # Atribución: el agente sabe a qué paciente/documento pertenece.
        self.assertEqual(body["patient_id"], str(self.patient_id))
        self.assertEqual(body["document_id"], str(did))
        self.assertTrue(body["download_url"].endswith(f"{did}/download"))

    def test_image_content_returns_vision_reference(self) -> None:
        did = self._doc(mime="image/png", content=_PNG_1X1, doc_type=ClinicalDocumentType.IMAGE)
        body = self.client.get(f"/api/v1/clinical-documents/{did}/content").json()
        self.assertEqual(body["content_kind"], "image")
        self.assertIsNone(body["text"])
        self.assertTrue(body["download_url"].endswith(f"{did}/download"))

    def test_scanned_pdf_without_text_is_not_fabricated(self) -> None:
        did = self._doc(
            mime="application/pdf", content=make_text_pdf(""), doc_type=ClinicalDocumentType.PDF
        )
        body = self.client.get(f"/api/v1/clinical-documents/{did}/content").json()
        self.assertEqual(body["content_kind"], "text")
        self.assertIsNone(body["text"])

    def test_rbac_denies_without_read_permission(self) -> None:
        did = self._doc(
            mime="application/pdf", content=make_text_pdf("x"), doc_type=ClinicalDocumentType.PDF
        )
        self._as()  # sin permisos
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-documents/{did}/content").status_code, 403
        )

    def test_soft_deleted_document_not_returned(self) -> None:
        did = self._doc(
            mime="application/pdf",
            content=make_text_pdf("x"),
            doc_type=ClinicalDocumentType.PDF,
            deleted=True,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-documents/{did}/content").status_code, 404
        )


if __name__ == "__main__":
    unittest.main()
