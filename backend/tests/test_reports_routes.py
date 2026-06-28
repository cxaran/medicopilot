"""Tests de integración de los reportes agregados (G5 fase 2).

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
from backend.app.models.appointment import Appointment  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    AppointmentStatus,
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


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class ReportsCatalogTest(unittest.TestCase):
    def test_reports_permission_declared(self) -> None:
        self.assertIn("reports:read", declared_permissions())


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ReportsRoutesTest(unittest.TestCase):
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
        self._as("reports:read")
        self.client = TestClient(app)
        self.patient_id = self._patient()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ConsultationDiagnosis))
            session.execute(delete(Appointment))
            session.execute(delete(Consultation))
            session.execute(delete(Patient))
            session.execute(delete(Doctor))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    # --- siembra ---

    def _patient(self) -> uuid.UUID:
        pid = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=pid,
                    full_name="Paciente Reporte",
                    birth_date=date(1990, 1, 1),
                    sex=Sex.FEMALE,
                    status=PatientStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return pid

    def _doctor(self, name: str) -> uuid.UUID:
        did = uuid.uuid4()
        uid = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                User(
                    id=uid,
                    name="Med",
                    last_name="Ico",
                    email=f"doc-{uid}@example.com",
                    hashed_password="x",
                    is_active=True,
                )
            )
            session.flush()
            session.add(
                Doctor(
                    id=did,
                    user_id=uid,
                    professional_name=name,
                    professional_license_number=f"LIC-{did}",
                    status=RecordStatus.ACTIVE,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()
        return did

    def _consultation(
        self,
        doctor_id: uuid.UUID,
        consulted_at: datetime,
        *,
        status: ConsultationStatus = ConsultationStatus.FINALIZED,
        deleted: bool = False,
    ) -> uuid.UUID:
        cid = uuid.uuid4()
        finalized_by = doctor_id if status == ConsultationStatus.FINALIZED else None
        finalized_at = consulted_at if status == ConsultationStatus.FINALIZED else None
        with Session(self.engine) as session:
            session.add(
                Consultation(
                    id=cid,
                    patient_id=self.patient_id,
                    attending_doctor_id=doctor_id,
                    consulted_at=consulted_at,
                    reason_for_visit="Control",
                    status=status,
                    finalized_by_doctor_id=finalized_by,
                    finalized_at=finalized_at,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()
        return cid

    def _diagnosis(
        self,
        consultation_id: uuid.UUID,
        *,
        text: str,
        code: str | None = None,
        coding_system: str | None = None,
        deleted: bool = False,
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                ConsultationDiagnosis(
                    id=uuid.uuid4(),
                    consultation_id=consultation_id,
                    diagnosis_kind=ConsultationDiagnosisKind.PRIMARY,
                    diagnosis_text=text,
                    code=code,
                    coding_system=coding_system,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()

    def _appointment(
        self,
        doctor_id: uuid.UUID,
        scheduled_at: datetime,
        *,
        status: AppointmentStatus = AppointmentStatus.PENDING,
        deleted: bool = False,
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                Appointment(
                    id=uuid.uuid4(),
                    patient_id=self.patient_id,
                    doctor_id=doctor_id,
                    scheduled_at=scheduled_at,
                    duration_minutes=30,
                    reason="Cita",
                    status=status,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()

    def _get(self, path: str) -> dict:
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # --- activity ---

    def test_activity_monthly_counts_with_empty_month(self) -> None:
        d1 = self._doctor("Dra. Uno")
        self._consultation(d1, datetime(2026, 1, 10, 9, 0))
        self._consultation(d1, datetime(2026, 1, 20, 9, 0))
        self._consultation(d1, datetime(2026, 3, 5, 9, 0))
        self._appointment(d1, datetime(2026, 1, 15, 9, 0))
        self._appointment(d1, datetime(2026, 2, 1, 9, 0))
        self._appointment(d1, datetime(2026, 2, 2, 9, 0))
        self._appointment(d1, datetime(2026, 2, 3, 9, 0))

        data = self._get("/api/v1/reports/activity?date_from=2026-01-01&date_to=2026-03-31")
        by_period = {p["period"]: p for p in data}
        self.assertEqual([p["period"] for p in data], ["2026-01", "2026-02", "2026-03"])
        self.assertEqual((by_period["2026-01"]["consultations"], by_period["2026-01"]["appointments"]), (2, 1))
        self.assertEqual((by_period["2026-02"]["consultations"], by_period["2026-02"]["appointments"]), (0, 3))
        self.assertEqual((by_period["2026-03"]["consultations"], by_period["2026-03"]["appointments"]), (1, 0))

    def test_activity_per_doctor_filter(self) -> None:
        d1 = self._doctor("Dra. Uno")
        d2 = self._doctor("Dr. Dos")
        self._consultation(d1, datetime(2026, 1, 10, 9, 0))
        self._consultation(d2, datetime(2026, 1, 11, 9, 0))
        data = self._get(f"/api/v1/reports/activity?date_from=2026-01-01&date_to=2026-01-31&doctor_id={d1}")
        self.assertEqual(data[0]["consultations"], 1)

    def test_activity_excludes_soft_deleted(self) -> None:
        d1 = self._doctor("Dra. Uno")
        self._consultation(d1, datetime(2026, 1, 10, 9, 0))
        self._consultation(d1, datetime(2026, 1, 11, 9, 0), deleted=True)
        data = self._get("/api/v1/reports/activity?date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(data[0]["consultations"], 1)

    def test_activity_invalid_range_422(self) -> None:
        response = self.client.get("/api/v1/reports/activity?date_from=2026-03-01&date_to=2026-01-01")
        self.assertEqual(response.status_code, 422)

    # --- top_diagnoses ---

    def test_top_diagnoses_ranking_and_limit(self) -> None:
        d1 = self._doctor("Dra. Uno")
        c1 = self._consultation(d1, datetime(2026, 1, 10, 9, 0))
        c2 = self._consultation(d1, datetime(2026, 1, 11, 9, 0))
        # E11.9 x3, cefalea (texto normalizado) x2, I10 x1
        self._diagnosis(c1, text="Diabetes", code="E11.9", coding_system="CIE-10")
        self._diagnosis(c1, text="Diabetes", code="E11.9", coding_system="CIE-10")
        self._diagnosis(c2, text="Diabetes", code="E11.9", coding_system="CIE-10")
        self._diagnosis(c1, text="Cefalea")
        self._diagnosis(c2, text="  cefalea ")
        self._diagnosis(c2, text="Hipertensión", code="I10", coding_system="CIE-10")

        data = self._get("/api/v1/reports/top-diagnoses?date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(
            [(d["code_or_text"], d["count"]) for d in data],
            [("E11.9", 3), ("cefalea", 2), ("I10", 1)],
        )
        limited = self._get("/api/v1/reports/top-diagnoses?date_from=2026-01-01&date_to=2026-01-31&limit=2")
        self.assertEqual([d["code_or_text"] for d in limited], ["E11.9", "cefalea"])

    def test_top_diagnoses_window_and_soft_delete(self) -> None:
        d1 = self._doctor("Dra. Uno")
        c_in = self._consultation(d1, datetime(2026, 1, 10, 9, 0))
        c_out = self._consultation(d1, datetime(2026, 6, 10, 9, 0))
        self._diagnosis(c_in, text="Asma", code="J45", coding_system="CIE-10")
        self._diagnosis(c_in, text="Eliminado", code="X00", coding_system="CIE-10", deleted=True)
        self._diagnosis(c_out, text="Fuera", code="Z99", coding_system="CIE-10")
        data = self._get("/api/v1/reports/top-diagnoses?date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual([(d["code_or_text"], d["count"]) for d in data], [("J45", 1)])

    def test_top_diagnoses_empty_window(self) -> None:
        data = self._get("/api/v1/reports/top-diagnoses?date_from=2030-01-01&date_to=2030-01-31")
        self.assertEqual(data, [])

    # --- unsigned_notes ---

    def test_unsigned_notes_per_doctor(self) -> None:
        d1 = self._doctor("Dra. Uno")
        d2 = self._doctor("Dr. Dos")
        self._consultation(d1, datetime(2026, 1, 10, 9, 0), status=ConsultationStatus.DRAFT)
        self._consultation(d1, datetime(2026, 1, 11, 9, 0), status=ConsultationStatus.DRAFT)
        self._consultation(d1, datetime(2026, 1, 12, 9, 0), status=ConsultationStatus.FINALIZED)
        self._consultation(d2, datetime(2026, 1, 13, 9, 0), status=ConsultationStatus.DRAFT)
        data = self._get("/api/v1/reports/unsigned-notes")
        self.assertEqual([(d["doctor_name"], d["count"]) for d in data], [("Dra. Uno", 2), ("Dr. Dos", 1)])
        filtered = self._get(f"/api/v1/reports/unsigned-notes?doctor_id={d2}")
        self.assertEqual([(d["doctor_name"], d["count"]) for d in filtered], [("Dr. Dos", 1)])

    def test_unsigned_notes_excludes_finalized_and_deleted(self) -> None:
        d1 = self._doctor("Dra. Uno")
        self._consultation(d1, datetime(2026, 1, 12, 9, 0), status=ConsultationStatus.FINALIZED)
        self._consultation(d1, datetime(2026, 1, 13, 9, 0), status=ConsultationStatus.DRAFT, deleted=True)
        data = self._get("/api/v1/reports/unsigned-notes")
        self.assertEqual(data, [])

    # --- attendance ---

    def test_attendance_counts_and_rates(self) -> None:
        d1 = self._doctor("Dra. Uno")
        self._appointment(d1, datetime(2026, 1, 5, 9, 0), status=AppointmentStatus.ATTENDED)
        self._appointment(d1, datetime(2026, 1, 6, 9, 0), status=AppointmentStatus.ATTENDED)
        self._appointment(d1, datetime(2026, 1, 7, 9, 0), status=AppointmentStatus.NO_SHOW)
        self._appointment(d1, datetime(2026, 1, 8, 9, 0), status=AppointmentStatus.CANCELLED)
        self._appointment(d1, datetime(2026, 1, 9, 9, 0), status=AppointmentStatus.PENDING)
        # Fuera de ventana.
        self._appointment(d1, datetime(2026, 2, 1, 9, 0), status=AppointmentStatus.ATTENDED)

        data = self._get("/api/v1/reports/attendance?date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(
            (data["attended"], data["no_show"], data["cancelled"], data["total"]),
            (2, 1, 1, 4),
        )
        self.assertEqual(data["attended_rate"], 0.5)
        self.assertEqual(data["no_show_rate"], 0.25)
        self.assertEqual(data["cancelled_rate"], 0.25)

    def test_attendance_empty_window_zero_rates(self) -> None:
        data = self._get("/api/v1/reports/attendance?date_from=2030-01-01&date_to=2030-01-31")
        self.assertEqual(
            (data["attended"], data["no_show"], data["cancelled"], data["total"]),
            (0, 0, 0, 0),
        )
        self.assertEqual(data["attended_rate"], 0.0)

    def test_attendance_per_doctor(self) -> None:
        d1 = self._doctor("Dra. Uno")
        d2 = self._doctor("Dr. Dos")
        self._appointment(d1, datetime(2026, 1, 5, 9, 0), status=AppointmentStatus.ATTENDED)
        self._appointment(d2, datetime(2026, 1, 6, 9, 0), status=AppointmentStatus.NO_SHOW)
        data = self._get(f"/api/v1/reports/attendance?date_from=2026-01-01&date_to=2026-01-31&doctor_id={d1}")
        self.assertEqual((data["attended"], data["no_show"], data["total"]), (1, 0, 1))

    # --- RBAC ---

    def test_rbac_requires_reports_read(self) -> None:
        self._as("patients:read")
        response = self.client.get("/api/v1/reports/activity?date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
