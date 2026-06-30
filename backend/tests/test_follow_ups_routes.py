"""Tests de los pendientes de seguimiento del médico (FOLLOW-UP & TASKS, sólo lectura).

``GET /follow-ups/summary`` reúne tres grupos a partir de modelos YA existentes:
  1. Tareas clínicas abiertas/vencidas.
  2. Citas no asistidas (no_show) o canceladas, recientes.
  3. Resultados de laboratorio anormales sin revisar.

Las pruebas de ruta usan Postgres real (sólo si TEST_POSTGRES_URL apunta a una base *_test):
verifican que cada grupo traiga las filas correctas dados fixtures fabricados, que se respete el
borrado lógico, el RBAC y que NO se mute nada.
"""

import os
import unittest
import uuid
from datetime import date, timedelta
from decimal import Decimal
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
from backend.app.models.clinical_task import ClinicalTask  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    AppointmentStatus,
    ClinicalTaskPriority,
    ClinicalTaskStatus,
    LabResultAbnormalFlag,
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


class FollowUpsPermissionUnitTest(unittest.TestCase):
    def test_permission_declared(self) -> None:
        self.assertIn("follow_ups:read", declared_permissions())


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class FollowUpsRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        now = utc_now()
        cls.actor_id = uuid.uuid4()
        cls.doctor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        # Ids esperados en cada grupo (para asertar exactamente).
        cls.task_overdue_id = uuid.uuid4()
        cls.task_future_id = uuid.uuid4()
        cls.task_nodue_id = uuid.uuid4()
        cls.appt_no_show_id = uuid.uuid4()
        cls.appt_cancelled_id = uuid.uuid4()
        cls.lab_high_id = uuid.uuid4()
        cls.lab_critical_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Médico", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Doctor(id=cls.doctor_id, user_id=cls.actor_id,
                               professional_name="Dra. House",
                               professional_license_number=f"LIC-{cls.doctor_id}"))
            session.add(Patient(id=cls.patient_id, full_name="Paciente Seguimiento",
                                birth_date=date(1980, 1, 1), sex=Sex.MALE))
            session.flush()

            # --- Tareas clínicas ---
            def task(tid, status, priority, due_at, deleted=False, title="T"):
                return ClinicalTask(
                    id=tid, owner_id=cls.actor_id, patient_id=cls.patient_id, title=title,
                    status=status, priority=priority, due_at=due_at,
                    deleted_at=(now if deleted else None))

            session.add(task(cls.task_overdue_id, ClinicalTaskStatus.OPEN,
                             ClinicalTaskPriority.HIGH, now - timedelta(days=2),
                             title="Vencida alta"))
            session.add(task(cls.task_future_id, ClinicalTaskStatus.OPEN,
                             ClinicalTaskPriority.LOW, now + timedelta(days=5),
                             title="Abierta futura"))
            session.add(task(cls.task_nodue_id, ClinicalTaskStatus.OPEN,
                             ClinicalTaskPriority.MEDIUM, None, title="Abierta sin vencimiento"))
            # Excluidas: hecha, cancelada, y abierta pero eliminada lógicamente.
            session.add(task(uuid.uuid4(), ClinicalTaskStatus.DONE,
                             ClinicalTaskPriority.HIGH, now - timedelta(days=1)))
            session.add(task(uuid.uuid4(), ClinicalTaskStatus.CANCELLED,
                             ClinicalTaskPriority.HIGH, now - timedelta(days=1)))
            session.add(task(uuid.uuid4(), ClinicalTaskStatus.OPEN,
                             ClinicalTaskPriority.HIGH, now - timedelta(days=1), deleted=True))

            # --- Citas ---
            def appt(aid, status, when, deleted=False):
                return Appointment(
                    id=aid, patient_id=cls.patient_id, doctor_id=cls.doctor_id,
                    scheduled_date=when.date(), scheduled_time=when.time(), duration_minutes=30,
                    reason="Control", status=status, deleted_at=(now if deleted else None))

            session.add(appt(cls.appt_no_show_id, AppointmentStatus.NO_SHOW,
                             now - timedelta(days=3)))
            session.add(appt(cls.appt_cancelled_id, AppointmentStatus.CANCELLED,
                             now - timedelta(days=1)))
            # Excluidas: atendida; no_show fuera de la ventana (90 días); no_show eliminada.
            session.add(appt(uuid.uuid4(), AppointmentStatus.ATTENDED, now - timedelta(days=2)))
            session.add(appt(uuid.uuid4(), AppointmentStatus.NO_SHOW, now - timedelta(days=90)))
            session.add(appt(uuid.uuid4(), AppointmentStatus.NO_SHOW,
                             now - timedelta(days=4), deleted=True))

            # --- Resultados de laboratorio ---
            def lab(lid, flag, reviewed, deleted=False):
                return LabResult(
                    id=lid, patient_id=cls.patient_id, analyte_name="Potasio",
                    value_numeric=Decimal("6.5"), unit="mmol/L",
                    abnormal_flag=flag, measured_at=now - timedelta(days=1),
                    reviewed_at=(now if reviewed else None),
                    deleted_at=(now if deleted else None))

            session.add(lab(cls.lab_high_id, LabResultAbnormalFlag.HIGH, reviewed=False))
            session.add(lab(cls.lab_critical_id, LabResultAbnormalFlag.CRITICAL, reviewed=False))
            # Excluidas: normal sin revisar; alto YA revisado; unknown sin revisar; alto eliminado.
            session.add(lab(uuid.uuid4(), LabResultAbnormalFlag.NORMAL, reviewed=False))
            session.add(lab(uuid.uuid4(), LabResultAbnormalFlag.HIGH, reviewed=True))
            session.add(lab(uuid.uuid4(), LabResultAbnormalFlag.UNKNOWN, reviewed=False))
            session.add(lab(uuid.uuid4(), LabResultAbnormalFlag.HIGH, reviewed=False,
                            deleted=True))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(ClinicalTask))
            session.execute(delete(Appointment))
            session.execute(delete(LabResult))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            session.execute(delete(User))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("follow_ups:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def _summary(self):  # type: ignore[no-untyped-def]
        return self.client.get("/api/v1/follow-ups/summary")

    def test_pending_tasks_bucket(self) -> None:
        body = self._summary().json()
        ids = {t["task_id"] for t in body["pending_tasks"]}
        self.assertEqual(
            ids, {str(self.task_overdue_id), str(self.task_future_id), str(self.task_nodue_id)}
        )
        self.assertEqual(body["pending_tasks_count"], 3)
        by_id = {t["task_id"]: t for t in body["pending_tasks"]}
        # La vencida está marcada overdue; la futura no.
        self.assertTrue(by_id[str(self.task_overdue_id)]["overdue"])
        self.assertFalse(by_id[str(self.task_future_id)]["overdue"])
        self.assertFalse(by_id[str(self.task_nodue_id)]["overdue"])
        # Orden por prioridad: la de prioridad alta va primero.
        self.assertEqual(body["pending_tasks"][0]["task_id"], str(self.task_overdue_id))
        # Cita el paciente.
        self.assertEqual(by_id[str(self.task_overdue_id)]["patient_label"], "Paciente Seguimiento")

    def test_missed_appointments_bucket(self) -> None:
        body = self._summary().json()
        ids = {a["appointment_id"] for a in body["missed_appointments"]}
        self.assertEqual(ids, {str(self.appt_no_show_id), str(self.appt_cancelled_id)})
        self.assertEqual(body["missed_appointments_count"], 2)
        statuses = {a["status"] for a in body["missed_appointments"]}
        self.assertEqual(statuses, {"no_show", "cancelled"})

    def test_unreviewed_abnormal_labs_bucket(self) -> None:
        body = self._summary().json()
        ids = {labr["lab_result_id"] for labr in body["unreviewed_abnormal_labs"]}
        self.assertEqual(ids, {str(self.lab_high_id), str(self.lab_critical_id)})
        self.assertEqual(body["unreviewed_abnormal_labs_count"], 2)
        flags = {labr["abnormal_flag"] for labr in body["unreviewed_abnormal_labs"]}
        self.assertEqual(flags, {"high", "critical"})

    def test_lookback_window_excludes_old_and_includes_recent(self) -> None:
        # Ventana de 2 días: la no_show de hace 3 días queda fuera; la cancelada de hace 1 sí.
        body = self.client.get("/api/v1/follow-ups/summary?appointment_lookback_days=2").json()
        ids = {a["appointment_id"] for a in body["missed_appointments"]}
        self.assertEqual(ids, {str(self.appt_cancelled_id)})
        self.assertEqual(body["appointment_lookback_days"], 2)

    def test_lookback_out_of_range_rejected(self) -> None:
        self.assertEqual(
            self.client.get("/api/v1/follow-ups/summary?appointment_lookback_days=0").status_code,
            422,
        )

    def test_requires_follow_ups_read_permission(self) -> None:
        self._as("consultations:read")
        self.assertEqual(self._summary().status_code, 403)

    def test_summary_does_not_mutate(self) -> None:
        self._summary().raise_for_status()
        with Session(self.engine) as session:
            task = session.get(ClinicalTask, self.task_overdue_id)
            assert task is not None
            self.assertEqual(task.status, ClinicalTaskStatus.OPEN)
            self.assertIsNone(task.updated_at)
            lab = session.get(LabResult, self.lab_high_id)
            assert lab is not None
            self.assertIsNone(lab.reviewed_at)  # la verificación no "revisa" el lab
            self.assertIsNone(lab.updated_at)


if __name__ == "__main__":
    unittest.main()
