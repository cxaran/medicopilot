"""Tests de respaldos cifrados hacia Google Drive.

Unitarios PUROS: cálculo del próximo horario (zona IANA, cruce de día y DST),
plan de retención diaria/mensual/anual (nunca poda copias protegidas), backoff de
reintentos, validación de prefijo y nombre de archivo fijo.

Con PostgreSQL (TEST_POSTGRES_URL hacia una base *_test): API del singleton
(lectura/edición/validaciones/RBAC), acciones (connect sin OAuth configurado,
run_now sin configuración completa, callback con state inválido) y el ciclo del
tick (claim con lease, recuperación de lease vencido, reintento con backoff,
needs_reauth detiene y deja la alerta persistente). El ejecutor real
(pg_dump/age/Drive) se sustituye en esos tests: aquí se prueba la MÁQUINA de
estados, no Google.
"""

import os
import unittest
import uuid
from datetime import datetime, time, timedelta
from unittest import mock
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
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.backup import BackupOauthState, BackupRun, BackupSettings  # noqa: E402
from backend.app.models.enums import (  # noqa: E402
    BackupDriveStatus,
    BackupRunStatus,
    BackupTriggerKind,
)
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services import backup_service as backups  # noqa: E402
from backend.app.services.backup_service import (  # noqa: E402
    BackupService,
    RetentionCandidate,
    build_backup_filename,
    calculate_next_run_at,
    compute_retention_roles,
    next_retry_delay_minutes,
    plan_retention_pruning,
    validate_filename_prefix,
)

_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class NextRunAtTest(unittest.TestCase):
    # America/Monterrey es UTC-6 fijo (sin DST desde 2022): 02:00 local = 08:00 UTC.
    def test_before_daily_time_uses_today(self) -> None:
        now_utc = datetime(2026, 7, 2, 6, 0)  # 00:00 local
        result = calculate_next_run_at(now_utc, "America/Monterrey", time(2, 0))
        self.assertEqual(result, datetime(2026, 7, 2, 8, 0))

    def test_after_daily_time_uses_tomorrow(self) -> None:
        now_utc = datetime(2026, 7, 2, 9, 0)  # 03:00 local, ya pasó
        result = calculate_next_run_at(now_utc, "America/Monterrey", time(2, 0))
        self.assertEqual(result, datetime(2026, 7, 3, 8, 0))

    def test_exact_time_moves_to_tomorrow(self) -> None:
        now_utc = datetime(2026, 7, 2, 8, 0)
        result = calculate_next_run_at(now_utc, "America/Monterrey", time(2, 0))
        self.assertEqual(result, datetime(2026, 7, 3, 8, 0))

    def test_timezone_change_moves_the_utc_instant(self) -> None:
        now_utc = datetime(2026, 7, 2, 0, 0)
        monterrey = calculate_next_run_at(now_utc, "America/Monterrey", time(2, 0))
        madrid = calculate_next_run_at(now_utc, "Europe/Madrid", time(2, 0))
        self.assertEqual(monterrey, datetime(2026, 7, 2, 8, 0))
        # Madrid (CEST, UTC+2) 02:00 de hoy ya pasó a las 00:00Z -> mañana 00:00Z.
        self.assertEqual(madrid, datetime(2026, 7, 3, 0, 0))

    def test_local_date_crosses_utc_midnight(self) -> None:
        # 23:30 local con respaldo a las 23:45: el instante UTC cae al día siguiente.
        now_utc = datetime(2026, 7, 3, 5, 30)  # 23:30 del 2 de julio en Monterrey
        result = calculate_next_run_at(now_utc, "America/Monterrey", time(23, 45))
        self.assertEqual(result, datetime(2026, 7, 3, 5, 45))

    def test_dst_spring_forward_day(self) -> None:
        # Nueva York, 8-mar-2026: a las 02:00 el reloj salta a las 03:00 (la hora
        # 02:30 NO existe). La ocurrencia se resuelve sin duplicar ni saltar el día:
        # el instante queda dentro del 8 de marzo local.
        now_utc = datetime(2026, 3, 8, 5, 0)  # 00:00 EST
        result = calculate_next_run_at(now_utc, "America/New_York", time(2, 30))
        self.assertEqual(result.date(), datetime(2026, 3, 8).date())

    def test_invalid_timezone_raises(self) -> None:
        with self.assertRaises(ValueError):
            calculate_next_run_at(datetime(2026, 7, 2), "No/Existe", time(2, 0))


