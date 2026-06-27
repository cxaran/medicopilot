"""Tests de integración del recurso Consultations.

Requieren PostgreSQL real: dependen de la IDENTITY de ``patients.record_number``,
de las FK a ``patients``/``doctors`` y de los CHECK constraints de coherencia de
finalización, nada de lo cual SQLite representa fielmente. Se ejecutan sólo si
``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en ``_test``.

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_consultations_routes
"""

import os
import unittest
import uuid
from datetime import date, timedelta
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
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
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
    "consultations:read",
    "consultations:create",
    "consultations:update",
    "consultations:delete",
    "consultations:finalize",
)
_BASE = "/api/v1/consultations"


class ConsultationsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cinco permisos estén declarados."""

    def test_five_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ConsultationRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(_make_user(cls.actor_id))
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
            session.execute(delete(Consultation))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            # Limpia los usuarios auxiliares de los médicos; conserva el actor.
            session.execute(delete(User).where(User.id != self.actor_id))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _seed_user(self) -> uuid.UUID:
        user_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(_make_user(user_id))
            session.commit()
        return user_id

    def _seed_patient(
        self, *, status: PatientStatus = PatientStatus.ACTIVE, deleted: bool = False
    ) -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            patient = Patient(
                id=patient_id,
                full_name="María García",
                birth_date=date(1990, 5, 4),
                sex=Sex.FEMALE,
                status=status,
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
        owner = user_id or self._seed_user()
        with Session(self.engine) as session:
            doctor = Doctor(
                id=doctor_id,
                user_id=owner,
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
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "reason_for_visit": "Dolor de cabeza",
        }
        if "attending_doctor_id" not in overrides:
            payload["attending_doctor_id"] = str(self._seed_doctor())
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    def _finalize(self, consultation_id: str):
        return self.client.post(f"{_BASE}/{consultation_id}/finalize", json={})

    # --- creación ---

    def test_create_draft_for_active_patient_and_doctor(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "draft")
        self.assertIsNone(body["finalized_by_doctor_id"])
        self.assertIsNone(body["finalized_at"])
        self.assertEqual(body["reason_for_visit"], "Dolor de cabeza")

    def test_consulted_at_defaults_to_server(self) -> None:
        body = self._create().json()
        self.assertIsNotNone(body["consulted_at"])

    def test_consulted_at_explicit_is_kept(self) -> None:
        body = self._create(consulted_at="2024-01-02T10:00:00").json()
        self.assertTrue(body["consulted_at"].startswith("2024-01-02T10:00:00"))

    def test_create_missing_patient_404(self) -> None:
        response = self._create(patient_id=str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404, response.text)

    def test_create_deleted_patient_404(self) -> None:
        deleted = self._seed_patient(deleted=True)
        self.assertEqual(self._create(patient_id=str(deleted)).status_code, 404)

    def test_create_inactive_or_archived_patient_409(self) -> None:
        for status_value in (PatientStatus.INACTIVE, PatientStatus.ARCHIVED):
            with self.subTest(status=status_value):
                patient = self._seed_patient(status=status_value)
                self.assertEqual(self._create(patient_id=str(patient)).status_code, 409)

    def test_create_missing_doctor_404(self) -> None:
        self.assertEqual(
            self._create(attending_doctor_id=str(uuid.uuid4())).status_code, 404
        )

    def test_create_deleted_doctor_404(self) -> None:
        doctor = self._seed_doctor(deleted=True)
        self.assertEqual(self._create(attending_doctor_id=str(doctor)).status_code, 404)

    def test_create_inactive_or_suspended_doctor_409(self) -> None:
        for status_value in (RecordStatus.INACTIVE, RecordStatus.SUSPENDED):
            with self.subTest(status=status_value):
                doctor = self._seed_doctor(status=status_value)
                self.assertEqual(
                    self._create(attending_doctor_id=str(doctor)).status_code, 409
                )

    # --- query ---

    def test_list_get_and_filter_by_patient(self) -> None:
        created = self._create().json()
        other_patient = self._seed_patient()
        self._create(patient_id=str(other_patient))

        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], created["id"])
        # El listado es ligero: no expone el cuerpo narrativo.
        self.assertNotIn("clinical_assessment", listed["items"][0])

        got = self.client.get(f"{_BASE}/{created['id']}")
        self.assertEqual(got.status_code, 200)

    def test_filter_by_doctor_status_and_consulted_range(self) -> None:
        doctor = self._seed_doctor()
        self._create(attending_doctor_id=str(doctor), consulted_at="2024-03-01T09:00:00")
        self._create(consulted_at="2024-06-01T09:00:00")

        by_doctor = self.client.get(
            _BASE, params={"attending_doctor_id": str(doctor)}
        ).json()
        self.assertEqual(by_doctor["pagination"]["total"], 1)

        by_status = self.client.get(_BASE, params={"status": "draft"}).json()
        self.assertEqual(by_status["pagination"]["total"], 2)

        in_range = self.client.get(
            _BASE,
            params={"consulted_at_after": "2024-05-01", "consulted_at_before": "2024-07-01"},
        ).json()
        self.assertEqual(in_range["pagination"]["total"], 1)

    def test_search_only_by_reason_for_visit(self) -> None:
        self._create(reason_for_visit="Cefalea intensa", observations="ZZZUNIQUE")
        self._create(reason_for_visit="Control rutina")

        by_reason = self.client.get(_BASE, params={"q": "Cefalea"}).json()
        self.assertEqual(by_reason["pagination"]["total"], 1)
        self.assertEqual(by_reason["items"][0]["reason_for_visit"], "Cefalea intensa")

        # Los campos narrativos no se indexan en la búsqueda general.
        by_observation = self.client.get(_BASE, params={"q": "ZZZUNIQUE"}).json()
        self.assertEqual(by_observation["pagination"]["total"], 0)

    # --- edición ---

    def test_patch_draft_fields(self) -> None:
        consultation = self._create().json()
        response = self.client.patch(
            f"{_BASE}/{consultation['id']}",
            json={"treatment": "Reposo e hidratación", "prognosis": "Favorable"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["treatment"], "Reposo e hidratación")
        self.assertEqual(body["prognosis"], "Favorable")

    def test_patch_reassign_attending_doctor(self) -> None:
        consultation = self._create().json()
        new_doctor = self._seed_doctor()
        ok = self.client.patch(
            f"{_BASE}/{consultation['id']}",
            json={"attending_doctor_id": str(new_doctor)},
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(ok.json()["attending_doctor_id"], str(new_doctor))

        inactive_doctor = self._seed_doctor(status=RecordStatus.SUSPENDED)
        rejected = self.client.patch(
            f"{_BASE}/{consultation['id']}",
            json={"attending_doctor_id": str(inactive_doctor)},
        )
        self.assertEqual(rejected.status_code, 409, rejected.text)

    def test_patch_rejects_protected_fields(self) -> None:
        consultation = self._create().json()
        for body in (
            {"patient_id": str(uuid.uuid4())},
            {"status": "finalized"},
            {"finalized_by_doctor_id": str(uuid.uuid4())},
            {"finalized_at": "2024-01-01T00:00:00"},
            {"created_by": str(uuid.uuid4())},
            {"deleted_at": "2024-01-01T00:00:00"},
        ):
            response = self.client.patch(f"{_BASE}/{consultation['id']}", json=body)
            self.assertEqual(response.status_code, 422, f"{body} -> {response.text}")

    def test_consulted_at_future_rejected(self) -> None:
        future = (utc_now() + timedelta(days=1)).isoformat()
        self.assertEqual(self._create(consulted_at=future).status_code, 422)

    def test_next_appointment_before_consulted_rejected(self) -> None:
        response = self._create(
            consulted_at="2024-01-02T10:00:00",
            next_appointment_at="2024-01-01T10:00:00",
        )
        self.assertEqual(response.status_code, 422, response.text)

    # --- finalización ---

    def test_finalize_requires_doctor_profile(self) -> None:
        # El médico tratante pertenece a otro usuario; el actor no tiene perfil.
        consultation = self._create().json()
        response = self._finalize(consultation["id"])
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["code"], "doctor_profile_required")

    def test_finalize_by_non_attending_doctor_forbidden(self) -> None:
        # El actor SÍ es médico activo, pero no es el tratante de esta consulta.
        self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        attending = self._seed_doctor()
        consultation = self._create(attending_doctor_id=str(attending)).json()
        response = self._finalize(consultation["id"])
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["code"], "not_attending_doctor")

    def test_finalize_by_attending_doctor(self) -> None:
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(attending_doctor_id=str(doctor_id)).json()
        response = self._finalize(consultation["id"])
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "finalized")
        self.assertEqual(body["finalized_by_doctor_id"], str(doctor_id))
        self.assertEqual(body["finalized_by_doctor_id"], body["attending_doctor_id"])
        self.assertIsNotNone(body["finalized_at"])

    def test_finalize_accepts_empty_body(self) -> None:
        # finalize es POST sin parámetros: un cuerpo vacío {} debe ser válido (nunca 422).
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(attending_doctor_id=str(doctor_id)).json()
        response = self.client.post(
            f"{_BASE}/{consultation['id']}/finalize", json={}
        )
        self.assertNotEqual(response.status_code, 422, response.text)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "finalized")

    def test_finalized_is_immutable(self) -> None:
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(attending_doctor_id=str(doctor_id)).json()
        self.assertEqual(self._finalize(consultation["id"]).status_code, 200)

        self.assertEqual(
            self.client.patch(f"{_BASE}/{consultation['id']}", json={"treatment": "x"}).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{consultation['id']}").status_code, 409)
        self.assertEqual(self._finalize(consultation["id"]).status_code, 409)

    def test_finalized_remains_readable(self) -> None:
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(attending_doctor_id=str(doctor_id)).json()
        self.assertEqual(self._finalize(consultation["id"]).status_code, 200)
        got = self.client.get(f"{_BASE}/{consultation['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["status"], "finalized")

    def test_finalized_content_unchanged_after_rejected_mutations(self) -> None:
        # Inmutabilidad post-finalize verificada por CONTENIDO: las mutaciones
        # rechazadas (patch/delete/finalize de nuevo) no deben alterar ni el estado ni
        # los campos. ``test_finalized_is_immutable`` ya cubre los 409; aquí se añade la
        # verificación de que el contenido no mutó (re-GET).
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(
            attending_doctor_id=str(doctor_id), treatment="Reposo original"
        ).json()
        self.assertEqual(self._finalize(consultation["id"]).status_code, 200)

        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{consultation['id']}", json={"treatment": "Cambio prohibido"}
            ).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{consultation['id']}").status_code, 409)
        self.assertEqual(self._finalize(consultation["id"]).status_code, 409)

        body = self.client.get(f"{_BASE}/{consultation['id']}").json()
        self.assertEqual(body["status"], "finalized")
        self.assertEqual(body["treatment"], "Reposo original")

    def test_finalize_rejected_when_patient_deleted_409(self) -> None:
        # Guard de finalize no cubierto: si el paciente fue eliminado, finalizar da 409
        # y la consulta sigue en borrador (el guard de paciente precede al de médico).
        doctor_id = self._seed_doctor(status=RecordStatus.ACTIVE, user_id=self.actor_id)
        consultation = self._create(attending_doctor_id=str(doctor_id)).json()
        with Session(self.engine) as session:
            patient = session.get(Patient, self.patient_id)
            patient.deleted_at = utc_now()
            patient.deleted_by = self.actor_id
            session.add(patient)
            session.commit()
        response = self._finalize(consultation["id"])
        self.assertEqual(response.status_code, 409, response.text)
        body = self.client.get(f"{_BASE}/{consultation['id']}").json()
        self.assertEqual(body["status"], "draft")

    # --- borrado lógico ---

    def test_soft_delete_draft(self) -> None:
        consultation = self._create().json()
        self.assertEqual(self.client.delete(f"{_BASE}/{consultation['id']}").status_code, 200)
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{consultation['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{consultation['id']}").status_code, 404)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        consultation = self._create().json()

        self._as("consultations:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{consultation['id']}").status_code, 403)

        self._as("consultations:read")  # sin create/update/delete/finalize
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{consultation['id']}", json={"treatment": "x"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{consultation['id']}").status_code, 403)
        self.assertEqual(self._finalize(consultation["id"]).status_code, 403)

    # --- invariantes de base de datos ---

    def _insert_consultation(self, **kwargs: object) -> None:
        defaults: dict[str, object] = {
            "patient_id": self.patient_id,
            "consulted_at": utc_now(),
            "reason_for_visit": "Motivo",
            "status": ConsultationStatus.DRAFT,
            "created_by": self.actor_id,
            "updated_by": self.actor_id,
        }
        defaults.update(kwargs)
        with Session(self.engine) as session:
            session.add(Consultation(**defaults))
            session.commit()

    def test_db_finalized_requires_finalization_fields(self) -> None:
        doctor_id = self._seed_doctor()
        with self.assertRaises(IntegrityError):
            self._insert_consultation(
                attending_doctor_id=doctor_id,
                status=ConsultationStatus.FINALIZED,
                # faltan finalized_by_doctor_id y finalized_at
            )

    def test_db_draft_rejects_finalization_fields(self) -> None:
        doctor_id = self._seed_doctor()
        with self.assertRaises(IntegrityError):
            self._insert_consultation(
                attending_doctor_id=doctor_id,
                status=ConsultationStatus.DRAFT,
                finalized_by_doctor_id=doctor_id,
                finalized_at=utc_now(),
            )

    def test_db_finalizer_must_match_attending(self) -> None:
        attending = self._seed_doctor()
        other = self._seed_doctor()
        with self.assertRaises(IntegrityError):
            self._insert_consultation(
                attending_doctor_id=attending,
                status=ConsultationStatus.FINALIZED,
                finalized_by_doctor_id=other,
                finalized_at=utc_now(),
            )


def _make_user(user_id: uuid.UUID) -> User:
    return User(
        id=user_id,
        name="Tester",
        last_name="User",
        email=f"user-{user_id}@example.com",
        hashed_password="x",
        is_active=True,
    )


if __name__ == "__main__":
    unittest.main()
