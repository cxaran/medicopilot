"""Tests de integración de configuración institucional + cohorte dirigida por config (G5 fase 3).

Requieren PostgreSQL real. Se ejecutan solo si ``TEST_POSTGRES_URL`` apunta a una
base cuyo nombre termina en ``_test``.
"""

import os
import unittest
import uuid
from datetime import date, datetime
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
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    ConsultationStatus,
    PatientStatus,
    RecordStatus,
    Sex,
)
from backend.app.models.institutional_setting import InstitutionalSetting  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.models.vital_sign import VitalSign  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402
from backend.app.services.institutional_settings import (  # noqa: E402
    DEFAULT_SETTINGS,
    seed_institutional_settings,
)


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

_ALL_PERMS = (
    "institutional_settings:read",
    "institutional_settings:create",
    "institutional_settings:update",
    "institutional_settings:delete",
    "population:read",
)


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class SettingsCatalogTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in (
            "institutional_settings:read",
            "institutional_settings:create",
            "institutional_settings:update",
            "institutional_settings:delete",
        ):
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class SettingsRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.doctor_id = uuid.uuid4()
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
                Doctor(
                    id=cls.doctor_id,
                    user_id=cls.actor_id,
                    professional_name="Dra. House",
                    professional_license_number=f"LIC-{cls.doctor_id}",
                    status=RecordStatus.ACTIVE,
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
        self._as(*_ALL_PERMS)
        self.client = TestClient(app)
        with Session(self.engine) as session:
            seed_institutional_settings(session)
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(VitalSign))
            session.execute(delete(Consultation))
            session.execute(delete(Patient))
            session.execute(delete(InstitutionalSetting))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _seed_patient_with_systolic(self, systolic: int) -> uuid.UUID:
        pid = uuid.uuid4()
        cid = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=pid,
                    full_name="Paciente Config",
                    birth_date=date(1980, 1, 1),
                    sex=Sex.MALE,
                    status=PatientStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.add(
                Consultation(
                    id=cid,
                    patient_id=pid,
                    attending_doctor_id=self.doctor_id,
                    consulted_at=datetime(2026, 1, 5, 10, 0),
                    reason_for_visit="Control",
                    status=ConsultationStatus.DRAFT,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.add(
                VitalSign(
                    id=uuid.uuid4(),
                    consultation_id=cid,
                    measured_at=datetime(2026, 1, 5, 10, 0),
                    systolic_bp=systolic,
                    diastolic_bp=90,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return pid

    def _setting_id(self, key: str) -> str:
        data = self.client.get("/api/v1/institutional-settings").json()
        for item in data["items"]:
            if item["key"] == key:
                return item["id"]
        raise AssertionError(f"clave no encontrada: {key}")

    def _cohort(self, body: dict) -> dict:
        response = self.client.post("/api/v1/population/cohort", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # --- defaults / CRUD ---

    def test_defaults_present_after_seed(self) -> None:
        data = self.client.get("/api/v1/institutional-settings").json()
        keys = {item["key"] for item in data["items"]}
        for default in DEFAULT_SETTINGS:
            self.assertIn(default["key"], keys)

    def test_seed_is_idempotent(self) -> None:
        with Session(self.engine) as session:
            created = seed_institutional_settings(session)
            session.commit()
        self.assertEqual(created, 0)  # ya sembrado en setUp
        data = self.client.get("/api/v1/institutional-settings").json()
        self.assertEqual(data["pagination"]["total"], len(DEFAULT_SETTINGS))

    def test_crud_create_patch_delete(self) -> None:
        created = self.client.post(
            "/api/v1/institutional-settings",
            json={
                "key": "lab_target.ldl",
                "category": "lab_target",
                "value": {"target_max": 100, "unit": "mg/dL"},
                "description": "Meta de LDL.",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        setting_id = created.json()["id"]
        patched = self.client.patch(
            f"/api/v1/institutional-settings/{setting_id}",
            json={"value": {"target_max": 70, "unit": "mg/dL"}},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["value"]["target_max"], 70)
        self.assertEqual(
            self.client.delete(f"/api/v1/institutional-settings/{setting_id}").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/institutional-settings/{setting_id}").status_code, 404
        )

    def test_crud_rbac(self) -> None:
        self._as("institutional_settings:read")
        response = self.client.post(
            "/api/v1/institutional-settings",
            json={"key": "x.y", "category": "protocol", "value": {"a": 1}, "description": "x"},
        )
        self.assertEqual(response.status_code, 403)

    # --- cohorte dirigida por configuración ---

    def test_cohort_uses_configured_threshold(self) -> None:
        # Default sembrado: vital_redflag.systolic_bp = gte 140. Paciente con 150 -> dentro.
        self._seed_patient_with_systolic(150)
        self.assertEqual(self._cohort({"vital_threshold": {"vital": "systolic_bp"}})["count"], 1)

        # Subir el umbral a 200 cambia el comportamiento de la cohorte.
        setting_id = self._setting_id("vital_redflag.systolic_bp")
        self.client.patch(
            f"/api/v1/institutional-settings/{setting_id}",
            json={"value": {"comparator": "gte", "value": 200}},
        )
        self.assertEqual(self._cohort({"vital_threshold": {"vital": "systolic_bp"}})["count"], 0)

        # Revertir a 140 vuelve a contar.
        self.client.patch(
            f"/api/v1/institutional-settings/{setting_id}",
            json={"value": {"comparator": "gte", "value": 140}},
        )
        self.assertEqual(self._cohort({"vital_threshold": {"vital": "systolic_bp"}})["count"], 1)

    def test_explicit_value_overrides_config(self) -> None:
        self._seed_patient_with_systolic(150)
        # Config = gte 140 (contaría). Valor explícito gte 200 NO cuenta (override).
        self.assertEqual(
            self._cohort(
                {"vital_threshold": {"vital": "systolic_bp", "comparator": "gte", "value": 200}}
            )["count"],
            0,
        )
        # Valor explícito gte 100 sí cuenta.
        self.assertEqual(
            self._cohort(
                {"vital_threshold": {"vital": "systolic_bp", "comparator": "gte", "value": 100}}
            )["count"],
            1,
        )

    def test_missing_config_without_explicit_value_422(self) -> None:
        # respiratory_rate_rpm no tiene umbral sembrado y no se da valor explícito -> 422.
        response = self.client.post(
            "/api/v1/population/cohort",
            json={"vital_threshold": {"vital": "respiratory_rate_rpm"}},
        )
        self.assertEqual(response.status_code, 422)

    def test_seeded_default_matches_documented_value(self) -> None:
        # El default sembrado para systolic_bp es gte 140 (consistente con la cohorte).
        data = self.client.get("/api/v1/institutional-settings").json()
        by_key = {item["key"]: item for item in data["items"]}
        systolic = by_key["vital_redflag.systolic_bp"]["value"]
        self.assertEqual(systolic["comparator"], "gte")
        self.assertEqual(systolic["value"], 140)


if __name__ == "__main__":
    unittest.main()