class RetentionTest(unittest.TestCase):
    def _candidate(self, days_ago: int, roles: tuple[str, ...]) -> RetentionCandidate:
        return RetentionCandidate(
            run_id=uuid.uuid4(),
            finished_at=datetime(2026, 7, 2) - timedelta(days=days_ago),
            roles=roles,
        )

    def test_roles_first_of_month_and_year(self) -> None:
        self.assertEqual(
            compute_retention_roles(month_taken=False, year_taken=False),
            ["daily", "monthly", "yearly"],
        )
        self.assertEqual(
            compute_retention_roles(month_taken=True, year_taken=True), ["daily"]
        )

    def test_prunes_only_unprotected(self) -> None:
        recent = [self._candidate(i, ("daily",)) for i in range(3)]
        old_daily = self._candidate(10, ("daily",))
        old_monthly = self._candidate(40, ("daily", "monthly"))
        old_yearly = self._candidate(400, ("daily", "monthly", "yearly"))
        pruned = plan_retention_pruning(
            [*recent, old_daily, old_monthly, old_yearly],
            daily_count=3,
            monthly_count=12,
            yearly_count=5,
        )
        # Sólo el daily viejo sin roles protegidos se poda.
        self.assertEqual(pruned, [old_daily.run_id])

    def test_monthly_quota_exceeded_prunes_oldest_monthly(self) -> None:
        monthlies = [self._candidate(30 * i, ("daily", "monthly")) for i in range(4)]
        pruned = plan_retention_pruning(
            monthlies, daily_count=1, monthly_count=2, yearly_count=0
        )
        # El más reciente queda por daily+monthly, el segundo por monthly; los dos
        # más viejos no tienen protección restante.
        self.assertEqual(
            set(pruned), {monthlies[2].run_id, monthlies[3].run_id}
        )

    def test_zero_counts_prune_everything(self) -> None:
        items = [self._candidate(i, ("daily",)) for i in range(2)]
        pruned = plan_retention_pruning(items, daily_count=0, monthly_count=0, yearly_count=0)
        self.assertEqual(len(pruned), 2)


class RetryPolicyTest(unittest.TestCase):
    def test_backoff_progression(self) -> None:
        self.assertEqual(next_retry_delay_minutes(1, 3), 5)
        self.assertEqual(next_retry_delay_minutes(2, 3), 30)
        self.assertIsNone(next_retry_delay_minutes(3, 3))  # agotado -> failed


