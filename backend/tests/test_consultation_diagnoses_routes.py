"""Tests de integración del recurso Consultation Diagnoses.

Requieren PostgreSQL real: dependen de la IDENTITY de ``patients.record_number``,
de las FK a ``consultations`` y de los CHECK constraints (enum de tipo, texto no
vacío y pareja coding_system/code), que SQLite no representa fielmente. Se ejecutan
sólo si ``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en ``_test``.

Concurrencia: las mutaciones bloquean la fila de la consulta padre con
``SELECT ... FOR UPDATE`` antes de comprobar ``draft`` (mismo mecanismo que
``consultations.finalize``). No existe un patrón de prueba transaccional multi-hilo
en el proyecto; el bloqueo se verifica por revisión del código y por el sellado al
finalizar la consulta (``test_finalized_consultation_seals_diagnoses``).

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_consultation_diagnoses_routes
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
from sqlalchemy import create_engine, delete, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ConsultationDiagnosisKind,
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
    "consultation_diagnoses:read",
    "consultation_diagnoses:create",
    "consultation_diagnoses:update",
    "consultation_diagnoses:delete",
)
_BASE = "/api/v1/consultation-diagnoses"


class ConsultationDiagnosesCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cuatro permisos estén declarados."""

    def test_four_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ConsultationDiagnosisRoutesTest(unittest.TestCase):
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
            session.execute(delete(ConsultationDiagnosis))
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

    def _seed_patient(self) -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=patient_id,
                    full_name="María García",
                    birth_date=date(1990, 5, 4),
                    sex=Sex.FEMALE,
                    status=PatientStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
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

    def _seed_consultation(
        self,
        *,
        status: ConsultationStatus = ConsultationStatus.DRAFT,
        deleted: bool = False,
    ) -> uuid.UUID:
        consultation_id = uuid.uuid4()
        with Session(self.engine) as session:
            consultation = Consultation(
                id=consultation_id,
                patient_id=self.patient_id,
                attending_doctor_id=self.doctor_id,
                consulted_at=utc_now(),
                reason_for_visit="Control",
                status=status,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if status == ConsultationStatus.FINALIZED:
                consultation.finalized_by_doctor_id = self.doctor_id
                consultation.finalized_at = utc_now()
            if deleted:
                consultation.deleted_at = utc_now()
                consultation.deleted_by = self.actor_id
            session.add(consultation)
            session.commit()
        return consultation_id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "consultation_id": str(self.consultation_id),
            "diagnosis_kind": "primary",
            "diagnosis_text": "Hipertensión arterial",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    # --- creación ---

    def test_create_one_and_many(self) -> None:
        first = self._create()
        self.assertEqual(first.status_code, 201, first.text)
        second = self._create(diagnosis_kind="secondary", diagnosis_text="Diabetes")
        self.assertEqual(second.status_code, 201, second.text)
        listed = self.client.get(
            _BASE, params={"consultation_id": str(self.consultation_id)}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 2)

    def test_multiple_primary_allowed(self) -> None:
        self.assertEqual(self._create(diagnosis_kind="primary").status_code, 201)
        self.assertEqual(
            self._create(diagnosis_kind="primary", diagnosis_text="Otro").status_code, 201
        )

    def test_diagnosis_text_outer_spaces_normalized(self) -> None:
        body = self._create(diagnosis_text="  Asma bronquial  ").json()
        self.assertEqual(body["diagnosis_text"], "Asma bronquial")

    def test_create_missing_consultation_404(self) -> None:
        self.assertEqual(self._create(consultation_id=str(uuid.uuid4())).status_code, 404)

    def test_create_deleted_consultation_404(self) -> None:
        deleted = self._seed_consultation(deleted=True)
        self.assertEqual(self._create(consultation_id=str(deleted)).status_code, 404)

    def test_create_finalized_consultation_409(self) -> None:
        finalized = self._seed_consultation(status=ConsultationStatus.FINALIZED)
        self.assertEqual(self._create(consultation_id=str(finalized)).status_code, 409)

    # --- lectura / query ---

    def test_list_get_and_filter_by_consultation(self) -> None:
        created = self._create().json()
        other = self._seed_consultation()
        self.client.post(_BASE, json={
            "consultation_id": str(other),
            "diagnosis_kind": "primary",
            "diagnosis_text": "Otra",
        })
        listed = self.client.get(
            _BASE, params={"consultation_id": str(self.consultation_id)}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], created["id"])
        self.assertNotIn("notes", listed["items"][0])

        got = self.client.get(f"{_BASE}/{created['id']}")
        self.assertEqual(got.status_code, 200)

    def test_filter_by_diagnosis_kind(self) -> None:
        self._create(diagnosis_kind="primary")
        self._create(diagnosis_kind="suspected", diagnosis_text="Posible anemia")
        suspected = self.client.get(_BASE, params={"diagnosis_kind": "suspected"}).json()
        self.assertEqual(suspected["pagination"]["total"], 1)
        self.assertEqual(suspected["items"][0]["diagnosis_kind"], "suspected")

    def test_search_by_text_and_code(self) -> None:
        self._create(diagnosis_text="Migraña", coding_system="ICD10", code="G43")
        self._create(diagnosis_text="Gastritis", notes="ZZZSECRET")

        by_text = self.client.get(_BASE, params={"q": "Migra"}).json()
        self.assertEqual(by_text["pagination"]["total"], 1)
        by_code = self.client.get(_BASE, params={"q": "G43"}).json()
        self.assertEqual(by_code["pagination"]["total"], 1)
        # notes no participa en la búsqueda libre.
        by_notes = self.client.get(_BASE, params={"q": "ZZZSECRET"}).json()
        self.assertEqual(by_notes["pagination"]["total"], 0)

    # --- edición ---

    def test_patch_allowed_fields(self) -> None:
        diagnosis = self._create().json()
        response = self.client.patch(
            f"{_BASE}/{diagnosis['id']}",
            json={
                "diagnosis_kind": "secondary",
                "diagnosis_text": "Hipertensión esencial",
                "coding_system": "ICD10",
                "code": "I10",
                "notes": "Confirmar en control",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["diagnosis_kind"], "secondary")
        self.assertEqual(body["code"], "I10")

    def test_patch_rejects_consultation_id_change(self) -> None:
        diagnosis = self._create().json()
        other = self._seed_consultation()
        response = self.client.patch(
            f"{_BASE}/{diagnosis['id']}", json={"consultation_id": str(other)}
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_reject_blank_diagnosis_text(self) -> None:
        self.assertEqual(self._create(diagnosis_text="").status_code, 422)
        self.assertEqual(self._create(diagnosis_text="   ").status_code, 422)

    def test_reject_incomplete_coding_pair(self) -> None:
        self.assertEqual(self._create(code="I10").status_code, 422)
        self.assertEqual(self._create(coding_system="ICD10").status_code, 422)
        # Pareja completa sí se acepta.
        self.assertEqual(self._create(coding_system="ICD10", code="I10").status_code, 201)

    def test_reject_audit_and_delete_fields_as_input(self) -> None:
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(deleted_at="2024-01-01T00:00:00").status_code, 422)

    # --- sellado por consulta finalizada ---

    def test_finalized_consultation_seals_diagnoses(self) -> None:
        diagnosis = self._create().json()
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            consultation.status = ConsultationStatus.FINALIZED
            consultation.finalized_by_doctor_id = self.doctor_id
            consultation.finalized_at = utc_now()
            session.add(consultation)
            session.commit()

        self.assertEqual(self.client.get(f"{_BASE}/{diagnosis['id']}").status_code, 200)
        self.assertEqual(
            self.client.get(
                _BASE, params={"consultation_id": str(self.consultation_id)}
            ).json()["pagination"]["total"],
            1,
        )
        self.assertEqual(self._create().status_code, 409)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{diagnosis['id']}", json={"diagnosis_text": "x"}).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{diagnosis['id']}").status_code, 409)

    # --- borrado lógico ---

    def test_soft_delete_draft_diagnosis(self) -> None:
        diagnosis = self._create().json()
        self.assertEqual(self.client.delete(f"{_BASE}/{diagnosis['id']}").status_code, 200)
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{diagnosis['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{diagnosis['id']}").status_code, 404)

    def test_deleted_parent_hides_diagnoses(self) -> None:
        diagnosis = self._create().json()
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            consultation.deleted_at = utc_now()
            consultation.deleted_by = self.actor_id
            session.add(consultation)
            session.commit()
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{diagnosis['id']}").status_code, 404)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        diagnosis = self._create().json()

        self._as("consultation_diagnoses:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{diagnosis['id']}").status_code, 403)

        self._as("consultation_diagnoses:read")  # sin create/update/delete
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{diagnosis['id']}", json={"diagnosis_text": "x"}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{diagnosis['id']}").status_code, 403)

    # --- invariantes de base de datos ---

    def _insert_diagnosis(self, **kwargs: object) -> None:
        defaults: dict[str, object] = {
            "consultation_id": self.consultation_id,
            "diagnosis_kind": ConsultationDiagnosisKind.PRIMARY,
            "diagnosis_text": "Dx",
            "created_by": self.actor_id,
            "updated_by": self.actor_id,
        }
        defaults.update(kwargs)
        with Session(self.engine) as session:
            session.add(ConsultationDiagnosis(**defaults))
            session.commit()

    def test_db_check_blank_text(self) -> None:
        with self.assertRaises(IntegrityError):
            self._insert_diagnosis(diagnosis_text="   ")

    def test_db_check_coding_pair(self) -> None:
        with self.assertRaises(IntegrityError):
            self._insert_diagnosis(code="I10")  # sin coding_system

    def test_db_check_invalid_kind(self) -> None:
        # El enum no-nativo se materializa como CHECK; un valor fuera del dominio
        # se rechaza a nivel de base de datos (se inserta por SQL crudo para
        # esquivar la validación de SQLAlchemy).
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.execute(
                    text(
                        "INSERT INTO consultation_diagnoses"
                        " (id, consultation_id, diagnosis_kind, diagnosis_text, created_at)"
                        " VALUES (:id, :cid, 'invalid', 'Dx', now())"
                    ),
                    {"id": str(uuid.uuid4()), "cid": str(self.consultation_id)},
                )
                session.commit()


if __name__ == "__main__":
    unittest.main()
