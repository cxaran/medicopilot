"""Tests de integración del recurso Clinical Documents.

Requieren PostgreSQL real (binario en ``LargeBinary``, FKs y enums no-nativos). Se
ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en
``_test``.

Regla de seguridad de la vertical verificada aquí: ``file_content`` jamás aparece en
JSON (listado, detalle, respuesta de carga); el binario sólo se entrega por ``/download``
con cabeceras seguras. Los fixtures usan archivos pequeños generados en memoria.
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
from backend.app.core.settings import settings  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.clinical_document import ClinicalDocument  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ConsultationStatus,
    PatientStatus,
    RecordStatus,
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
    "clinical_documents:read",
    "clinical_documents:create",
    "clinical_documents:update",
    "clinical_documents:archive",
    "clinical_documents:restore",
    "clinical_documents:delete",
    "clinical_documents:download",
)
_BASE = "/api/v1/clinical-documents"
_PDF = b"%PDF-1.4\nfake pdf bytes\n%%EOF"


class ClinicalDocumentsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los permisos estén declarados."""

    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ClinicalDocumentRoutesTest(unittest.TestCase):
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
        self.doctor_id = self._seed_doctor()
        self.consultation_id = self._seed_consultation()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ClinicalDocument))
            session.execute(delete(Consultation))
            session.execute(delete(Doctor))
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

    def _seed_patient(self, **overrides: object) -> uuid.UUID:
        patient_id = uuid.uuid4()
        values: dict[str, object] = dict(
            id=patient_id,
            full_name="María García",
            birth_date=date(1990, 5, 4),
            sex=Sex.FEMALE,
            status=PatientStatus.ACTIVE,
            created_by=self.actor_id,
            updated_by=self.actor_id,
        )
        values.update(overrides)
        with Session(self.engine) as session:
            session.add(Patient(**values))
            session.commit()
        return patient_id

    def _seed_doctor(self) -> uuid.UUID:
        doctor_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Doctor(
                    id=doctor_id,
                    user_id=self.actor_id,
                    professional_name="Dra. House",
                    professional_license_number=f"LIC-{doctor_id}",
                    status=RecordStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return doctor_id

    def _seed_consultation(self, *, patient_id: uuid.UUID | None = None) -> uuid.UUID:
        consultation_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Consultation(
                    id=consultation_id,
                    patient_id=patient_id or self.patient_id,
                    attending_doctor_id=self.doctor_id,
                    consulted_at=utc_now(),
                    reason_for_visit="Control",
                    status=ConsultationStatus.DRAFT,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return consultation_id

    def _upload(self, *, file=None, **form):
        data: dict[str, object] = {"patient_id": str(self.patient_id), "document_type": "pdf"}
        data.update(form)
        if file is None:
            file = ("report.pdf", _PDF, "application/pdf")
        return self.client.post(_BASE, data=data, files={"file": file})

    # --- carga ---

    def test_upload_valid_returns_safe_metadata(self) -> None:
        response = self._upload(description="Estudio de control")
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["patient_id"], str(self.patient_id))
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["mime_type"], "application/pdf")
        self.assertEqual(body["size_bytes"], len(_PDF))
        self.assertEqual(body["sha256"], hashlib.sha256(_PDF).hexdigest())
        self.assertNotIn("file_content", body)

    def test_upload_with_consultation(self) -> None:
        response = self._upload(consultation_id=str(self.consultation_id))
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["consultation_id"], str(self.consultation_id))

    def test_upload_ignores_forged_server_governed_fields(self) -> None:
        # Campos de formulario no declarados (hash/tamaño/estado/auditoría) se ignoran:
        # el servidor los gobierna. La respuesta refleja los valores reales.
        response = self._upload(
            sha256="deadbeef",
            size_bytes="1",
            status="archived",
            uploaded_by=str(uuid.uuid4()),
            deleted_at="2020-01-01T00:00:00",
        )
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["sha256"], hashlib.sha256(_PDF).hexdigest())
        self.assertEqual(body["size_bytes"], len(_PDF))
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["uploaded_by"], str(self.actor_id))
        self.assertIsNone(body["deleted_at"])

    def test_upload_patient_not_found(self) -> None:
        response = self.client.post(
            _BASE,
            data={"patient_id": str(uuid.uuid4()), "document_type": "pdf"},
            files={"file": ("r.pdf", _PDF, "application/pdf")},
        )
        self.assertEqual(response.status_code, 404, response.text)

    def test_upload_consultation_not_found(self) -> None:
        response = self._upload(consultation_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404, response.text)

    def test_upload_consultation_of_other_patient_rejected(self) -> None:
        other_patient = self._seed_patient(full_name="Otro Paciente")
        other_consultation = self._seed_consultation(patient_id=other_patient)
        response = self._upload(consultation_id=str(other_consultation))
        self.assertEqual(response.status_code, 422, response.text)

    def test_upload_empty_file_rejected(self) -> None:
        response = self._upload(file=("empty.pdf", b"", "application/pdf"))
        self.assertEqual(response.status_code, 400, response.text)

    def test_upload_unsupported_mime_rejected(self) -> None:
        response = self._upload(file=("evil.exe", b"MZ binary", "application/x-msdownload"))
        self.assertEqual(response.status_code, 415, response.text)

    def test_upload_mime_signature_mismatch_rejected(self) -> None:
        # Declara PDF pero el contenido no empieza con %PDF.
        response = self._upload(file=("fake.pdf", b"not a pdf", "application/pdf"))
        self.assertEqual(response.status_code, 415, response.text)

    def test_upload_too_large_rejected(self) -> None:
        original = settings.clinical_document_max_size_bytes
        settings.clinical_document_max_size_bytes = 8
        try:
            response = self._upload(file=("big.pdf", _PDF, "application/pdf"))
            self.assertEqual(response.status_code, 413, response.text)
        finally:
            settings.clinical_document_max_size_bytes = original

    def test_upload_dangerous_filename_sanitized(self) -> None:
        response = self._upload(file=("../../etc/pa ss*wd.pdf", _PDF, "application/pdf"))
        self.assertEqual(response.status_code, 201, response.text)
        name = response.json()["original_filename"]
        self.assertNotIn("/", name)
        self.assertNotIn("..", name)
        self.assertNotIn("*", name)

    def test_upload_overlong_filename_rejected(self) -> None:
        response = self._upload(file=("a" * 300 + ".pdf", _PDF, "application/pdf"))
        self.assertEqual(response.status_code, 400, response.text)

    # --- lectura / descarga ---

    def test_list_and_detail_hide_file_content(self) -> None:
        self._upload()
        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        item = listed["items"][0]
        self.assertNotIn("file_content", item)
        detail = self.client.get(f"{_BASE}/{item['id']}").json()
        self.assertNotIn("file_content", detail)

    def test_download_returns_bytes_with_secure_headers(self) -> None:
        document_id = self._upload().json()["id"]
        response = self.client.get(f"{_BASE}/{document_id}/download")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, _PDF)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_archived_document_is_downloadable(self) -> None:
        document_id = self._upload().json()["id"]
        self.client.post(f"{_BASE}/{document_id}/archive")
        self.assertEqual(
            self.client.get(f"{_BASE}/{document_id}/download").status_code, 200
        )

    def test_deleted_document_download_blocked(self) -> None:
        document_id = self._upload().json()["id"]
        self.client.delete(f"{_BASE}/{document_id}")
        self.assertEqual(
            self.client.get(f"{_BASE}/{document_id}/download").status_code, 404
        )
        self.assertEqual(self.client.get(f"{_BASE}/{document_id}").status_code, 404)

    # --- edición de metadata ---

    def test_patch_metadata(self) -> None:
        document_id = self._upload().json()["id"]
        response = self.client.patch(
            f"{_BASE}/{document_id}",
            json={"description": "Actualizado", "document_type": "laboratory"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["description"], "Actualizado")
        self.assertEqual(response.json()["document_type"], "laboratory")

    def test_patch_rejects_server_governed_fields(self) -> None:
        document_id = self._upload().json()["id"]
        for body in (
            {"file_content": "abc"},
            {"sha256": "x"},
            {"size_bytes": 1},
            {"status": "archived"},
            {"uploaded_by": str(uuid.uuid4())},
            {"original_filename": "hack.pdf"},
        ):
            with self.subTest(body=body):
                self.assertEqual(
                    self.client.patch(f"{_BASE}/{document_id}", json=body).status_code,
                    422,
                    body,
                )

    # --- transiciones de estado ---

    def test_archive_then_restore_cycle(self) -> None:
        document_id = self._upload().json()["id"]
        archived = self.client.post(f"{_BASE}/{document_id}/archive")
        self.assertEqual(archived.status_code, 200, archived.text)
        self.assertEqual(archived.json()["status"], "archived")

        deleted = self.client.delete(f"{_BASE}/{document_id}")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(deleted.json()["status"], "deleted")

        restored = self.client.post(f"{_BASE}/{document_id}/restore")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertEqual(restored.json()["status"], "active")
        self.assertIsNone(restored.json()["deleted_at"])

    def test_forced_invalid_transitions_return_409(self) -> None:
        document_id = self._upload().json()["id"]
        # restaurar un documento activo: estado inválido.
        forced_restore = self.client.post(f"{_BASE}/{document_id}/restore")
        self.assertEqual(forced_restore.status_code, 409, forced_restore.text)
        self.assertEqual(forced_restore.json()["code"], "clinical_document_state_invalid")

        # archivar dos veces: la segunda es inválida.
        self.client.post(f"{_BASE}/{document_id}/archive")
        self.assertEqual(
            self.client.post(f"{_BASE}/{document_id}/archive").status_code, 409
        )

    def test_repeated_delete_is_safe(self) -> None:
        document_id = self._upload().json()["id"]
        self.assertEqual(self.client.delete(f"{_BASE}/{document_id}").status_code, 200)
        # El documento ya no es visible: segunda baja responde 404 (no 500).
        self.assertEqual(self.client.delete(f"{_BASE}/{document_id}").status_code, 404)

    def test_action_nonexistent_document(self) -> None:
        missing = uuid.uuid4()
        self.assertEqual(self.client.get(f"{_BASE}/{missing}").status_code, 404)
        self.assertEqual(
            self.client.get(f"{_BASE}/{missing}/download").status_code, 404
        )
        self.assertEqual(self.client.post(f"{_BASE}/{missing}/archive").status_code, 404)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        document_id = self._upload().json()["id"]

        self._as("clinical_documents:read")  # sin download
        self.assertEqual(
            self.client.get(f"{_BASE}/{document_id}/download").status_code, 403
        )

        self._as("clinical_documents:download")  # sin read/create/update/delete
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self._upload().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{document_id}", json={"description": "x"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{document_id}").status_code, 403)
        self.assertEqual(
            self.client.post(f"{_BASE}/{document_id}/archive").status_code, 403
        )

    def test_download_requires_session(self) -> None:
        document_id = self._upload().json()["id"]
        app.dependency_overrides.pop(get_current_user, None)  # sin sesión
        response = self.client.get(f"{_BASE}/{document_id}/download")
        self.assertEqual(response.status_code, 401)

    # --- contrato de capabilities ---

    def test_capability_is_multipart_and_hides_binary(self) -> None:
        cap = self.client.get(f"{_BASE.replace('/clinical-documents', '')}/resources/clinical_documents").json()
        self.assertEqual(cap["forms"]["create"]["transport"], "multipart")
        self.assertEqual(cap["forms"]["create"]["file_field"]["name"], "file")
        create_fields = {f["name"] for f in cap["forms"]["create"]["fields"]}
        self.assertNotIn("file_content", create_fields)
        self.assertEqual(
            cap["file_download"]["url_template"],
            "/api/v1/clinical-documents/{id}/download",
        )

    def test_no_clinical_document_route_returns_binary_in_json(self) -> None:
        # El único endpoint que entrega binario es /download (no JSON). Las rutas JSON
        # nunca incluyen file_content.
        document_id = self._upload().json()["id"]
        for response in (
            self.client.get(_BASE),
            self.client.get(f"{_BASE}/{document_id}"),
        ):
            self.assertEqual(response.headers["content-type"].split(";")[0], "application/json")
            self.assertNotIn("file_content", response.text)


if __name__ == "__main__":
    unittest.main()
