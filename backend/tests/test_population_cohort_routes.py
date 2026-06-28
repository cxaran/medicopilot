"""Tests de integración de la consulta de cohorte poblacional (G5 fase 1).

Requieren PostgreSQL real (cruza patients/consultations/diagnoses/lab_results/
vital_signs/appointments). Se ejecutan solo si ``TEST_POSTGRES_URL`` apunta a una
base cuyo nombre termina en ``_test``.
"""

import os
import unittest
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


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
    LabResultAbnormalFlag,
    PregnancyStatus,
    RecordStatus,
    Sex,
)
from backend.app.models.lab_result import LabResult  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.models.vital_sign import VitalSign  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")
_UTC = ZoneInfo("UTC")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


def _subtract_years(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year - years)
    except ValueError:
        return value.replace(year=value.year - years, day=28)


class CohortCatalogTest(unittest.TestCase):
    def test_population_permission_declared(self) -> None:
        self.assertIn("population:read", declared_permissions())


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class CohortRoutesTest(unittest.TestCase):
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
        self._as("population:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ConsultationDiagnosis))
            session.execute(delete(VitalSign))
            session.execute(delete(LabResult))
            session.execute(delete(Appointment))
            session.execute(delete(Consultation))
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

    # --- helpers de siembra ---

    def _patient(
        self,
        *,
        full_name: str = "Paciente X",
        birth_date: date = date(1990, 1, 1),
        pregnancy_status: PregnancyStatus = PregnancyStatus.NONE,
        deleted: bool = False,
    ) -> uuid.UUID:
        pid = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Patient(
                    id=pid,
                    full_name=full_name,
                    birth_date=birth_date,
                    sex=Sex.FEMALE,
                    pregnancy_status=pregnancy_status,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()
        return pid

    def _consultation(self, patient_id: uuid.UUID, *, deleted: bool = False) -> uuid.UUID:
        cid = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                Consultation(
                    id=cid,
                    patient_id=patient_id,
                    attending_doctor_id=self.doctor_id,
                    consulted_at=datetime(2026, 1, 5, 10, 0, 0),
                    reason_for_visit="Control",
                    status=ConsultationStatus.DRAFT,
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
        text: str = "Diabetes mellitus tipo 2",
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

    def _lab(
        self,
        patient_id: uuid.UUID,
        *,
        analyte_name: str = "HbA1c",
        analyte_code: str | None = None,
        flag: LabResultAbnormalFlag = LabResultAbnormalFlag.HIGH,
        measured_at: datetime = datetime(2026, 1, 10, 9, 0, 0),
        deleted: bool = False,
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                LabResult(
                    id=uuid.uuid4(),
                    patient_id=patient_id,
                    analyte_name=analyte_name,
                    analyte_code=analyte_code,
                    value_numeric=Decimal("9.0"),
                    abnormal_flag=flag,
                    measured_at=measured_at,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()

    def _vital(
        self,
        consultation_id: uuid.UUID,
        *,
        heart_rate_bpm: int = 150,
        measured_at: datetime = datetime(2026, 1, 5, 10, 0, 0),
        deleted: bool = False,
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                VitalSign(
                    id=uuid.uuid4(),
                    consultation_id=consultation_id,
                    measured_at=measured_at,
                    heart_rate_bpm=heart_rate_bpm,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                    deleted_at=datetime(2026, 1, 1) if deleted else None,
                    deleted_by=self.actor_id if deleted else None,
                )
            )
            session.commit()

    def _appointment(
        self,
        patient_id: uuid.UUID,
        *,
        status: AppointmentStatus = AppointmentStatus.NO_SHOW,
        scheduled_at: datetime = datetime(2026, 2, 1, 9, 0, 0),
    ) -> None:
        with Session(self.engine) as session:
            session.add(
                Appointment(
                    id=uuid.uuid4(),
                    patient_id=patient_id,
                    doctor_id=self.doctor_id,
                    scheduled_at=scheduled_at,
                    duration_minutes=30,
                    reason="Seguimiento",
                    status=status,
                    created_by=self.actor_id,
                    updated_by=self.actor_id,
                )
            )
            session.commit()

    def _cohort(self, body: dict) -> dict:
        response = self.client.post("/api/v1/population/cohort", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # --- criterios aislados ---

    def test_has_diagnosis_by_code_and_text(self) -> None:
        match = self._patient(full_name="Con diagnóstico")
        c1 = self._consultation(match)
        self._diagnosis(c1, text="Diabetes mellitus tipo 2", code="E11.9", coding_system="CIE-10")
        # Paciente sin diagnóstico que coincide.
        other = self._patient(full_name="Sin diagnóstico")
        c2 = self._consultation(other)
        self._diagnosis(c2, text="Hipertensión esencial")

        by_code = self._cohort({"has_diagnosis": {"code": "e11.9"}})
        self.assertEqual(by_code["count"], 1)
        self.assertEqual(by_code["sample"][0]["patient_id"], str(match))

        by_text = self._cohort({"has_diagnosis": {"text": "diabetes"}})
        self.assertEqual(by_text["count"], 1)

        no_match = self._cohort({"has_diagnosis": {"code": "Z00.0"}})
        self.assertEqual(no_match["count"], 0)

    def test_has_diagnosis_ignores_soft_deleted(self) -> None:
        patient = self._patient()
        cons = self._consultation(patient)
        self._diagnosis(cons, text="Asma", deleted=True)
        result = self._cohort({"has_diagnosis": {"text": "asma"}})
        self.assertEqual(result["count"], 0)

    def test_lab_abnormal_flag_and_date_window(self) -> None:
        in_window = self._patient(full_name="Anormal en ventana")
        self._lab(in_window, flag=LabResultAbnormalFlag.HIGH, measured_at=datetime(2026, 1, 10, 9, 0))
        out_window = self._patient(full_name="Anormal fuera de ventana")
        self._lab(out_window, flag=LabResultAbnormalFlag.HIGH, measured_at=datetime(2026, 6, 10, 9, 0))
        normal = self._patient(full_name="Solo normal")
        self._lab(normal, flag=LabResultAbnormalFlag.NORMAL, measured_at=datetime(2026, 1, 10, 9, 0))

        # Sin ventana: cuentan los dos anormales, no el normal.
        any_date = self._cohort({"lab_abnormal": {"analyte": "HbA1c"}})
        self.assertEqual(any_date["count"], 2)

        # Ventana enero: solo el de enero.
        jan = self._cohort(
            {"lab_abnormal": {"analyte": "HbA1c", "date_from": "2026-01-01", "date_to": "2026-01-31"}}
        )
        self.assertEqual(jan["count"], 1)
        self.assertEqual(jan["sample"][0]["patient_id"], str(in_window))

        # Frontera inclusiva: date_to == día de la medición incluye el resultado.
        boundary_in = self._cohort(
            {"lab_abnormal": {"analyte": "HbA1c", "date_from": "2026-01-10", "date_to": "2026-01-10"}}
        )
        self.assertEqual(boundary_in["count"], 1)

        # Justo fuera: la ventana termina el día anterior -> no cuenta.
        boundary_out = self._cohort(
            {"lab_abnormal": {"analyte": "HbA1c", "date_from": "2026-01-01", "date_to": "2026-01-09"}}
        )
        self.assertEqual(boundary_out["count"], 0)

    def test_vital_threshold_comparator_and_boundary(self) -> None:
        high = self._patient(full_name="Taquicárdico")
        self._vital(self._consultation(high), heart_rate_bpm=150)
        low = self._patient(full_name="Normocárdico")
        self._vital(self._consultation(low), heart_rate_bpm=70)

        gte_140 = self._cohort(
            {"vital_threshold": {"vital": "heart_rate_bpm", "comparator": "gte", "value": 140}}
        )
        self.assertEqual(gte_140["count"], 1)
        self.assertEqual(gte_140["sample"][0]["patient_id"], str(high))

        # Frontera inclusiva: 150 >= 150 cuenta.
        gte_150 = self._cohort(
            {"vital_threshold": {"vital": "heart_rate_bpm", "comparator": "gte", "value": 150}}
        )
        self.assertEqual(gte_150["count"], 1)

        # Justo fuera: 150 >= 151 no cuenta.
        gte_151 = self._cohort(
            {"vital_threshold": {"vital": "heart_rate_bpm", "comparator": "gte", "value": 151}}
        )
        self.assertEqual(gte_151["count"], 0)

    def test_pregnancy_status(self) -> None:
        self._patient(full_name="Embarazada", pregnancy_status=PregnancyStatus.PREGNANT)
        self._patient(full_name="No embarazada", pregnancy_status=PregnancyStatus.NONE)
        result = self._cohort({"pregnancy_status": "pregnant"})
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["sample"][0]["full_name"], "Embarazada")

    def test_age_range_boundaries(self) -> None:
        today = datetime.now(_UTC).date()
        self._patient(full_name="Edad 30", birth_date=_subtract_years(today, 30))
        self._patient(full_name="Edad 35", birth_date=_subtract_years(today, 35))
        self._patient(full_name="Edad 40", birth_date=_subtract_years(today, 40))
        # Justo más joven que 30 (29): nació un día después del corte.
        self._patient(full_name="Edad 29", birth_date=_subtract_years(today, 30) + timedelta(days=1))
        # Justo mayor que 40 (41): nació exactamente hace 41 años.
        self._patient(full_name="Edad 41", birth_date=_subtract_years(today, 41))

        result = self._cohort({"age_range": {"min_age": 30, "max_age": 40}})
        self.assertEqual(result["count"], 3)
        names = {item["full_name"] for item in result["sample"]}
        self.assertEqual(names, {"Edad 30", "Edad 35", "Edad 40"})

    def test_appointment_no_show_and_window(self) -> None:
        no_show = self._patient(full_name="Inasistió")
        self._appointment(no_show, status=AppointmentStatus.NO_SHOW, scheduled_at=datetime(2026, 2, 1, 9, 0))
        attended = self._patient(full_name="Asistió")
        self._appointment(attended, status=AppointmentStatus.ATTENDED, scheduled_at=datetime(2026, 2, 1, 9, 0))

        any_date = self._cohort({"appointment_no_show": {}})
        self.assertEqual(any_date["count"], 1)
        self.assertEqual(any_date["sample"][0]["patient_id"], str(no_show))

        in_window = self._cohort(
            {"appointment_no_show": {"date_from": "2026-02-01", "date_to": "2026-02-28"}}
        )
        self.assertEqual(in_window["count"], 1)

        out_window = self._cohort(
            {"appointment_no_show": {"date_from": "2026-01-01", "date_to": "2026-01-31"}}
        )
        self.assertEqual(out_window["count"], 0)

    # --- combinación AND, soft-delete, forma de salida, RBAC ---

    def test_and_combined_criteria(self) -> None:
        today = datetime.now(_UTC).date()
        # Cumple ambos: embarazada y 30 años.
        both = self._patient(
            full_name="Embarazada 30",
            birth_date=_subtract_years(today, 30),
            pregnancy_status=PregnancyStatus.PREGNANT,
        )
        # Embarazada pero fuera de rango de edad.
        self._patient(
            full_name="Embarazada 60",
            birth_date=_subtract_years(today, 60),
            pregnancy_status=PregnancyStatus.PREGNANT,
        )
        # En rango de edad pero no embarazada.
        self._patient(full_name="No embarazada 30", birth_date=_subtract_years(today, 30))

        result = self._cohort(
            {"pregnancy_status": "pregnant", "age_range": {"min_age": 25, "max_age": 35}}
        )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["sample"][0]["patient_id"], str(both))

    def test_soft_deleted_patient_not_counted(self) -> None:
        self._patient(full_name="Embarazada activa", pregnancy_status=PregnancyStatus.PREGNANT)
        self._patient(
            full_name="Embarazada eliminada",
            pregnancy_status=PregnancyStatus.PREGNANT,
            deleted=True,
        )
        result = self._cohort({"pregnancy_status": "pregnant"})
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["sample"][0]["full_name"], "Embarazada activa")

    def test_sample_shape_and_pagination(self) -> None:
        for index in range(3):
            self._patient(
                full_name=f"Embarazada {index}", pregnancy_status=PregnancyStatus.PREGNANT
            )
        first = self._cohort({"pregnancy_status": "pregnant", "limit": 2, "offset": 0})
        self.assertEqual(first["count"], 3)
        self.assertEqual(len(first["sample"]), 2)
        for item in first["sample"]:
            self.assertIn("patient_id", item)
            self.assertIn("full_name", item)
        second = self._cohort({"pregnancy_status": "pregnant", "limit": 2, "offset": 2})
        self.assertEqual(second["count"], 3)
        self.assertEqual(len(second["sample"]), 1)

    def test_empty_criteria_counts_all_active_patients(self) -> None:
        self._patient(full_name="Activo 1")
        self._patient(full_name="Activo 2")
        self._patient(full_name="Eliminado", deleted=True)
        result = self._cohort({})
        self.assertEqual(result["count"], 2)

    def test_invalid_diagnosis_criterion_422(self) -> None:
        # Diagnóstico sin code ni text -> 422.
        response = self.client.post("/api/v1/population/cohort", json={"has_diagnosis": {}})
        self.assertEqual(response.status_code, 422)

    def test_rbac_requires_population_read(self) -> None:
        self._as("patients:read")
        response = self.client.post("/api/v1/population/cohort", json={})
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
