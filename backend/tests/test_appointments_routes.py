"""Tests de integración del módulo Appointments (agenda y citas).

Requieren PostgreSQL real: dependen de la restricción de exclusión GiST que impide
traslapes (``btree_gist``), de los bloqueos ``FOR UPDATE`` y de las FK/CHECK que
SQLite no representa fielmente. Se ejecutan sólo si ``TEST_POSTGRES_URL`` apunta a
una base cuyo nombre termina en ``_test``.

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://medicopilot:medicopilot@localhost:5432/medicopilot_test" \
        python -m unittest backend.tests.test_appointments_routes
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
from backend.app.models.appointment import Appointment  # noqa: E402
from backend.app.models.consultation import Consultation  # noqa: E402
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    AppointmentStatus,
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
    "appointments:read",
    "appointments:create",
    "appointments:update",
    "appointments:delete",
)
_BASE = "/api/v1/appointments"
_CONSULTATIONS = "/api/v1/consultations"


class AppointmentsCatalogTest(unittest.TestCase):
    """No requiere base de datos: valida que los cuatro permisos estén declarados.

    El administrador fundacional recibe en bootstrap todos los permisos declarados,
    de modo que estos cuatro quedan cubiertos."""

    def test_four_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in ALL_PERMS:
            self.assertIn(permission, declared)


class _AppointmentTestMixin(unittest.TestCase):
    """Seeding y helpers compartidos por las suites de citas e integración.

    Hereda de ``TestCase`` para reutilizar sus aserciones, pero no declara métodos
    ``test_``: el cargador no genera casos a partir de ella."""

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

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(Consultation))
            session.execute(delete(Appointment))
            session.execute(delete(Doctor))
            session.execute(delete(Patient))
            session.execute(delete(User).where(User.id != self.actor_id))
            session.commit()

    # --- sesión / seeding ---

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

    def _seed_patient(self, *, status: PatientStatus = PatientStatus.ACTIVE,
                      deleted: bool = False) -> uuid.UUID:
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

    def _seed_doctor(self, user_id: uuid.UUID, *, status: RecordStatus = RecordStatus.ACTIVE,
                     deleted: bool = False) -> uuid.UUID:
        doctor_id = uuid.uuid4()
        with Session(self.engine) as session:
            doctor = Doctor(
                id=doctor_id,
                user_id=user_id,
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

    def _seed_user(self) -> uuid.UUID:
        user_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                User(
                    id=user_id,
                    name="Otro",
                    last_name="User",
                    email=f"user-{user_id}@example.com",
                    hashed_password="x",
                    is_active=True,
                )
            )
            session.commit()
        return user_id

    # --- helpers de cita ---

    @staticmethod
    def _at(hour: int, minute: int = 0) -> str:
        return f"2026-07-01T{hour:02d}:{minute:02d}:00"

    def _payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "doctor_id": str(self.doctor_id),
            "scheduled_at": self._at(10),
            "duration_minutes": 30,
            "reason": "Consulta general",
        }
        payload.update(overrides)
        return payload

    def _create(self, **overrides: object):
        return self.client.post(_BASE, json=self._payload(**overrides))

    def _create_id(self, **overrides: object) -> str:
        response = self._create(**overrides)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def _confirm(self, appointment_id: str):
        return self.client.post(f"{_BASE}/{appointment_id}/confirm", json={})

    def _cancel(self, appointment_id: str, reason: str | None = None):
        body = {"reason": reason} if reason is not None else {}
        return self.client.post(f"{_BASE}/{appointment_id}/cancel", json=body)

    def _no_show(self, appointment_id: str):
        return self.client.post(f"{_BASE}/{appointment_id}/no-show", json={})

    def _reschedule(self, appointment_id: str, **body: object):
        return self.client.post(f"{_BASE}/{appointment_id}/reschedule", json=body)

    # --- fábricas de estados terminales (compartidas) ---

    def _appointment_row(self, *, hour: int, minute: int = 0,
                         status: AppointmentStatus = AppointmentStatus.PENDING) -> Appointment:
        from datetime import datetime

        return Appointment(
            patient_id=self.patient_id,
            doctor_id=self.doctor_id,
            scheduled_at=datetime(2026, 7, 1, hour, minute, 0),
            duration_minutes=30,
            reason="Directo",
            status=status,
            created_by=self.actor_id,
            updated_by=self.actor_id,
        )

    def _cancelled(self) -> str:
        appointment_id = self._create_id(scheduled_at=self._at(8))
        self.assertEqual(self._cancel(appointment_id).status_code, 200)
        return appointment_id

    def _no_show_appt(self) -> str:
        appointment_id = self._create_id(scheduled_at=self._at(16))
        self.assertEqual(self._no_show(appointment_id).status_code, 200)
        return appointment_id

    def _rescheduled_original(self) -> str:
        appointment_id = self._create_id(scheduled_at=self._at(17))
        self.assertEqual(
            self._reschedule(appointment_id, scheduled_at=self._at(18)).status_code, 201
        )
        return appointment_id

    def _attended(self) -> str:
        """Cita atendida: se vuelve attended al crear una consulta ligada."""
        appointment_id = self._create_id(scheduled_at=self._at(7))
        self._as(*ALL_PERMS, "consultations:create")
        response = self.client.post(
            _CONSULTATIONS,
            json={
                "patient_id": str(self.patient_id),
                "attending_doctor_id": str(self.doctor_id),
                "appointment_id": appointment_id,
                "reason_for_visit": "Atención",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        self._as(*ALL_PERMS)
        return appointment_id


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class AppointmentRoutesTest(_AppointmentTestMixin, unittest.TestCase):
    # --- creación / validación ---

    def test_create_pending(self) -> None:
        body = self._create().json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(body["duration_minutes"], 30)
        self.assertIsNone(body["rescheduled_from_id"])

    def test_status_not_accepted_as_input(self) -> None:
        self.assertEqual(self._create(status="confirmed").status_code, 422)

    def test_create_rejects_missing_patient(self) -> None:
        self.assertEqual(self._create(patient_id=str(uuid.uuid4())).status_code, 404)

    def test_create_rejects_deleted_patient(self) -> None:
        deleted = self._seed_patient(deleted=True)
        self.assertEqual(self._create(patient_id=str(deleted)).status_code, 404)

    def test_create_rejects_inactive_or_archived_patient(self) -> None:
        inactive = self._seed_patient(status=PatientStatus.INACTIVE)
        self.assertEqual(self._create(patient_id=str(inactive)).status_code, 409)
        archived = self._seed_patient(status=PatientStatus.ARCHIVED)
        self.assertEqual(self._create(patient_id=str(archived)).status_code, 409)

    def test_create_rejects_missing_doctor(self) -> None:
        self.assertEqual(self._create(doctor_id=str(uuid.uuid4())).status_code, 404)

    def test_create_rejects_deleted_doctor(self) -> None:
        deleted = self._seed_doctor(self._seed_user(), deleted=True)
        self.assertEqual(self._create(doctor_id=str(deleted)).status_code, 404)

    def test_create_rejects_inactive_or_suspended_doctor(self) -> None:
        inactive = self._seed_doctor(self._seed_user(), status=RecordStatus.INACTIVE)
        self.assertEqual(self._create(doctor_id=str(inactive)).status_code, 409)
        suspended = self._seed_doctor(self._seed_user(), status=RecordStatus.SUSPENDED)
        self.assertEqual(self._create(doctor_id=str(suspended)).status_code, 409)

    def test_reason_blank_rejected(self) -> None:
        self.assertEqual(self._create(reason="").status_code, 422)
        self.assertEqual(self._create(reason="   ").status_code, 422)

    def test_duration_out_of_range_rejected(self) -> None:
        self.assertEqual(self._create(duration_minutes=4).status_code, 422)
        self.assertEqual(self._create(duration_minutes=481).status_code, 422)
        self.assertEqual(self._create(duration_minutes=5).status_code, 201)

    # --- lectura / query ---

    def test_list_get_and_filter(self) -> None:
        keep = self._create_id()
        other_patient = self._seed_patient()
        self._create(patient_id=str(other_patient), scheduled_at=self._at(12))
        by_patient = self.client.get(_BASE, params={"patient_id": str(self.patient_id)}).json()
        self.assertEqual(by_patient["pagination"]["total"], 1)
        self.assertEqual(by_patient["items"][0]["id"], keep)
        self.assertNotIn("internal_notes", by_patient["items"][0])
        by_doctor = self.client.get(_BASE, params={"doctor_id": str(self.doctor_id)}).json()
        self.assertEqual(by_doctor["pagination"]["total"], 2)
        got = self.client.get(f"{_BASE}/{keep}")
        self.assertEqual(got.status_code, 200)

    def test_filter_by_status(self) -> None:
        a = self._create_id()
        self._create(scheduled_at=self._at(12))
        self.assertEqual(self._confirm(a).status_code, 200)
        confirmed = self.client.get(_BASE, params={"status": "confirmed"}).json()
        self.assertEqual(confirmed["pagination"]["total"], 1)

    def test_scheduled_at_range_filters(self) -> None:
        self._create_id(scheduled_at=self._at(9))
        self._create_id(scheduled_at=self._at(15))
        on = self.client.get(_BASE, params={"scheduled_at_on": "2026-07-01"}).json()
        self.assertEqual(on["pagination"]["total"], 2)
        before = self.client.get(_BASE, params={"scheduled_at_before": "2026-07-01"}).json()
        self.assertEqual(before["pagination"]["total"], 0)
        after = self.client.get(_BASE, params={"scheduled_at_after": "2026-07-02"}).json()
        self.assertEqual(after["pagination"]["total"], 0)
        between = self.client.get(
            _BASE, params={"scheduled_at_from": "2026-07-01", "scheduled_at_to": "2026-07-01"}
        ).json()
        self.assertEqual(between["pagination"]["total"], 2)

    def test_search_only_reason(self) -> None:
        self._create_id(reason="Revisión de presión", internal_notes="ZZZSECRET")
        by_reason = self.client.get(_BASE, params={"q": "presión"}).json()
        self.assertEqual(by_reason["pagination"]["total"], 1)
        by_notes = self.client.get(_BASE, params={"q": "ZZZSECRET"}).json()
        self.assertEqual(by_notes["pagination"]["total"], 0)

    # --- edición ---

    def test_patch_pending_and_confirmed(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(
            self.client.patch(f"{_BASE}/{appointment_id}", json={"reason": "Otro"}).status_code,
            200,
        )
        self.assertEqual(self._confirm(appointment_id).status_code, 200)
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{appointment_id}", json={"duration_minutes": 45}
            ).status_code,
            200,
        )

    def test_patch_rejects_protected_fields(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{appointment_id}", json={"patient_id": str(uuid.uuid4())}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{appointment_id}", json={"status": "confirmed"}
            ).status_code,
            422,
        )

    def test_patch_blocked_on_terminal_states(self) -> None:
        for terminal in (self._cancelled(), self._no_show_appt(), self._rescheduled_original(),
                         self._attended()):
            self.assertEqual(
                self.client.patch(f"{_BASE}/{terminal}", json={"reason": "x"}).status_code,
                409,
            )

    def test_patch_change_doctor_validates_active(self) -> None:
        appointment_id = self._create_id()
        inactive = self._seed_doctor(self._seed_user(), status=RecordStatus.INACTIVE)
        self.assertEqual(
            self.client.patch(
                f"{_BASE}/{appointment_id}", json={"doctor_id": str(inactive)}
            ).status_code,
            409,
        )

    # --- transiciones ---

    def test_confirm_only_from_pending(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(self._confirm(appointment_id).status_code, 200)
        # ya confirmada -> 409
        self.assertEqual(self._confirm(appointment_id).status_code, 409)

    def test_confirm_and_no_show_accept_empty_body(self) -> None:
        # Las acciones POST sin parámetros aceptan un cuerpo vacío {} (el cliente
        # capability-driven envía request.fixed_body={}): nunca 422 por falta de body.
        pending = self._create_id()
        confirmed = self.client.post(f"{_BASE}/{pending}/confirm", json={})
        self.assertNotEqual(confirmed.status_code, 422, confirmed.text)
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        self.assertEqual(confirmed.json()["status"], "confirmed")

        other = self._create_id(scheduled_at=self._at(13))
        no_show = self.client.post(f"{_BASE}/{other}/no-show", json={})
        self.assertNotEqual(no_show.status_code, 422, no_show.text)
        self.assertEqual(no_show.status_code, 200, no_show.text)
        self.assertEqual(no_show.json()["status"], "no_show")

    def test_cancel_pending_or_confirmed(self) -> None:
        a = self._create_id()
        self.assertEqual(self._cancel(a).status_code, 200)
        b = self._create_id(scheduled_at=self._at(12))
        self.assertEqual(self._confirm(b).status_code, 200)
        response = self._cancel(b, reason="Paciente lo solicitó")
        self.assertEqual(response.status_code, 200)
        # El motivo se conserva en internal_notes.
        self.assertIn("Paciente lo solicitó", response.json()["internal_notes"])

    def test_cancel_blank_reason_rejected(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(self._cancel(appointment_id, reason="   ").status_code, 422)

    def test_no_show_from_pending_or_confirmed(self) -> None:
        a = self._create_id()
        self.assertEqual(self._no_show(a).status_code, 200)
        b = self._create_id(scheduled_at=self._at(12))
        self.assertEqual(self._confirm(b).status_code, 200)
        self.assertEqual(self._no_show(b).status_code, 200)

    def test_transitions_rejected_from_terminal(self) -> None:
        cancelled = self._cancelled()
        self.assertEqual(self._confirm(cancelled).status_code, 409)
        self.assertEqual(self._cancel(cancelled).status_code, 409)
        self.assertEqual(self._no_show(cancelled).status_code, 409)

    # --- reprogramación ---

    def test_reschedule_creates_new_and_marks_original(self) -> None:
        original = self._create_id()
        response = self._reschedule(original, scheduled_at=self._at(13))
        self.assertEqual(response.status_code, 201, response.text)
        new_appt = response.json()
        self.assertEqual(new_appt["status"], "pending")
        self.assertEqual(new_appt["rescheduled_from_id"], original)
        self.assertEqual(new_appt["patient_id"], str(self.patient_id))
        # Hereda los campos no enviados (motivo, duración, médico).
        self.assertEqual(new_appt["reason"], "Consulta general")
        self.assertEqual(new_appt["duration_minutes"], 30)
        # La original queda reprogramada.
        self.assertEqual(
            self.client.get(f"{_BASE}/{original}").json()["status"], "rescheduled"
        )

    def test_reschedule_rejected_from_terminal(self) -> None:
        cancelled = self._cancelled()
        self.assertEqual(self._reschedule(cancelled, scheduled_at=self._at(13)).status_code, 409)

    def test_reschedule_overlap_leaves_original_unchanged(self) -> None:
        original = self._create_id(scheduled_at=self._at(10))
        # Otra cita activa a las 13:00 ocupa el horario destino.
        self._create_id(scheduled_at=self._at(13))
        response = self._reschedule(original, scheduled_at=self._at(13))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            self.client.get(f"{_BASE}/{original}").json()["status"], "pending"
        )

    # --- soft-delete ---

    def test_delete_only_pending(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 200)
        self.assertEqual(self.client.get(f"{_BASE}/{appointment_id}").status_code, 404)
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 404)
        self.assertEqual(self.client.get(_BASE).json()["pagination"]["total"], 0)

    def test_delete_blocked_on_confirmed_and_terminal(self) -> None:
        confirmed = self._create_id()
        self.assertEqual(self._confirm(confirmed).status_code, 200)
        self.assertEqual(self.client.delete(f"{_BASE}/{confirmed}").status_code, 409)
        self.assertEqual(self.client.delete(f"{_BASE}/{self._cancelled()}").status_code, 409)

    # --- agenda sin traslapes ---

    def test_overlap_same_doctor_rejected(self) -> None:
        self._create_id(scheduled_at=self._at(10), duration_minutes=30)
        # 10:15-10:45 se solapa con 10:00-10:30.
        self.assertEqual(
            self._create(scheduled_at=self._at(10, 15), duration_minutes=30).status_code, 409
        )

    def test_adjacent_slots_allowed(self) -> None:
        self._create_id(scheduled_at=self._at(10), duration_minutes=30)
        # 10:30-11:00 es adyacente ('[)'), no se solapa.
        self.assertEqual(
            self._create(scheduled_at=self._at(10, 30), duration_minutes=30).status_code, 201
        )

    def test_non_active_states_free_the_slot(self) -> None:
        a = self._create_id(scheduled_at=self._at(10), duration_minutes=30)
        self.assertEqual(self._cancel(a).status_code, 200)
        # Cancelada no bloquea: el horario vuelve a estar libre.
        self.assertEqual(
            self._create(scheduled_at=self._at(10), duration_minutes=30).status_code, 201
        )

    def test_overlap_different_doctors_allowed(self) -> None:
        self._create_id(scheduled_at=self._at(10), duration_minutes=30)
        other_doctor = self._seed_doctor(self._seed_user())
        self.assertEqual(
            self._create(
                doctor_id=str(other_doctor), scheduled_at=self._at(10), duration_minutes=30
            ).status_code,
            201,
        )

    def test_db_exclusion_blocks_overlap_directly(self) -> None:
        # La restricción de base de datos bloquea el traslape aun insertando por ORM,
        # sin pasar por la validación de la aplicación.
        with Session(self.engine) as session:
            session.add(self._appointment_row(hour=10))
            session.commit()
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.add(self._appointment_row(hour=10, minute=15))
                session.commit()

    # --- RBAC ---

    def test_rbac_enforced_per_operation(self) -> None:
        appointment_id = self._create_id()

        self._as("appointments:create")  # sin read
        self.assertEqual(self.client.get(_BASE).status_code, 403)

        self._as("appointments:read")  # sólo lectura
        self.assertEqual(self._create().status_code, 403)
        self.assertEqual(
            self.client.patch(f"{_BASE}/{appointment_id}", json={"reason": "x"}).status_code,
            403,
        )
        self.assertEqual(self._confirm(appointment_id).status_code, 403)
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 403)

@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ConsultationAppointmentIntegrationTest(_AppointmentTestMixin, unittest.TestCase):
    """Integración consulta ↔ cita vía ``consultations.appointment_id``."""

    def setUp(self) -> None:
        super().setUp()
        self._as(*ALL_PERMS, "consultations:create", "consultations:read", "consultations:update")

    def _consultation_payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "patient_id": str(self.patient_id),
            "attending_doctor_id": str(self.doctor_id),
            "reason_for_visit": "Atención",
        }
        payload.update(overrides)
        return payload

    def _create_consultation(self, **overrides: object):
        return self.client.post(_CONSULTATIONS, json=self._consultation_payload(**overrides))

    def test_consultation_without_appointment_unchanged(self) -> None:
        response = self._create_consultation()
        self.assertEqual(response.status_code, 201, response.text)
        self.assertIsNone(response.json()["appointment_id"])

    def test_consultation_with_appointment_marks_attended(self) -> None:
        appointment_id = self._create_id()
        response = self._create_consultation(appointment_id=appointment_id)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["appointment_id"], appointment_id)
        self.assertEqual(
            self.client.get(f"{_BASE}/{appointment_id}").json()["status"], "attended"
        )

    def test_consultation_with_confirmed_appointment(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(self._confirm(appointment_id).status_code, 200)
        response = self._create_consultation(appointment_id=appointment_id)
        self.assertEqual(response.status_code, 201, response.text)

    def test_reject_appointment_other_patient(self) -> None:
        other_patient = self._seed_patient()
        appointment_id = self._create_id(patient_id=str(other_patient), scheduled_at=self._at(12))
        # appointment.patient != consulta.patient -> 409
        response = self._create_consultation(appointment_id=appointment_id)
        self.assertEqual(response.status_code, 409)

    def test_reject_appointment_other_doctor(self) -> None:
        other_doctor = self._seed_doctor(self._seed_user())
        appointment_id = self._create_id(doctor_id=str(other_doctor), scheduled_at=self._at(12))
        response = self._create_consultation(appointment_id=appointment_id)
        self.assertEqual(response.status_code, 409)

    def test_reject_appointment_in_terminal_state(self) -> None:
        for terminal in (self._cancelled(), self._no_show_appt(), self._rescheduled_original()):
            response = self._create_consultation(appointment_id=terminal)
            self.assertEqual(response.status_code, 409, terminal)

    def test_reject_deleted_appointment(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 200)
        response = self._create_consultation(appointment_id=appointment_id)
        self.assertEqual(response.status_code, 404)

    def test_reject_second_consultation_for_same_appointment(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(
            self._create_consultation(appointment_id=appointment_id).status_code, 201
        )
        # La cita ya está attended -> 409 (respaldado por la unicidad del appointment_id).
        self.assertEqual(
            self._create_consultation(appointment_id=appointment_id).status_code, 409
        )

    def test_appointment_id_immutable_via_patch(self) -> None:
        appointment_id = self._create_id()
        consultation = self._create_consultation().json()
        response = self.client.patch(
            f"{_CONSULTATIONS}/{consultation['id']}",
            json={"appointment_id": appointment_id},
        )
        self.assertEqual(response.status_code, 422)

    def test_attended_appointment_is_frozen(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(
            self._create_consultation(appointment_id=appointment_id).status_code, 201
        )
        self.assertEqual(
            self.client.patch(f"{_BASE}/{appointment_id}", json={"reason": "x"}).status_code, 409
        )
        self.assertEqual(self._confirm(appointment_id).status_code, 409)
        self.assertEqual(self._cancel(appointment_id).status_code, 409)
        self.assertEqual(self._no_show(appointment_id).status_code, 409)
        self.assertEqual(
            self._reschedule(appointment_id, scheduled_at=self._at(13)).status_code, 409
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 409)

    def test_db_unique_appointment_id(self) -> None:
        appointment_id = self._create_id()
        self.assertEqual(
            self._create_consultation(appointment_id=appointment_id).status_code, 201
        )
        # Inserción directa de una segunda consulta para la misma cita viola la unicidad.
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.execute(
                    text(
                        "INSERT INTO consultations"
                        " (id, patient_id, attending_doctor_id, appointment_id,"
                        " consulted_at, reason_for_visit, status, created_at)"
                        " VALUES (:id, :pid, :did, :aid, now(), 'x', 'draft', now())"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "pid": str(self.patient_id),
                        "did": str(self.doctor_id),
                        "aid": appointment_id,
                    },
                )
                session.commit()


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class AppointmentForbiddenTransitionsTest(_AppointmentTestMixin, unittest.TestCase):
    """Transiciones PROHIBIDAS desde estados terminales aún no cubiertas y guard de
    permiso de las acciones de transición.

    Máquina: pending → confirmed → attended/cancelled/no_show/rescheduled. Los
    estados ``no_show`` y ``rescheduled`` son terminales. ``AppointmentRoutesTest`` ya
    cubre el rechazo de transiciones desde ``cancelled`` y desde ``attended``
    (frozen), y el patch desde todos los terminales; aquí se completan ``no_show`` y
    ``rescheduled`` como ORIGEN de cada transición, y el guard de permiso de
    cancel/no_show/reschedule. Cada test re-LEE el recurso para verificar que el
    estado no mutó.

    Nota de dominio: ``no_show`` se permite desde ``pending`` o ``confirmed`` (el
    backend es la autoridad; el ``visible_when`` de UI sólo lo muestra en
    ``confirmed``), por lo que NO se prueba no_show-desde-pending como prohibido.
    """

    def _status(self, appointment_id: str) -> str:
        response = self.client.get(f"{_BASE}/{appointment_id}")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["status"]

    def test_no_show_terminal_rejects_transitions_state_unchanged(self) -> None:
        appointment_id = self._no_show_appt()  # estado terminal no_show
        self.assertEqual(self._confirm(appointment_id).status_code, 409)
        self.assertEqual(self._cancel(appointment_id).status_code, 409)
        self.assertEqual(
            self._reschedule(appointment_id, scheduled_at=self._at(19)).status_code, 409
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{appointment_id}").status_code, 409)
        self.assertEqual(self._status(appointment_id), "no_show")

    def test_rescheduled_terminal_rejects_transitions_state_unchanged(self) -> None:
        original = self._rescheduled_original()  # estado terminal rescheduled
        self.assertEqual(self._confirm(original).status_code, 409)
        self.assertEqual(self._cancel(original).status_code, 409)
        self.assertEqual(self._no_show(original).status_code, 409)
        self.assertEqual(
            self._reschedule(original, scheduled_at=self._at(19)).status_code, 409
        )
        self.assertEqual(self.client.delete(f"{_BASE}/{original}").status_code, 409)
        self.assertEqual(self._status(original), "rescheduled")

    def test_cancel_no_show_reschedule_require_update_permission(self) -> None:
        # cancel/no_show/reschedule usan AppointmentPermissions.UPDATE; sin ese
        # permiso deben dar 403 (el RBAC existente sólo cubría confirm).
        appointment_id = self._create_id()
        self._as("appointments:read")  # sin update
        self.assertEqual(self._cancel(appointment_id).status_code, 403)
        self.assertEqual(self._no_show(appointment_id).status_code, 403)
        self.assertEqual(
            self._reschedule(appointment_id, scheduled_at=self._at(13)).status_code, 403
        )
        self._as(*ALL_PERMS)
        self.assertEqual(self._status(appointment_id), "pending")


if __name__ == "__main__":
    unittest.main()
