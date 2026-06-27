"""Tests de integración del módulo Prescriptions + Prescription Items.

Requieren PostgreSQL real: dependen de la IDENTITY de ``prescriptions.internal_folio``,
de las FK a ``consultations``/``consultation_diagnoses``/``doctors`` y de los CHECK
constraints (coherencia de estado y baja lógica sólo en borrador), que SQLite no
representa fielmente. Se ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a una base
cuyo nombre termina en ``_test``.

Concurrencia: las mutaciones bloquean la fila de la consulta padre (y la de la
receta) con ``SELECT ... FOR UPDATE`` antes de comprobar el estado, en el orden
consulta → receta → renglón (mismo mecanismo que ``consultations.finalize``). No
existe un patrón de prueba transaccional multi-hilo en el proyecto; el bloqueo se
verifica por revisión del código y por el bloqueo de finalización ante recetas en
borrador (``test_finalize_blocked_by_draft_prescription``).

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_prescriptions_routes
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
from sqlalchemy import create_engine, delete  # noqa: E402
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
    PrescriptionStatus,
    RecordStatus,
    Sex,
)
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.prescription import Prescription, PrescriptionItem  # noqa: E402
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
    "prescriptions:read",
    "prescriptions:create",
    "prescriptions:update",
    "prescriptions:delete",
    "prescriptions:approve",
    "prescriptions:void",
)
_SNAPSHOT_FIELDS = {
    "professional_name",
    "professional_title",
    "professional_license_number",
    "specialty",
    "specialty_license_number",
    "professional_phone",
    "professional_email",
    "clinic_name",
    "office_address",
    "office_phone",
    "prescription_footer",
}
_BASE = "/api/v1/prescriptions"
_ITEMS = "/api/v1/prescription-items"


class PrescriptionsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los seis permisos estén declarados."""

    def test_six_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


