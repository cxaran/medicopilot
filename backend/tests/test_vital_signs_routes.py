"""Tests de integración del recurso Vital Signs.

Requieren PostgreSQL real: dependen de la IDENTITY de ``patients.record_number``,
de las FK a ``consultations`` y de los CHECK constraints estructurales (positivos,
emparejamiento/orden de presión, rangos de saturación, glucosa y dolor), que
SQLite no representa fielmente. Se ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a
una base cuyo nombre termina en ``_test``.

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_vital_signs_routes
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
from backend.app.models.vital_sign import VitalSign  # noqa: E402
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
    "vital_signs:read",
    "vital_signs:create",
    "vital_signs:update",
    "vital_signs:delete",
)
_BASE = "/api/v1/vital-signs"


class VitalSignsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cuatro permisos estén declarados."""

    def test_four_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class VitalSignRoutesTest(unittest.TestCase):
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
            session.execute(delete(VitalSign))
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
        patient_id: uuid.UUID | None = None,
    ) -> uuid.UUID:
        consultation_id = uuid.uuid4()
        with Session(self.engine) as session:
            consultation = Consultation(
                id=consultation_id,
                patient_id=patient_id or self.patient_id,
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
        payload: dict[str, object] = {"consultation_id": str(self.consultation_id)}
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    # --- creación ---

    def test_create_for_draft_consultation(self) -> None:
        created = self._create(weight_kg=70.0, height_cm=175.0, pain_scale=3)
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["consultation_id"], str(self.consultation_id))
        self.assertEqual(body["pain_scale"], 3)

    def test_measured_at_defaults_and_explicit(self) -> None:
        self.assertIsNotNone(self._create().json()["measured_at"])
        explicit = self._create(measured_at="2024-03-15T10:00:00").json()
        self.assertTrue(explicit["measured_at"].startswith("2024-03-15T10:00:00"))

    def test_create_missing_consultation_404(self) -> None:
        self.assertEqual(self._create(consultation_id=str(uuid.uuid4())).status_code, 404)

    def test_create_deleted_consultation_404(self) -> None:
        deleted = self._seed_consultation(deleted=True)
        self.assertEqual(self._create(consultation_id=str(deleted)).status_code, 404)

    def test_create_finalized_consultation_409(self) -> None:
        finalized = self._seed_consultation(status=ConsultationStatus.FINALIZED)
        self.assertEqual(self._create(consultation_id=str(finalized)).status_code, 409)

    def test_observations_only_record_allowed(self) -> None:
        created = self._create(observations="Paciente rechaza medición")
        self.assertEqual(created.status_code, 201, created.text)
        self.assertIsNone(created.json()["weight_kg"])

    # --- lectura / query ---

    def test_list_get_and_filter_by_consultation(self) -> None:
        created = self._create().json()
        other = self._seed_consultation()
        self.client.post(_BASE, json={"consultation_id": str(other)})

        listed = self.client.get(
            _BASE, params={"consultation_id": str(self.consultation_id)}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["id"], created["id"])
        # El listado no incluye observaciones.
        self.assertNotIn("observations", listed["items"][0])

        got = self.client.get(f"{_BASE}/{created['id']}")
        self.assertEqual(got.status_code, 200)

    def test_list_filter_by_patient_across_consultations(self) -> None:
        # ``patient_id`` se deriva de la consulta (subconsulta del modelo): el filtro
        # reúne las mediciones de TODAS las consultas del paciente y excluye las de
        # otros pacientes.
        first = self._create().json()
        second_consultation = self._seed_consultation()
        second = self.client.post(
            _BASE, json={"consultation_id": str(second_consultation)}
        ).json()
        other_patient = self._seed_patient()
        other_consultation = self._seed_consultation(patient_id=other_patient)
        self.client.post(_BASE, json={"consultation_id": str(other_consultation)})

        listed = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(listed["pagination"]["total"], 2)
        self.assertEqual(
            {item["id"] for item in listed["items"]}, {first["id"], second["id"]}
        )
        # El item de lista y el detalle exponen el paciente derivado.
        self.assertEqual(listed["items"][0]["patient_id"], str(self.patient_id))
        got = self.client.get(f"{_BASE}/{first['id']}").json()
        self.assertEqual(got["patient_id"], str(self.patient_id))

    def test_measured_at_range_operators(self) -> None:
        self._create(measured_at="2024-01-10T08:00:00")
        self._create(measured_at="2024-03-10T08:00:00")
        self._create(measured_at="2024-06-10T08:00:00")
        base = {"consultation_id": str(self.consultation_id)}

        on = self.client.get(_BASE, params={**base, "measured_at_on": "2024-03-10"}).json()
        self.assertEqual(on["pagination"]["total"], 1)
        before = self.client.get(_BASE, params={**base, "measured_at_before": "2024-02-01"}).json()
        self.assertEqual(before["pagination"]["total"], 1)
        after = self.client.get(_BASE, params={**base, "measured_at_after": "2024-04-01"}).json()
        self.assertEqual(after["pagination"]["total"], 1)
        between = self.client.get(
            _BASE,
            params={**base, "measured_at_from": "2024-02-01", "measured_at_to": "2024-05-01"},
        ).json()
        self.assertEqual(between["pagination"]["total"], 1)

    def test_order_by_measured_at(self) -> None:
        self._create(measured_at="2024-01-10T08:00:00", weight_kg=60.0)
        self._create(measured_at="2024-06-10T08:00:00", weight_kg=80.0)
        asc = self.client.get(
            _BASE, params={"consultation_id": str(self.consultation_id), "sort": "measured_at"}
        ).json()
        self.assertEqual([item["weight_kg"] for item in asc["items"]], [60.0, 80.0])

    # --- bmi derivado ---

    def test_bmi_computed(self) -> None:
        body = self._create(weight_kg=70.0, height_cm=175.0).json()
        self.assertEqual(body["bmi"], 22.86)

    def test_bmi_null_without_weight_or_height(self) -> None:
        self.assertIsNone(self._create(weight_kg=70.0).json()["bmi"])
        self.assertIsNone(self._create(height_cm=175.0).json()["bmi"])

    def test_bmi_not_accepted_as_input(self) -> None:
        self.assertEqual(self._create(bmi=25.0).status_code, 422)

    # --- edición ---

    def test_patch_on_draft(self) -> None:
        vital = self._create(weight_kg=70.0).json()
        response = self.client.patch(
            f"{_BASE}/{vital['id']}", json={"weight_kg": 72.5, "heart_rate_bpm": 80}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["weight_kg"], 72.5)
        self.assertEqual(response.json()["heart_rate_bpm"], 80)

    def test_patch_rejects_consultation_id_change(self) -> None:
        vital = self._create().json()
        other = self._seed_consultation()
        response = self.client.patch(
            f"{_BASE}/{vital['id']}", json={"consultation_id": str(other)}
        )
        self.assertEqual(response.status_code, 422, response.text)

    def test_measured_at_future_rejected(self) -> None:
        future = (utc_now() + timedelta(days=1)).isoformat()
        self.assertEqual(self._create(measured_at=future).status_code, 422)

    def test_update_rejects_invalid_payload_without_mutation(self) -> None:
        # La validación de PATCH (VitalSignUpdate) impone los mismos constraints que
        # create, pero no estaba ejercitada. Cada PATCH inválido debe dar 422 y NO
        # mutar el registro (re-GET). El par de presión: enviar uno solo en el mismo
        # PATCH es inválido a nivel de schema (deben registrarse juntos).
        vital = self._create(
            weight_kg=70.0, pain_scale=3, oxygen_saturation=98.0
        ).json()
        invalid_patches = [
            {"weight_kg": 0},
            {"height_cm": -5},
            {"temperature_c": 0},
            {"heart_rate_bpm": 0},
            {"respiratory_rate_rpm": -2},
            {"oxygen_saturation": 101},
            {"oxygen_saturation": -1},
            {"capillary_glucose": -1},
            {"pain_scale": 11},
            {"pain_scale": -1},
            {"systolic_bp": 120},  # par incompleto
            {"diastolic_bp": 80},  # par incompleto
            {"systolic_bp": 80, "diastolic_bp": 120},  # sistólica < diastólica
            {"measured_at": (utc_now() + timedelta(days=1)).isoformat()},  # futura
        ]
        for body in invalid_patches:
            with self.subTest(body=body):
                self.assertEqual(
                    self.client.patch(f"{_BASE}/{vital['id']}", json=body).status_code,
                    422,
                    body,
                )
        # El registro conserva exactamente los valores iniciales: ningún PATCH inválido
        # mutó nada.
        reread = self.client.get(f"{_BASE}/{vital['id']}").json()
        self.assertEqual(reread["weight_kg"], 70.0)
        self.assertEqual(reread["pain_scale"], 3)
        self.assertEqual(reread["oxygen_saturation"], 98.0)
        self.assertIsNone(reread["systolic_bp"])
        self.assertIsNone(reread["diastolic_bp"])

    def test_reject_audit_and_delete_fields_as_input(self) -> None:
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(deleted_at="2024-01-01T00:00:00").status_code, 422)

    # --- validaciones de schema ---

    def test_schema_validations(self) -> None:
        cases = [
            {"weight_kg": 0},
            {"weight_kg": -1},
            {"height_cm": -5},
            {"temperature_c": 0},
            {"heart_rate_bpm": 0},
            {"respiratory_rate_rpm": -2},
            {"systolic_bp": 120},  # presión incompleta
            {"diastolic_bp": 80},  # presión incompleta
            {"systolic_bp": 80, "diastolic_bp": 120},  # sistólica < diastólica
            {"oxygen_saturation": 101},
            {"oxygen_saturation": -1},
            {"capillary_glucose": -1},
            {"pain_scale": 11},
            {"pain_scale": -1},
        ]
        for body in cases:
            with self.subTest(body=body):
                self.assertEqual(self._create(**body).status_code, 422, body)

    def test_valid_blood_pressure_pair(self) -> None:
        created = self._create(systolic_bp=120, diastolic_bp=80)
        self.assertEqual(created.status_code, 201, created.text)

    # --- sellado por consulta finalizada ---

    def test_finalized_consultation_seals_vital_signs(self) -> None:
        vital = self._create(weight_kg=70.0).json()
        # Finaliza la consulta padre directamente en la base.
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            consultation.status = ConsultationStatus.FINALIZED
            consultation.finalized_by_doctor_id = self.doctor_id
            consultation.finalized_at = utc_now()
            session.add(consultation)
            session.commit()

        # GET y list siguen disponibles.
        self.assertEqual(self.client.get(f"{_BASE}/{vital['id']}").status_code, 200)
        self.assertEqual(
            self.client.get(
                _BASE, params={"consultation_id": str(self.consultation_id)}
            ).json()["pagination"]["total"],
            1,
        )
        # POST, PATCH y DELETE quedan bloqueados con 409.
        self.assertEqual(self._create(weight_kg=71.0).status_code, 409)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{vital['id']}", json={"weight_kg": 71.0}).status_code,
            409,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{vital['id']}").status_code, 409)

    # --- borrado lógico ---

    def test_soft_delete_draft_vital(self) -> None:
        vital = self._create().json()
        self.assertEqual(self.client.delete(f"{_BASE}/{vital['id']}").status_code, 200)
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{vital['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{vital['id']}").status_code, 404)

    def test_deleted_parent_hides_vital_signs(self) -> None:
        vital = self._create().json()
        with Session(self.engine) as session:
            consultation = session.get(Consultation, self.consultation_id)
            consultation.deleted_at = utc_now()
            consultation.deleted_by = self.actor_id
            session.add(consultation)
            session.commit()

        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)
        self.assertEqual(self.client.get(f"{_BASE}/{vital['id']}").status_code, 404)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        vital = self._create().json()

        self._as("vital_signs:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{vital['id']}").status_code, 403)

        self._as("vital_signs:read")  # sin create/update/delete
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{vital['id']}", json={"weight_kg": 70.0}).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{vital['id']}").status_code, 403)

    # --- invariantes de base de datos ---

    def _insert_vital(self, **kwargs: object) -> None:
        defaults: dict[str, object] = {
            "consultation_id": self.consultation_id,
            "measured_at": utc_now(),
            "created_by": self.actor_id,
            "updated_by": self.actor_id,
        }
        defaults.update(kwargs)
        with Session(self.engine) as session:
            session.add(VitalSign(**defaults))
            session.commit()

    def test_db_check_constraints(self) -> None:
        from decimal import Decimal

        cases = [
            {"weight_kg": Decimal("0")},
            {"height_cm": Decimal("-1")},
            {"systolic_bp": 120},  # presión incompleta
            {"systolic_bp": 80, "diastolic_bp": 120},  # orden inválido
            {"oxygen_saturation": Decimal("150")},
            {"capillary_glucose": Decimal("-5")},
            {"pain_scale": 11},
        ]
        for body in cases:
            with self.subTest(body=body):
                with self.assertRaises(IntegrityError):
                    self._insert_vital(**body)


if __name__ == "__main__":
    unittest.main()
