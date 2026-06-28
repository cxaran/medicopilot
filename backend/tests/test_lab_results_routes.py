"""Tests de integración del recurso Lab Results (resultados de laboratorio).

Requieren PostgreSQL real: dependen de las FK a ``patients``/``consultations`` y de
los CHECK constraints (valor presente, rango de referencia coherente), que SQLite no
representa fielmente. Se ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a una base
cuyo nombre termina en ``_test``.

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_lab_results_routes
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
    LabResultAbnormalFlag,
    PatientStatus,
    RecordStatus,
    Sex,
)
from backend.app.models.lab_result import LabResult  # noqa: E402
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
    "lab_results:read",
    "lab_results:create",
    "lab_results:update",
    "lab_results:delete",
)
_BASE = "/api/v1/lab-results"


class LabResultsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cuatro permisos estén declarados."""

    def test_four_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class LabResultRoutesTest(unittest.TestCase):
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
        self.other_patient_id = self._seed_patient(full_name="Juan Pérez")
        self.doctor_id = self._seed_doctor()
        self.consultation_id = self._seed_consultation()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(LabResult))
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

    def _seed_patient(self, *, full_name: str = "María García") -> uuid.UUID:
        patient_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=patient_id,
                    full_name=full_name,
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

    def _seed_consultation(self, *, deleted: bool = False) -> uuid.UUID:
        consultation_id = uuid.uuid4()
        with Session(self.engine) as session:
            consultation = Consultation(
                id=consultation_id,
                patient_id=self.patient_id,
                attending_doctor_id=self.doctor_id,
                consulted_at=utc_now(),
                reason_for_visit="Control",
                status=ConsultationStatus.DRAFT,
                created_by=self.actor_id,
                updated_by=self.actor_id,
            )
            if deleted:
                consultation.deleted_at = utc_now()
                consultation.deleted_by = self.actor_id
            session.add(consultation)
            session.commit()
        return consultation_id

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "analyte_name": "HbA1c",
            "value_numeric": 5.4,
            "unit": "%",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    # --- creación ---

    def test_create_minimal(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["analyte_name"], "HbA1c")
        self.assertEqual(body["value_numeric"], 5.4)
        # abnormal_flag por defecto: unknown.
        self.assertEqual(body["abnormal_flag"], "unknown")
        self.assertIsNotNone(body["measured_at"])

    def test_create_qualitative_value(self) -> None:
        created = self._create(value_numeric=None, value_text="positivo", unit=None)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["value_text"], "positivo")

    def test_create_requires_a_value(self) -> None:
        # Sin value_numeric ni value_text -> 422 (validación de schema).
        self.assertEqual(
            self._create(value_numeric=None, unit=None).status_code, 422
        )

    def test_create_with_consultation_and_document_links(self) -> None:
        created = self._create(consultation_id=str(self.consultation_id))
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["consultation_id"], str(self.consultation_id))

    def test_create_missing_patient_404(self) -> None:
        self.assertEqual(self._create(patient_id=str(uuid.uuid4())).status_code, 404)

    def test_create_deleted_consultation_404(self) -> None:
        deleted = self._seed_consultation(deleted=True)
        self.assertEqual(
            self._create(consultation_id=str(deleted)).status_code, 404
        )

    def test_reference_range_inverted_rejected(self) -> None:
        self.assertEqual(
            self._create(reference_range_low=10, reference_range_high=5).status_code,
            422,
        )

    def test_measured_at_future_rejected(self) -> None:
        future = (utc_now() + timedelta(days=1)).isoformat()
        self.assertEqual(self._create(measured_at=future).status_code, 422)

    def test_reject_audit_fields_as_input(self) -> None:
        self.assertEqual(self._create(created_by=str(uuid.uuid4())).status_code, 422)
        self.assertEqual(self._create(reviewed_at="2024-01-01T00:00:00").status_code, 422)

    # --- lectura / filtros ---

    def test_filter_by_patient(self) -> None:
        self._create()
        self._create(patient_id=str(self.other_patient_id), analyte_name="Glucosa")
        listed = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id)}
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["analyte_name"], "HbA1c")

    def test_filter_by_analyte_contains(self) -> None:
        self._create(analyte_name="HbA1c")
        self._create(analyte_name="Glucosa en ayunas")
        # contains case-insensitive sobre el nombre del analito.
        listed = self.client.get(
            _BASE,
            params={"patient_id": str(self.patient_id), "analyte_name_contains": "gluc"},
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)
        self.assertEqual(listed["items"][0]["analyte_name"], "Glucosa en ayunas")

    def test_filter_measured_at_range(self) -> None:
        self._create(measured_at="2024-01-10T08:00:00")
        self._create(measured_at="2024-03-10T08:00:00")
        self._create(measured_at="2024-06-10T08:00:00")
        base = {"patient_id": str(self.patient_id)}
        between = self.client.get(
            _BASE,
            params={**base, "measured_at_from": "2024-02-01", "measured_at_to": "2024-05-01"},
        ).json()
        self.assertEqual(between["pagination"]["total"], 1)
        before = self.client.get(
            _BASE, params={**base, "measured_at_before": "2024-02-01"}
        ).json()
        self.assertEqual(before["pagination"]["total"], 1)
        after = self.client.get(
            _BASE, params={**base, "measured_at_after": "2024-04-01"}
        ).json()
        self.assertEqual(after["pagination"]["total"], 1)

    def test_filter_abnormal_only_via_in(self) -> None:
        # Tres resultados: normal, alto y crítico. El filtro "solo anormales" usa
        # abnormal_flag_in=low,high,critical (lista repetida).
        self._create(abnormal_flag="normal", value_numeric=5.0)
        self._create(abnormal_flag="high", value_numeric=9.0)
        self._create(abnormal_flag="critical", value_numeric=14.0)
        listed = self.client.get(
            _BASE,
            params=[
                ("patient_id", str(self.patient_id)),
                ("abnormal_flag_in", "low"),
                ("abnormal_flag_in", "high"),
                ("abnormal_flag_in", "critical"),
            ],
        ).json()
        self.assertEqual(listed["pagination"]["total"], 2)
        flags = {item["abnormal_flag"] for item in listed["items"]}
        self.assertEqual(flags, {"high", "critical"})

    def test_filter_abnormal_flag_eq(self) -> None:
        self._create(abnormal_flag="normal")
        self._create(abnormal_flag="critical")
        listed = self.client.get(
            _BASE,
            params={"patient_id": str(self.patient_id), "abnormal_flag": "critical"},
        ).json()
        self.assertEqual(listed["pagination"]["total"], 1)

    def test_order_by_measured_at_desc_default(self) -> None:
        self._create(measured_at="2024-01-10T08:00:00", value_numeric=5.0)
        self._create(measured_at="2024-06-10T08:00:00", value_numeric=9.0)
        listed = self.client.get(
            _BASE, params={"patient_id": str(self.patient_id)}
        ).json()
        # default_sort=-measured_at: el más reciente primero.
        self.assertEqual(
            [item["value_numeric"] for item in listed["items"]], [9.0, 5.0]
        )

    def test_get_detail(self) -> None:
        created = self._create().json()
        got = self.client.get(f"{_BASE}/{created['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["id"], created["id"])

    # --- edición ---

    def test_patch_updates_flag_and_value(self) -> None:
        result = self._create(abnormal_flag="unknown").json()
        response = self.client.patch(
            f"{_BASE}/{result['id']}",
            json={"abnormal_flag": "high", "value_numeric": 9.1},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["abnormal_flag"], "high")
        self.assertEqual(response.json()["value_numeric"], 9.1)

    def test_patch_rejects_patient_id_change(self) -> None:
        result = self._create().json()
        response = self.client.patch(
            f"{_BASE}/{result['id']}", json={"patient_id": str(self.other_patient_id)}
        )
        self.assertEqual(response.status_code, 422, response.text)

    # --- borrado lógico ---

    def test_soft_delete(self) -> None:
        result = self._create().json()
        self.assertEqual(self.client.delete(f"{_BASE}/{result['id']}").status_code, 200)
        self.assertEqual(
            self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()[
                "pagination"
            ]["total"],
            0,
        )
        self.assertEqual(self.client.get(f"{_BASE}/{result['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{result['id']}").status_code, 404)

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        result = self._create().json()

        self._as("lab_results:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)
        self.assertEqual(self.client.get(f"{_BASE}/{result['id']}").status_code, 403)

        self._as("lab_results:read")  # sin create/update/delete
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{result['id']}", json={"abnormal_flag": "high"}
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{result['id']}").status_code, 403)

    # --- invariantes de base de datos ---

    def _insert_result(self, **kwargs: object) -> None:
        defaults: dict[str, object] = {
            "patient_id": self.patient_id,
            "analyte_name": "HbA1c",
            "abnormal_flag": LabResultAbnormalFlag.UNKNOWN,
            "measured_at": utc_now(),
            "created_by": self.actor_id,
            "updated_by": self.actor_id,
        }
        defaults.update(kwargs)
        with Session(self.engine) as session:
            session.add(LabResult(**defaults))
            session.commit()

    def test_db_check_constraints(self) -> None:
        from decimal import Decimal

        # Sin ningún valor -> viola lab_result_value_present.
        with self.assertRaises(IntegrityError):
            self._insert_result()
        # Rango invertido -> viola lab_result_reference_range.
        with self.assertRaises(IntegrityError):
            self._insert_result(
                value_numeric=Decimal("5.0"),
                reference_range_low=Decimal("10"),
                reference_range_high=Decimal("5"),
            )


if __name__ == "__main__":
    unittest.main()