class _PrescriptionTestMixin(unittest.TestCase):
    """Seeding y helpers compartidos por las suites de recetas y de renglones.

    Hereda de ``TestCase`` para reutilizar sus aserciones, pero no declara métodos
    ``test_``: el cargador no genera casos a partir de ella, así que la suite de
    renglones reutiliza el seeding sin re-ejecutar los tests de recetas."""

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
        self.doctor_id = self._seed_doctor(self.actor_id)
        self.consultation_id = self._seed_consultation()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(PrescriptionItem))
            session.execute(delete(Prescription))
            session.execute(delete(ConsultationDiagnosis))
            session.execute(delete(Consultation))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            session.execute(delete(User).where(User.id != self.actor_id))
            session.commit()

    # --- helpers de sesión / seeding ---

    def _as(self, *permissions: str) -> None:
        self._as_user(self.actor_id, *permissions)

    def _as_user(self, user_id: uuid.UUID, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=user_id,
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

    def _seed_user(self) -> uuid.UUID:
        user_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                User(
                    id=user_id,
                    name="Otro",
                    last_name="Medico",
                    email=f"user-{user_id}@example.com",
                    hashed_password="x",
                    is_active=True,
                )
            )
            session.commit()
        return user_id

    def _seed_doctor(self, user_id: uuid.UUID) -> uuid.UUID:
        doctor_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Doctor(
                    id=doctor_id,
                    user_id=user_id,
                    professional_name="Dra. House",
                    professional_title="Dra.",
                    professional_license_number=f"LIC-{doctor_id}",
                    specialty="Medicina interna",
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
        attending_doctor_id: uuid.UUID | None = None,
        deleted: bool = False,
    ) -> uuid.UUID:
        consultation_id = uuid.uuid4()
        with Session(self.engine) as session:
            consultation = Consultation(
                id=consultation_id,
                patient_id=self.patient_id,
                attending_doctor_id=attending_doctor_id or self.doctor_id,
                consulted_at=utc_now(),
                reason_for_visit="Control",
                status=status,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if status == ConsultationStatus.FINALIZED:
                consultation.finalized_by_doctor_id = consultation.attending_doctor_id
                consultation.finalized_at = utc_now()
            if deleted:
                consultation.deleted_at = utc_now()
                consultation.deleted_by = self.actor_id
            session.add(consultation)
            session.commit()
        return consultation_id

    def _seed_diagnosis(self, consultation_id: uuid.UUID) -> str:
        diagnosis_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                ConsultationDiagnosis(
                    id=diagnosis_id,
                    consultation_id=consultation_id,
                    diagnosis_kind=ConsultationDiagnosisKind.PRIMARY,
                    diagnosis_text="Hipertensión",
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return str(diagnosis_id)

    # --- helpers de receta / renglón ---

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {"consultation_id": str(self.consultation_id)}
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    def _create_id(self, **overrides: object) -> str:
        response = self._create(**overrides)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def _item_payload(self, prescription_id: str, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "prescription_id": prescription_id,
            "medication_name": "Paracetamol",
            "dose": "500 mg",
            "frequency": "cada 8 horas",
            "duration": "5 días",
        }
        payload.update(overrides)
        return payload

    def _add_item(self, prescription_id: str, **overrides: object):
        return self.client.post(
            _ITEMS, json=self._item_payload(prescription_id, **overrides)
        )

    def _approve(self, prescription_id: str):
        return self.client.post(f"{_BASE}/{prescription_id}/approve", json={})

    def _void(self, prescription_id: str, reason: str = "Error de dosis"):
        return self.client.post(
            f"{_BASE}/{prescription_id}/void", json={"void_reason": reason}
        )

    def _approved_prescription(self) -> str:
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        self.assertEqual(self._approve(prescription_id).status_code, 200)
        return prescription_id


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PrescriptionRoutesTest(_PrescriptionTestMixin, unittest.TestCase):
    # --- creación / folio ---

    def test_create_draft_generates_folio(self) -> None:
        body = self._create().json()
        self.assertEqual(body["status"], "draft")
        self.assertIsInstance(body["internal_folio"], int)
        self.assertIsNone(body["doctor_snapshot"])
        self.assertIsNone(body["approved_at"])

    def test_consecutive_prescriptions_get_distinct_folios(self) -> None:
        first = self._create().json()["internal_folio"]
        second = self._create().json()["internal_folio"]
        self.assertNotEqual(first, second)

    def test_internal_folio_not_accepted_as_input(self) -> None:
        self.assertEqual(self._create(internal_folio=99).status_code, 422)

    def test_status_not_accepted_as_input(self) -> None:
        self.assertEqual(self._create(status="approved").status_code, 422)

    def test_create_missing_consultation_404(self) -> None:
        self.assertEqual(self._create(consultation_id=str(uuid.uuid4())).status_code, 404)

    def test_create_deleted_consultation_404(self) -> None:
        deleted = self._seed_consultation(deleted=True)
        self.assertEqual(self._create(consultation_id=str(deleted)).status_code, 404)

    def test_create_finalized_consultation_409(self) -> None:
        finalized = self._seed_consultation(status=ConsultationStatus.FINALIZED)
        self.assertEqual(self._create(consultation_id=str(finalized)).status_code, 409)

    # --- diagnóstico relacionado ---

    def test_related_diagnosis_same_consultation_ok(self) -> None:
        diagnosis_id = self._seed_diagnosis(self.consultation_id)
        body = self._create(related_diagnosis_id=diagnosis_id).json()
        self.assertEqual(body["related_diagnosis_id"], diagnosis_id)

    def test_related_diagnosis_other_consultation_422(self) -> None:
        other = self._seed_consultation()
        diagnosis_id = self._seed_diagnosis(other)
        self.assertEqual(
            self._create(related_diagnosis_id=diagnosis_id).status_code, 422
        )

    def test_related_diagnosis_missing_422(self) -> None:
        self.assertEqual(
            self._create(related_diagnosis_id=str(uuid.uuid4())).status_code, 422
        )

    # --- lectura / query ---

    def test_list_filter_by_consultation_and_status(self) -> None:
        keep = self._create_id()
        other = self._seed_consultation()
        self.client.post(_BASE, json={"consultation_id": str(other)})
        listed = self.client.get(
            _BASE, params={"consultation_id": str(self.consultation_id)}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], keep)
        self.assertNotIn("doctor_snapshot", listed["items"][0])
        by_status = self.client.get(_BASE, params={"status": "draft"}).json()
        self.assertEqual(by_status["pagination"]["total"], 2)

    def test_filter_by_internal_folio(self) -> None:
        folio = self._create().json()["internal_folio"]
        self._create()
        listed = self.client.get(_BASE, params={"internal_folio": folio}).json()
        self.assertEqual(listed["pagination"]["total"], 1)

    # --- edición de borrador ---

    def test_patch_observations(self) -> None:
        prescription_id = self._create_id()
        response = self.client.patch(
            f"{_BASE}/{prescription_id}", json={"observations": "Tomar con alimentos"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["observations"], "Tomar con alimentos")

    def test_patch_clear_related_diagnosis(self) -> None:
        diagnosis_id = self._seed_diagnosis(self.consultation_id)
        prescription_id = self._create_id(related_diagnosis_id=diagnosis_id)
        response = self.client.patch(
            f"{_BASE}/{prescription_id}", json={"related_diagnosis_id": None}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["related_diagnosis_id"])

    def test_patch_rejects_consultation_id_change(self) -> None:
        prescription_id = self._create_id()
        other = self._seed_consultation()
        response = self.client.patch(
            f"{_BASE}/{prescription_id}", json={"consultation_id": str(other)}
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_patch_rejects_status_change(self) -> None:
        prescription_id = self._create_id()
        response = self.client.patch(
            f"{_BASE}/{prescription_id}", json={"status": "approved"}
        )
        self.assertEqual(response.status_code, 422, response.text)

    # --- borrado lógico ---

    def test_soft_delete_draft(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(self.client.delete(f"{_BASE}/{prescription_id}").status_code, 200)
        self.assertEqual(self.client.get(f"{_BASE}/{prescription_id}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{prescription_id}").status_code, 404)
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)

    # --- aprobación ---

    def test_approve_requires_active_items_409(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(self._approve(prescription_id).status_code, 409)

    def test_approve_requires_complete_items_409(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(
            self._add_item(prescription_id, dose=None).status_code, 201
        )
        self.assertEqual(self._approve(prescription_id).status_code, 409)

    def test_approve_success_builds_snapshot(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        response = self._approve(prescription_id)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "approved")
        self.assertEqual(body["approved_by_doctor_id"], str(self.doctor_id))
        self.assertIsNotNone(body["approved_at"])
        self.assertEqual(set(body["doctor_snapshot"].keys()), _SNAPSHOT_FIELDS)
        self.assertEqual(body["doctor_snapshot"]["professional_name"], "Dra. House")

    def test_approve_accepts_empty_body(self) -> None:
        # approve es POST sin parámetros: un cuerpo vacío {} debe ser válido (nunca 422).
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        response = self.client.post(f"{_BASE}/{prescription_id}/approve", json={})
        self.assertNotEqual(response.status_code, 422, response.text)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "approved")

    def test_approve_twice_409(self) -> None:
        prescription_id = self._approved_prescription()
        self.assertEqual(self._approve(prescription_id).status_code, 409)

    def test_approve_finalized_consultation_409(self) -> None:
        # Una consulta finalizada no debería tener recetas en borrador, pero el
        # endpoint se protege igualmente.
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            consultation.status = ConsultationStatus.FINALIZED
            consultation.finalized_by_doctor_id = self.doctor_id
            consultation.finalized_at = utc_now()
            session.add(consultation)
            session.commit()
        self.assertEqual(self._approve(prescription_id).status_code, 409)

    def test_approve_not_attending_doctor_403(self) -> None:
        other_user = self._seed_user()
        self._seed_doctor(other_user)
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        self._as_user(other_user, *ALL_PERMS)
        self.assertEqual(self._approve(prescription_id).status_code, 403)

    def test_approve_without_doctor_profile_403(self) -> None:
        other_user = self._seed_user()
        prescription_id = self._create_id()
        self.assertEqual(self._add_item(prescription_id).status_code, 201)
        self._as_user(other_user, *ALL_PERMS)
        self.assertEqual(self._approve(prescription_id).status_code, 403)

    def test_approved_is_immutable(self) -> None:
        prescription_id = self._approved_prescription()
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{prescription_id}", json={"observations": "x"}
            ).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{prescription_id}").status_code, 409)

    # --- anulación ---

    def test_void_requires_reason_422(self) -> None:
        prescription_id = self._approved_prescription()
        self.assertEqual(
            self.client.post(f"{_BASE}/{prescription_id}/void", json={}).status_code, 422
        )
        self.assertEqual(
            self.client.post(
                f"{_BASE}/{prescription_id}/void", json={"void_reason": "   "}
            ).status_code,
            422,
        )

    def test_void_only_approved_409(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(self._void(prescription_id).status_code, 409)

    def test_void_success(self) -> None:
        prescription_id = self._approved_prescription()
        response = self._void(prescription_id)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["status"], "voided")
        self.assertEqual(body["voided_by_doctor_id"], str(self.doctor_id))
        self.assertEqual(body["void_reason"], "Error de dosis")
        self.assertIsNotNone(body["voided_at"])

    def test_void_allowed_after_finalize(self) -> None:
        prescription_id = self._approved_prescription()
        self._as(*ALL_PERMS, "consultations:finalize")
        self.assertEqual(self._finalize().status_code, 200)
        self._as(*ALL_PERMS)
        self.assertEqual(self._void(prescription_id).status_code, 200)

    def test_void_twice_409(self) -> None:
        prescription_id = self._approved_prescription()
        self.assertEqual(self._void(prescription_id).status_code, 200)
        self.assertEqual(self._void(prescription_id).status_code, 409)

    def test_void_not_attending_403(self) -> None:
        prescription_id = self._approved_prescription()
        other_user = self._seed_user()
        self._seed_doctor(other_user)
        self._as_user(other_user, *ALL_PERMS)
        self.assertEqual(self._void(prescription_id).status_code, 403)

    # --- interacción con finalize ---

    def _finalize(self, consultation_id: uuid.UUID | None = None):
        cid = consultation_id or self.consultation_id
        return self.client.post(f"/api/v1/consultations/{cid}/finalize", json={})

    def test_finalize_blocked_by_draft_prescription(self) -> None:
        self._create_id()
        self._as(*ALL_PERMS, "consultations:finalize")
        self.assertEqual(self._finalize().status_code, 409)

    def test_finalize_allowed_with_approved_prescription(self) -> None:
        self._approved_prescription()
        self._as(*ALL_PERMS, "consultations:finalize")
        self.assertEqual(self._finalize().status_code, 200)

    def test_finalize_allowed_with_voided_prescription(self) -> None:
        prescription_id = self._approved_prescription()
        self.assertEqual(self._void(prescription_id).status_code, 200)
        self._as(*ALL_PERMS, "consultations:finalize")
        self.assertEqual(self._finalize().status_code, 200)

    def test_finalize_allowed_after_draft_deleted(self) -> None:
        prescription_id = self._create_id()
        self.assertEqual(self.client.delete(f"{_BASE}/{prescription_id}").status_code, 200)
        self._as(*ALL_PERMS, "consultations:finalize")
        self.assertEqual(self._finalize().status_code, 200)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        prescription_id = self._create_id()

        self._as("prescriptions:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{prescription_id}").status_code, 403)

        self._as("prescriptions:read")  # sólo lectura
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{prescription_id}", json={"observations": "x"}
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{prescription_id}").status_code, 403)
        self.assertEqual(self._approve(prescription_id).status_code, 403)
        self.assertEqual(self._void(prescription_id).status_code, 403)

    # --- invariantes de base de datos ---

    def _insert_prescription(self, **kwargs: object) -> None:
        defaults: dict[str, object] = {
            "consultation_id": self.consultation_id,
            "status": PrescriptionStatus.DRAFT,
            "created_by": self.actor_id,
            "updated_by": self.actor_id,
        }
        defaults.update(kwargs)
        with Session(self.engine) as session:
            session.add(Prescription(**defaults))
            session.commit()

    def test_db_check_status_state(self) -> None:
        # 'approved' sin datos de aprobación viola la coherencia de estado.
        with self.assertRaises(IntegrityError):
            self._insert_prescription(status=PrescriptionStatus.APPROVED)

    def test_db_check_deleted_only_draft(self) -> None:
        # Una receta aprobada (coherente) no puede tener baja lógica.
        with self.assertRaises(IntegrityError):
            self._insert_prescription(
                status=PrescriptionStatus.APPROVED,
                approved_by_doctor_id=self.doctor_id,
                approved_at=utc_now(),
                doctor_snapshot={"professional_name": "Dra. House"},
                deleted_at=utc_now(),
                deleted_by=self.actor_id,
            )

    def test_db_unique_folio(self) -> None:
        with Session(self.engine) as session:
            first = Prescription(
                consultation_id=self.consultation_id,
                status=PrescriptionStatus.DRAFT,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            session.add(first)
            session.commit()
            folio = first.internal_folio
        with self.assertRaises(IntegrityError):
            self._insert_prescription(internal_folio=folio)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PrescriptionItemRoutesTest(_PrescriptionTestMixin, unittest.TestCase):
    """Renglones de medicamento: heredan el seeding compartido."""

    def setUp(self) -> None:
        super().setUp()
        self.prescription_id = self._create_id()

    # --- posición asignada por el servidor ---

    def test_positions_are_consecutive(self) -> None:
        first = self._add_item(self.prescription_id).json()
        second = self._add_item(self.prescription_id, medication_name="Ibuprofeno").json()
        self.assertEqual(first["position"], 1)
        self.assertEqual(second["position"], 2)

    def test_position_gap_after_delete(self) -> None:
        a = self._add_item(self.prescription_id).json()
        self._add_item(self.prescription_id, medication_name="B").json()
        self.assertEqual(self.client.delete(f"{_ITEMS}/{a['id']}").status_code, 200)
        third = self._add_item(self.prescription_id, medication_name="C").json()
        # La posición liberada no se reutiliza: el siguiente renglón es max+1.
        self.assertEqual(third["position"], 3)

    def test_position_not_accepted_as_input(self) -> None:
        response = self.client.post(
            _ITEMS, json=self._item_payload(self.prescription_id, position=5)
        )
        self.assertEqual(response.status_code, 422)

    # --- validación ---

    def test_medication_name_required(self) -> None:
        body = self._item_payload(self.prescription_id)
        del body["medication_name"]
        self.assertEqual(self.client.post(_ITEMS, json=body).status_code, 422)
        self.assertEqual(
            self._add_item(self.prescription_id, medication_name="   ").status_code, 422
        )

    def test_optional_fields_allowed_in_draft(self) -> None:
        response = self._add_item(
            self.prescription_id, dose=None, frequency=None, duration=None
        )
        self.assertEqual(response.status_code, 201, response.text)

    def test_create_missing_prescription_404(self) -> None:
        self.assertEqual(
            self.client.post(
                _ITEMS, json=self._item_payload(str(uuid.uuid4()))
            ).status_code,
            404,
        )

    # --- lectura / query ---

    def test_list_filter_by_prescription_and_search(self) -> None:
        self._add_item(self.prescription_id, medication_name="Amoxicilina")
        other = self._create_id()
        self._add_item(other, medication_name="Loratadina")
        listed = self.client.get(
            _ITEMS, params={"prescription_id": self.prescription_id}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertNotIn("instructions", listed["items"][0])
        found = self.client.get(_ITEMS, params={"q": "Amox"}).json()
        self.assertEqual(found["pagination"]["total"], 1)

    # --- edición / borrado en borrador ---

    def test_patch_item_in_draft(self) -> None:
        item = self._add_item(self.prescription_id).json()
        response = self.client.patch(
            f"{_ITEMS}/{item['id']}", json={"dose": "650 mg"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["dose"], "650 mg")

    def test_patch_item_rejects_prescription_id_change(self) -> None:
        item = self._add_item(self.prescription_id).json()
        response = self.client.patch(
            f"{_ITEMS}/{item['id']}", json={"prescription_id": str(uuid.uuid4())}
        )
        self.assertEqual(response.status_code, 422)

    def test_soft_delete_item(self) -> None:
        item = self._add_item(self.prescription_id).json()
        self.assertEqual(self.client.delete(f"{_ITEMS}/{item['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"{_ITEMS}/{item['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_ITEMS}/{item['id']}").status_code, 404)

    # --- sellado al aprobar la receta ---

    def test_items_sealed_when_prescription_approved(self) -> None:
        item = self._add_item(self.prescription_id).json()
        self.assertEqual(self._approve(self.prescription_id).status_code, 200)
        self.assertEqual(
            self._add_item(self.prescription_id, medication_name="Otro").status_code, 409
        )
        self.assertEqual(
            self.client.patch(f"{_ITEMS}/{item['id']}", json={"dose": "x"}).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_ITEMS}/{item['id']}").status_code, 409)
        # La lectura sigue disponible.
        self.assertEqual(self.client.get(f"{_ITEMS}/{item['id']}").status_code, 200)

    def test_deleted_prescription_hides_items(self) -> None:
        item = self._add_item(self.prescription_id).json()
        self.assertEqual(self.client.delete(f"{_BASE}/{self.prescription_id}").status_code, 200)
        self.assertEqual(self.client.get(f"{_ITEMS}/{item['id']}").status_code, 404)
        self.assertEqual(self.client.get(_ITEMS).json()["pagination"]["total"], 0)

    # --- RBAC heredado: crear renglón usa prescriptions:update ---

    def test_item_rbac_uses_prescription_permissions(self) -> None:
        item = self._add_item(self.prescription_id).json()

        self._as("prescriptions:read")  # sólo lectura
        self.assertEqual(self.client.get(_ITEMS).status_code, 200)
        self.assertEqual(
            self.client.post(
                _ITEMS, json=self._item_payload(self.prescription_id)
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.patch(f"{_ITEMS}/{item['id']}", json={"dose": "x"}).status_code,
            403,
        )

        self._as("prescriptions:update")  # sin read
        self.assertEqual(self.client.get(_ITEMS).status_code, 403)
        self.assertEqual(self._add_item(self.prescription_id).status_code, 201)

    def test_db_item_position_unique(self) -> None:
        self._add_item(self.prescription_id)
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.add(
                    PrescriptionItem(
                        prescription_id=self.prescription_id,
                        position=1,
                        medication_name="Duplicado",
                        created_by=self.actor_id,
                        updated_by=self.actor_id,
                    )
                )
                session.commit()


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PrescriptionForbiddenTransitionsTest(_PrescriptionTestMixin, unittest.TestCase):
    """Transiciones de estado PROHIBIDAS desde el estado terminal ``voided`` y guard
    de médico tratante aún no cubiertos por ``PrescriptionRoutesTest``.

    El ciclo es draft → approved → voided; ``voided`` es terminal. Cada test parte de
    un estado válido sembrado, ejecuta la transición prohibida, comprueba el status
    HTTP de error que emite el backend y RE-LEE el recurso para verificar que el
    estado no mutó.
    """

    def _voided_prescription(self) -> str:
        """Receta llevada hasta el estado terminal ``voided``."""
        prescription_id = self._approved_prescription()
        self.assertEqual(self._void(prescription_id).status_code, 200)
        return prescription_id

    def _status(self, prescription_id: str) -> str:
        response = self.client.get(f"{_BASE}/{prescription_id}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["status"]

    def test_approve_voided_409_state_unchanged(self) -> None:
        # Aprobar una receta ya anulada está prohibido (no es draft): 409 y sigue voided.
        prescription_id = self._voided_prescription()
        response = self._approve(prescription_id)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self._status(prescription_id), "voided")

    def test_patch_voided_409_state_unchanged(self) -> None:
        # Editar una receta anulada está prohibido (sólo borrador): 409 y sin cambios.
        prescription_id = self._voided_prescription()
        response = self.client.patch(
            f"{_BASE}/{prescription_id}", json={"observations": "cambio prohibido"}
        )
        self.assertEqual(response.status_code, 409, response.text)
        body = self.client.get(f"{_BASE}/{prescription_id}").json()
        self.assertEqual(body["status"], "voided")
        self.assertIsNone(body["observations"])

    def test_delete_voided_409_state_unchanged(self) -> None:
        # Borrar (baja lógica) una receta anulada está prohibido (sólo borrador): 409.
        prescription_id = self._voided_prescription()
        response = self.client.delete(f"{_BASE}/{prescription_id}")
        self.assertEqual(response.status_code, 409, response.text)
        # La receta sigue disponible y anulada (no fue eliminada).
        self.assertEqual(self._status(prescription_id), "voided")

    def test_void_without_doctor_profile_403_state_unchanged(self) -> None:
        # Anular exige perfil de médico activo tratante; un usuario sin perfil de
        # médico recibe 403 y la receta sigue aprobada.
        prescription_id = self._approved_prescription()
        other_user = self._seed_user()
        self._as_user(other_user, *ALL_PERMS)
        self.assertEqual(self._void(prescription_id).status_code, 403)
        self._as(*ALL_PERMS)
        self.assertEqual(self._status(prescription_id), "approved")


if __name__ == "__main__":
    unittest.main()