class FilenameTest(unittest.TestCase):
    def test_valid_prefixes(self) -> None:
        for prefix in ("medicopilot", "mp-01", "A_b-2"):
            validate_filename_prefix(prefix)

    def test_invalid_prefixes(self) -> None:
        for prefix in ("m", "-inicia-mal", "con espacio", "ruta/mal", "con.punto", "a" * 49):
            with self.assertRaises(ValueError, msg=prefix):
                validate_filename_prefix(prefix)

    def test_filename_shape(self) -> None:
        run_id = uuid.UUID("91d4b3e2-0000-0000-0000-000000000000")
        name = build_backup_filename("medicopilot", datetime(2026, 7, 2, 8, 0), run_id)
        self.assertEqual(name, "medicopilot-20260702T080000Z-91d4b3e2.tar.age")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class BackupApiAndTickTest(unittest.TestCase):
    """API + máquina de estados del tick contra PostgreSQL real (sin Google)."""

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
                    last_name="Backups",
                    email=f"a-{cls.actor_id}@example.com",
                    hashed_password="x",
                    is_active=True,
                )
            )
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(BackupRun))
            session.execute(delete(BackupOauthState))
            session.execute(delete(BackupSettings))
            session.execute(delete(User))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        # Fila singleton fresca por test (la migración real la siembra; aquí manual).
        with Session(self.engine) as session:
            session.execute(delete(BackupRun))
            session.execute(delete(BackupOauthState))
            session.execute(delete(BackupSettings))
            session.add(
                BackupSettings(
                    timezone="America/Monterrey",
                    daily_time=time(2, 0),
                    filename_prefix="medicopilot",
                    retention_daily_count=7,
                    retention_monthly_count=12,
                    retention_yearly_count=5,
                )
            )
            session.commit()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("backups:read", "backups:configure")
        self.client = TestClient(app)
        # El servicio usa el engine del módulo: se apunta al de pruebas.
        self._engine_patch = mock.patch(
            "backend.app.services.backup_service.engine", self.engine
        )
        self._engine_patch.start()
        self._backups_enabled_patch = mock.patch.object(
            backups.settings, "backups_enabled", True
        )
        self._backups_enabled_patch.start()

    def tearDown(self) -> None:
        self._engine_patch.stop()
        self._backups_enabled_patch.stop()
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Backups",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _settings_id(self) -> str:
        return self.client.get("/api/v1/backup-settings").json()["items"][0]["id"]

    # -- API ---------------------------------------------------------------------

    def test_singleton_list_and_detail_never_expose_token(self) -> None:
        page = self.client.get("/api/v1/backup-settings")
        self.assertEqual(page.status_code, 200, page.text)
        items = page.json()["items"]
        self.assertEqual(len(items), 1)
        detail = self.client.get(f"/api/v1/backup-settings/{items[0]['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertNotIn("drive_refresh_token_ciphertext", detail.json())
        self.assertNotIn("drive_refresh_token_ciphertext", items[0])

    def test_patch_validates_and_recalculates_next_run(self) -> None:
        sid = self._settings_id()
        bad_tz = self.client.patch(
            f"/api/v1/backup-settings/{sid}", json={"timezone": "No/Existe"}
        )
        self.assertEqual(bad_tz.status_code, 422)
        bad_prefix = self.client.patch(
            f"/api/v1/backup-settings/{sid}", json={"filename_prefix": "con espacio"}
        )
        self.assertEqual(bad_prefix.status_code, 422)
        # Activar sin Drive/recipient/config -> 409 con los faltantes.
        conflict = self.client.patch(
            f"/api/v1/backup-settings/{sid}", json={"enabled": True}
        )
        self.assertEqual(conflict.status_code, 409, conflict.text)
        # Edición válida sin activar: guarda y NO programa (deshabilitado).
        ok = self.client.patch(
            f"/api/v1/backup-settings/{sid}",
            json={"daily_time": "03:30:00", "retention_daily_count": 14},
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        body = ok.json()
        self.assertEqual(body["retention_daily_count"], 14)
        self.assertIsNone(body["next_run_at"])

    def test_connect_drive_without_oauth_config_is_409(self) -> None:
        sid = self._settings_id()
        resp = self.client.post(f"/api/v1/backup-settings/{sid}/connect-drive")
        self.assertEqual(resp.status_code, 409, resp.text)

    def test_run_now_requires_complete_configuration(self) -> None:
        sid = self._settings_id()
        resp = self.client.post(f"/api/v1/backup-settings/{sid}/run-now")
        self.assertEqual(resp.status_code, 409)

    def test_oauth_callback_with_invalid_state_redirects_error(self) -> None:
        resp = self.client.get(
            "/api/v1/backups/google-drive/callback",
            params={"code": "x", "state": "invalido"},
            follow_redirects=False,
        )
        self.assertEqual(resp.status_code, 302)
        self.assertIn("drive=error", resp.headers["location"])

    def test_rbac_read_and_configure(self) -> None:
        sid = self._settings_id()
        self._as()  # sin permisos
        self.assertEqual(self.client.get("/api/v1/backup-settings").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/backup-runs").status_code, 403)
        self._as("backups:read")  # sólo lectura: configurar se rechaza
        self.assertEqual(self.client.get("/api/v1/backup-runs").status_code, 200)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/backup-settings/{sid}", json={"retention_daily_count": 3}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(f"/api/v1/backup-settings/{sid}/run-now").status_code, 403
        )

    def test_disconnect_drive_resets_connection_and_keeps_history(self) -> None:
        sid = self._settings_id()
        with Session(self.engine) as session:
            row = session.exec(select(BackupSettings)).one()
            row.drive_status = BackupDriveStatus.ACTIVE
            row.drive_refresh_token_ciphertext = "cifrado"
            row.drive_folder_id = "folder123"
            session.add(row)
            session.add(
                BackupRun(status=BackupRunStatus.SUCCEEDED, trigger_kind=BackupTriggerKind.MANUAL)
            )
            session.commit()
        resp = self.client.post(f"/api/v1/backup-settings/{sid}/disconnect-drive")
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["drive_status"], "disconnected")
        self.assertFalse(body["enabled"])
        self.assertIsNone(body["drive_folder_id"])
        runs = self.client.get("/api/v1/backup-runs").json()["items"]
        self.assertEqual(len(runs), 1)  # el historial se conserva

    # -- Máquina de estados del tick ----------------------------------------------

    def _make_run(self, **overrides: object) -> uuid.UUID:
        values: dict[str, object] = {
            "status": BackupRunStatus.QUEUED,
            "trigger_kind": BackupTriggerKind.MANUAL,
            "next_attempt_at": datetime.utcnow() - timedelta(seconds=1),
        }
        values.update(overrides)
        with Session(self.engine) as session:
            run = BackupRun(**values)  # type: ignore[arg-type]
            session.add(run)
            session.commit()
            return run.id

    def test_tick_executes_queued_run_to_success(self) -> None:
        run_id = self._make_run()
        service = BackupService(worker_id="t1")
        with mock.patch.object(service, "_execute_run") as execute:
            # El ejecutor real marca succeeded; aquí lo simula el doble.
            def fake_execute(claimed_id: uuid.UUID) -> None:
                with Session(self.engine) as session:
                    run = session.get(BackupRun, claimed_id)
                    assert run is not None
                    run.status = BackupRunStatus.SUCCEEDED
                    run.finished_at = datetime.utcnow()
                    session.add(run)
                    session.commit()

            execute.side_effect = fake_execute
            service.run_tick()
        with Session(self.engine) as session:
            run = session.get(BackupRun, run_id)
            assert run is not None
            self.assertEqual(run.status, BackupRunStatus.SUCCEEDED)
            self.assertEqual(run.attempt_count, 1)

    def test_temporary_failure_retries_with_backoff_then_fails(self) -> None:
        run_id = self._make_run()
        service = BackupService(worker_id="t1")
        with mock.patch.object(
            service,
            "_execute_run",
            side_effect=backups.BackupTemporaryError("drive_unavailable", "Drive caído."),
        ):
            service.run_tick()  # intento 1 -> retrying +5min
        with Session(self.engine) as session:
            run = session.get(BackupRun, run_id)
            assert run is not None and run.next_attempt_at is not None
            self.assertEqual(run.status, BackupRunStatus.RETRYING)
            self.assertGreater(run.next_attempt_at, datetime.utcnow() + timedelta(minutes=4))
            # Vencer el backoff para los siguientes intentos.
            run.next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
            session.add(run)
            session.commit()
        with mock.patch.object(
            service,
            "_execute_run",
            side_effect=backups.BackupTemporaryError("drive_unavailable", "Drive caído."),
        ):
            service.run_tick()  # intento 2 -> retrying +30min
            with Session(self.engine) as session:
                run = session.get(BackupRun, run_id)
                assert run is not None and run.next_attempt_at is not None
                run.next_attempt_at = datetime.utcnow() - timedelta(seconds=1)
                session.add(run)
                session.commit()
            service.run_tick()  # intento 3 -> agotado: failed + alerta persistente
        with Session(self.engine) as session:
            run = session.get(BackupRun, run_id)
            config = session.exec(select(BackupSettings)).one()
            assert run is not None
            self.assertEqual(run.status, BackupRunStatus.FAILED)
            self.assertEqual(run.attempt_count, 3)
            self.assertEqual(config.last_error_code, "drive_unavailable")

    def test_reauth_failure_stops_retries_and_flags_settings(self) -> None:
        from backend.app.services.google_drive_service import DriveReauthError

        run_id = self._make_run()
        service = BackupService(worker_id="t1")
        with mock.patch.object(
            service,
            "_execute_run",
            side_effect=DriveReauthError("drive_needs_reauth", "Reconecta Drive."),
        ):
            service.run_tick()
        with Session(self.engine) as session:
            run = session.get(BackupRun, run_id)
            config = session.exec(select(BackupSettings)).one()
            assert run is not None
            # Terminal al primer intento (sin reintentos ciegos) + settings marcados.
            self.assertEqual(run.status, BackupRunStatus.FAILED)
            self.assertEqual(config.drive_status, BackupDriveStatus.NEEDS_REAUTH)
            self.assertEqual(config.last_error_code, "drive_needs_reauth")

    def test_expired_lease_is_recovered(self) -> None:
        run_id = self._make_run(
            status=BackupRunStatus.RUNNING,
            next_attempt_at=None,
            attempt_count=1,
            lease_expires_at=datetime.utcnow() - timedelta(minutes=1),
        )
        service = BackupService(worker_id="t2")
        succeeded: list[uuid.UUID] = []

        def fake_execute(claimed_id: uuid.UUID) -> None:
            succeeded.append(claimed_id)
            with Session(self.engine) as session:
                run = session.get(BackupRun, claimed_id)
                assert run is not None
                run.status = BackupRunStatus.SUCCEEDED
                run.finished_at = datetime.utcnow()
                session.add(run)
                session.commit()

        with mock.patch.object(service, "_execute_run", side_effect=fake_execute):
            service.run_tick()
        # El lease vencido volvió a la cola y el MISMO tick lo reclamó y procesó.
        self.assertEqual(succeeded, [run_id])
        with Session(self.engine) as session:
            run = session.get(BackupRun, run_id)
            assert run is not None
            self.assertEqual(run.attempt_count, 2)

    def test_terminal_run_is_never_reclaimed(self) -> None:
        self._make_run(status=BackupRunStatus.FAILED, next_attempt_at=None)
        self._make_run(status=BackupRunStatus.SUCCEEDED, next_attempt_at=None)
        service = BackupService(worker_id="t3")
        with mock.patch.object(service, "_execute_run") as execute:
            service.run_tick()
        execute.assert_not_called()

    def test_scheduled_window_creates_one_run_and_advances(self) -> None:
        with Session(self.engine) as session:
            config = session.exec(select(BackupSettings)).one()
            config.enabled = True
            config.drive_status = BackupDriveStatus.ACTIVE
            config.next_run_at = datetime.utcnow() - timedelta(minutes=1)
            session.add(config)
            session.commit()
            previous_next = config.next_run_at
        service = BackupService(worker_id="t4")
        with mock.patch.object(service, "_execute_run"):
            service.run_tick()
        with Session(self.engine) as session:
            runs = session.exec(select(BackupRun)).all()
            config = session.exec(select(BackupSettings)).one()
            self.assertEqual(len(runs), 1)
            self.assertEqual(runs[0].trigger_kind, BackupTriggerKind.SCHEDULED)
            assert config.next_run_at is not None and previous_next is not None
            self.assertGreater(config.next_run_at, previous_next)

    def test_scheduled_window_without_active_drive_is_skipped_visibly(self) -> None:
        with Session(self.engine) as session:
            config = session.exec(select(BackupSettings)).one()
            config.enabled = True
            config.drive_status = BackupDriveStatus.NEEDS_REAUTH
            config.next_run_at = datetime.utcnow() - timedelta(minutes=1)
            session.add(config)
            session.commit()
        service = BackupService(worker_id="t5")
        service.run_tick()
        with Session(self.engine) as session:
            runs = session.exec(select(BackupRun)).all()
            config = session.exec(select(BackupSettings)).one()
            self.assertEqual(len(runs), 1)
            self.assertEqual(runs[0].status, BackupRunStatus.SKIPPED)
            assert config.next_run_at is not None
            self.assertGreater(config.next_run_at, datetime.utcnow())


if __name__ == "__main__":
    unittest.main()
