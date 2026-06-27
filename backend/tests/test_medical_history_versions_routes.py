"""Tests de integración del recurso Medical History Versions.

Requieren PostgreSQL real: el versionado depende de índices parciales únicos
(una sola draft y una sola current no eliminadas por paciente), de bloqueos de
fila (FOR UPDATE) y de la IDENTITY de ``patients.record_number``; nada de eso lo
representa SQLite. Se ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a una base
cuyo nombre termina en ``_test`` (mismo gate que ``test_query_postgres``).

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_medical_history_versions_routes
"""

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
from sqlalchemy import create_engine, delete, update  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    MedicalHistoryVersionStatus,
    PatientStatus,
    RecordStatus,
    Sex,
)
from backend.app.models.medical_history import MedicalHistoryVersion  # noqa: E402
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
    "medical_history_versions:read",
    "medical_history_versions:create",
    "medical_history_versions:update",
    "medical_history_versions:delete",
    "medical_history_versions:finalize",
)
_BASE = "/api/v1/medical-history-versions"


class MedicalHistoryVersionsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cinco permisos estén declarados."""

    def test_five_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class MedicalHistoryVersionRoutesTest(unittest.TestCase):
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

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            # Romper la auto-referencia (based_on_version_id, RESTRICT) antes de borrar.
            session.execute(update(MedicalHistoryVersion).values(based_on_version_id=None))
            session.commit()
            session.execute(delete(MedicalHistoryVersion))
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

    def _seed_patient(self, deleted: bool = False) -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            patient = Patient(
                id=patient_id,
                full_name="María García",
                birth_date=date(1990, 5, 4),
                sex=Sex.FEMALE,
                status=PatientStatus.ACTIVE,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if deleted:
                patient.deleted_at = utc_now()
                patient.deleted_by = self.actor_id
            session.add(patient)
            session.commit()
        return patient_id

    def _seed_doctor(
        self,
        *,
        status: RecordStatus = RecordStatus.ACTIVE,
        deleted: bool = False,
        user_id: uuid.UUID | None = None,
    ) -> uuid.UUID:
        doctor_id = uuid.uuid4()
        with Session(self.engine) as session:
            doctor = Doctor(
                id=doctor_id,
                user_id=user_id or self.actor_id,
                professional_name="Dra. House",
                professional_license_number=f"LIC-{doctor_id}",
                status=status,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if deleted:
                doctor.deleted_at = utc_now()
                doctor.deleted_by = self.actor_id
            session.add(doctor)
            session.commit()
        return doctor_id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {"patient_id": str(self.patient_id)}
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    def _finalize(self, version_id: str):
        return self.client.post(f"{_BASE}/{version_id}/finalize", json={})

    # --- creación inicial ---

    def test_create_initial_draft(self) -> None:
        created = self._create(family_history="Diabetes en la familia")
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["version_number"], 1)
        self.assertEqual(body["status"], "draft")
        self.assertIsNone(body["based_on_version_id"])
        self.assertIsNone(body["reviewed_by_doctor_id"])
        self.assertIsNone(body["reviewed_at"])
        self.assertEqual(body["family_history"], "Diabetes en la familia")

    def test_create_for_missing_patient_404(self) -> None:
        response = self._create(patient_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404, response.text)

    def test_create_for_deleted_patient_404(self) -> None:
        deleted_patient = self._seed_patient(deleted=True)
        response = self._create(patient_id=str(deleted_patient))
        self.assertEqual(response.status_code, 404, response.text)

    def test_create_list_and_get(self) -> None:
        created = self._create().json()
        listed = self.client.get(_BASE).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], created["id"])
        # El listado es ligero: no expone los campos narrativos.
        self.assertNotIn("family_history", listed["items"][0])

        got = self.client.get(f"{_BASE}/{created['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], created["id"])

    # --- query ---

    def test_filter_by_patient_id_and_status(self) -> None:
        first = self._create().json()
        other_patient = self._seed_patient()
        self._create(patient_id=str(other_patient))

        mine = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(mine["pagination"]["total"], 1)
        self.assertEqual(mine["items"][0]["id"], first["id"])

        drafts = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id), "status": "draft"}
        ).json()
        self.assertEqual(drafts["pagination"]["total"], 1)
        currents = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id), "status": "current"}
        ).json()
        self.assertEqual(currents["pagination"]["total"], 0)

    # --- edición ---

    def test_patch_only_on_draft(self) -> None:
        version = self._create().json()
        response = self.client.patch(
            f"{_BASE}/{version['id']}",
            json={"clinical_observations": "Paciente estable"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["clinical_observations"], "Paciente estable")

    def test_patch_rejects_protected_fields(self) -> None:
        version = self._create().json()
        protected = [
            {"patient_id": str(uuid.uuid4())},
            {"version_number": 99},
            {"status": "current"},
            {"based_on_version_id": str(uuid.uuid4())},
            {"reviewed_by_doctor_id": str(uuid.uuid4())},
            {"reviewed_at": "2020-01-01T00:00:00"},
            {"created_by": str(uuid.uuid4())},
            {"deleted_at": "2020-01-01T00:00:00"},
        ]
        for body in protected:
            response = self.client.patch(f"{_BASE}/{version['id']}", json=body)
            self.assertEqual(response.status_code, 422, f"{body} -> {response.text}")

    def test_second_active_draft_conflicts(self) -> None:
        self._create()
        conflict = self._create()
        self.assertEqual(conflict.status_code, 409, conflict.text)

    # --- finalización: autorización ---

    def test_finalize_requires_doctor_profile(self) -> None:
        version = self._create().json()
        # Tiene el permiso finalize pero no hay perfil de médico para el usuario.
        response = self._finalize(version["id"])
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["code"], "doctor_profile_required")

    def test_finalize_with_inactive_doctor_forbidden(self) -> None:
        for state in (RecordStatus.INACTIVE, RecordStatus.SUSPENDED):
            with self.subTest(state=state):
                version = self._create().json()
                self._seed_doctor(status=state)
                response = self._finalize(version["id"])
                self.assertEqual(response.status_code, 403, response.text)
                # Limpieza entre sub-casos: retira el borrador y el doctor.
                with Session(self.engine) as session:
                    session.execute(delete(MedicalHistoryVersion))
                    session.execute(delete(Doctor))
                    session.commit()

    def test_finalize_with_deleted_doctor_forbidden(self) -> None:
        version = self._create().json()
        self._seed_doctor(status=RecordStatus.ACTIVE, deleted=True)
        response = self._finalize(version["id"])
        self.assertEqual(response.status_code, 403, response.text)

    # --- finalización: flujo feliz ---

    def test_finalize_by_active_doctor_promotes_to_current(self) -> None:
        version = self._create().json()
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE)
        response = self._finalize(version["id"])
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "current")
        self.assertEqual(body["reviewed_by_doctor_id"], str(doctor_id))
        self.assertIsNotNone(body["reviewed_at"])

        # Una versión vigente ya no se puede editar ni finalizar de nuevo.
        self.assertEqual(
            self.client.patch(f"{_BASE}/{version['id']}", json={"family_history": "x"}).status_code,
            409,
        )
        self.assertEqual(self._finalize(version["id"]).status_code, 409)

    def test_finalize_accepts_empty_body(self) -> None:
        # finalize es POST sin parámetros: un cuerpo vacío {} debe ser válido (nunca 422).
        version = self._create().json()
        self._seed_doctor(status=RecordStatus.ACTIVE)
        response = self.client.post(f"{_BASE}/{version['id']}/finalize", json={})
        self.assertNotEqual(response.status_code, 422, response.text)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "current")

    def test_create_after_current_copies_and_overrides(self) -> None:
        v1 = self._create(
            family_history="FH1", pathological_history="PH1"
        ).json()
        self._seed_doctor(status=RecordStatus.ACTIVE)
        self.assertEqual(self._finalize(v1["id"]).status_code, 200)

        v2 = self._create(pathological_history="PH2").json()
        self.assertEqual(v2["version_number"], 2)
        self.assertEqual(v2["status"], "draft")
        self.assertEqual(v2["based_on_version_id"], v1["id"])
        # family_history se copia de la versión vigente; pathological_history se sobreescribe.
        self.assertEqual(v2["family_history"], "FH1")
        self.assertEqual(v2["pathological_history"], "PH2")

    def test_finalize_supersedes_previous_current(self) -> None:
        v1 = self._create().json()
        self._seed_doctor(status=RecordStatus.ACTIVE)
        self.assertEqual(self._finalize(v1["id"]).status_code, 200)

        v2 = self._create().json()
        self.assertEqual(self._finalize(v2["id"]).status_code, 200)

        v1_read = self.client.get(f"{_BASE}/{v1['id']}").json()
        v2_read = self.client.get(f"{_BASE}/{v2['id']}").json()
        self.assertEqual(v1_read["status"], "superseded")
        self.assertEqual(v2_read["status"], "current")

        currents = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id), "status": "current"}
        ).json()
        self.assertEqual(currents["pagination"]["total"], 1)
        self.assertEqual(currents["items"][0]["id"], v2["id"])

    def test_modify_current_or_superseded_conflicts(self) -> None:
        v1 = self._create().json()
        self._seed_doctor(status=RecordStatus.ACTIVE)
        self.assertEqual(self._finalize(v1["id"]).status_code, 200)
        v2 = self._create().json()
        self.assertEqual(self._finalize(v2["id"]).status_code, 200)
        # v1 quedó superseded, v2 quedó current.

        for version_id in (v1["id"], v2["id"]):
            self.assertEqual(
                self.client.patch(f"{_BASE}/{version_id}", json={"family_history": "x"}).status_code,
                409,
            )
            self.assertEqual(self.client.delete(f"{_BASE}/{version_id}").status_code, 409)
            self.assertEqual(self._finalize(version_id).status_code, 409)

    # --- borrado lógico ---

    def test_soft_delete_draft(self) -> None:
        version = self._create().json()
        deleted = self.client.delete(f"{_BASE}/{version['id']}")
        self.assertEqual(deleted.status_code, 200, deleted.text)

        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{version['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{version['id']}").status_code, 404)

    def test_soft_delete_frees_draft_slot(self) -> None:
        first = self._create().json()
        self.assertEqual(self.client.delete(f"{_BASE}/{first['id']}").status_code, 200)
        # Tras eliminar el borrador, se puede crear otro (el índice parcial lo excluye).
        second = self._create()
        self.assertEqual(second.status_code, 201, second.text)
        self.assertEqual(second.json()["version_number"], 2)

    def test_current_and_superseded_remain_readable(self) -> None:
        v1 = self._create().json()
        self._seed_doctor(status=RecordStatus.ACTIVE)
        self.assertEqual(self._finalize(v1["id"]).status_code, 200)
        v2 = self._create().json()
        self.assertEqual(self._finalize(v2["id"]).status_code, 200)

        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(listed["pagination"]["total"], 2)
        self.assertEqual(self.client.get(f"{_BASE}/{v1['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{_BASE}/{v2['id']}").status_code, 200)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        version = self._create().json()

        self._as("medical_history_versions:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{version['id']}").status_code, 403)

        self._as("medical_history_versions:read")  # sin create/update/delete/finalize
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{version['id']}", json={"family_history": "x"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{version['id']}").status_code, 403)
        self.assertEqual(self._finalize(version["id"]).status_code, 403)

    # --- invariantes a nivel de base de datos ---

    def test_db_rejects_two_active_drafts(self) -> None:
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                for _ in range(2):
                    session.add(
                        MedicalHistoryVersion(
                            patient_id=self.patient_id,
                            version_number=self._next_number(session),
                            status=MedicalHistoryVersionStatus.DRAFT,
                            created_by=self.actor_id,
                            updated_by=self.actor_id,
                        )
                    )
                    session.flush()
                session.commit()

    def test_db_rejects_two_current_versions(self) -> None:
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                for _ in range(2):
                    session.add(
                        MedicalHistoryVersion(
                            patient_id=self.patient_id,
                            version_number=self._next_number(session),
                            status=MedicalHistoryVersionStatus.CURRENT,
                            created_by=self.actor_id,
                            updated_by=self.actor_id,
                        )
                    )
                    session.flush()
                session.commit()

    def test_db_rejects_duplicate_version_number(self) -> None:
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.add(
                    MedicalHistoryVersion(
                        patient_id=self.patient_id,
                        version_number=1,
                        status=MedicalHistoryVersionStatus.SUPERSEDED,
                        created_by=self.actor_id,
                        updated_by=self.actor_id,
                    )
                )
                session.add(
                    MedicalHistoryVersion(
                        patient_id=self.patient_id,
                        version_number=1,
                        status=MedicalHistoryVersionStatus.SUPERSEDED,
                        created_by=self.actor_id,
                        updated_by=self.actor_id,
                    )
                )
                session.commit()

    @staticmethod
    def _next_number(session: Session) -> int:
        from sqlalchemy import func

        result = session.exec(select(func.max(MedicalHistoryVersion.version_number))).first()
        return (result or 0) + 1


if __name__ == "__main__":
    unittest.main()
