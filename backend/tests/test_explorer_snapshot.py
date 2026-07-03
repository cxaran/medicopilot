"""Tests del artefacto de EXPLORACIÓN (SQLite legible por respaldo).

Unitarios PUROS: política de exclusión (binarios y sensibles fuera; clínico legible,
JSON, arrays, UUID, fechas y enums dentro), conversión de valores y record keys.

Integración (TEST_POSTGRES_URL hacia una base *_test): esquema de prueba PROPIO
creado con SQL crudo (sin modelos actuales ni RESOURCE_REGISTRY), snapshot
PostgreSQL exportado y compartido, y verificación de que el SQLite representa el
instante del snapshot (una fila insertada o actualizada DESPUÉS de exportar no
aparece/no cambia).
"""

import json
import os
import sqlite3
import tempfile
import unittest
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
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

from backend.app.services.explorer_snapshot_service import (  # noqa: E402
    ExplorerSnapshotService,
    is_excluded_column,
    is_excluded_table,
    is_sensitive_column,
    record_key_from_pk,
    sqlite_column_name,
    sqlite_table_name,
    to_sqlite_value,
)

_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class PolicyTest(unittest.TestCase):
    def test_includes_normal_and_historic_tables(self) -> None:
        for schema, table in (
            ("public", "patients"),
            ("public", "users"),
            ("public", "consultations_legacy_2019"),
            ("public", "backup_runs"),
            ("public", "roles"),
        ):
            self.assertFalse(is_excluded_table(schema, table), f"{schema}.{table}")

    def test_excludes_system_taskiq_and_alembic(self) -> None:
        self.assertTrue(is_excluded_table("pg_catalog", "pg_class"))
        self.assertTrue(is_excluded_table("information_schema", "tables"))
        self.assertTrue(is_excluded_table("public", "alembic_version"))
        self.assertTrue(is_excluded_table("public", "taskiq_schedules"))
        self.assertTrue(is_excluded_table("public", "medicopilot_taskiq_messages"))

    def test_sensitive_columns_excluded_by_substring(self) -> None:
        for name in (
            "password_hash",
            "hashed_password",
            "refresh_token",
            "access_token",
            "client_secret",
            "api_key",
            "drive_refresh_token_ciphertext",
            "age_identity_ciphertext",
            "session_key",
            "token",
        ):
            self.assertTrue(is_sensitive_column(name), name)

    def test_readable_clinical_columns_survive(self) -> None:
        for name in ("full_name", "clinical_note", "phone", "email", "diagnosis_text"):
            self.assertFalse(is_sensitive_column(name), name)
            self.assertFalse(is_excluded_column(name, "text"), name)

    def test_binary_types_excluded(self) -> None:
        self.assertTrue(is_excluded_column("content", "bytea"))
        self.assertTrue(is_excluded_column("row_oid", "oid"))
        # JSONB, arrays, uuid, fechas y enums se conservan.
        for udt in ("jsonb", "json", "_text", "uuid", "date", "timestamp", "numeric"):
            self.assertFalse(is_excluded_column("data", udt), udt)


class ValueConversionTest(unittest.TestCase):
    def test_scalars(self) -> None:
        run_id = uuid.uuid4()
        self.assertIsNone(to_sqlite_value(None))
        self.assertEqual(to_sqlite_value(True), 1)
        self.assertEqual(to_sqlite_value(False), 0)
        self.assertEqual(to_sqlite_value(run_id), str(run_id))
        self.assertEqual(to_sqlite_value(date(2026, 7, 2)), "2026-07-02")
        self.assertEqual(to_sqlite_value(Decimal("12.50")), "12.50")

    def test_datetime_gets_utc_offset(self) -> None:
        naive = datetime(2026, 7, 2, 8, 0)
        self.assertEqual(to_sqlite_value(naive), "2026-07-02T08:00:00+00:00")
        aware = datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc)
        self.assertEqual(to_sqlite_value(aware), "2026-07-02T08:00:00+00:00")

    def test_json_and_arrays_stay_valid_json(self) -> None:
        payload = {"b": [1, 2], "a": {"nested": "sí"}}
        encoded = to_sqlite_value(payload)
        assert isinstance(encoded, str)
        self.assertEqual(json.loads(encoded), payload)
        array = to_sqlite_value(["x", "y"])
        assert isinstance(array, str)
        self.assertEqual(json.loads(array), ["x", "y"])

    def test_record_keys(self) -> None:
        pk_uuid = record_key_from_pk({"id": uuid.UUID(int=7)})
        self.assertTrue(pk_uuid)  # base64url estable
        composite = record_key_from_pk({"tenant_id": "t1", "record_number": 123})
        again = record_key_from_pk({"record_number": 123, "tenant_id": "t1"})
        self.assertEqual(composite, again)  # canónico: el orden de claves no importa

    def test_safe_identifiers(self) -> None:
        self.assertEqual(sqlite_table_name("public", "patients"), sqlite_table_name("public", "patients"))
        self.assertTrue(sqlite_table_name("public", "patients").startswith("t_"))
        self.assertEqual(sqlite_column_name(2), "c_002")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
@unittest.skipUnless(
    __import__("shutil").which("pg_dump"),
    "pg_dump no está instalado en este host (la imagen Docker sí lo trae).",
)
class ExplorerIntegrationTest(unittest.TestCase):
    """Esquema propio con SQL crudo + snapshot compartido, sin modelos actuales."""

    @classmethod
    def setUpClass(cls) -> None:
        import psycopg
        from sqlalchemy.engine import make_url

        # psycopg v3 no acepta el sufijo de driver de SQLAlchemy (+psycopg2): se
        # normaliza igual que hace el broker de Taskiq con el DSN del proyecto.
        cls.dsn = (
            make_url(_TEST_PG_URL)
            .set(drivername="postgresql")
            .render_as_string(hide_password=False)
        )
        with psycopg.connect(cls.dsn, autocommit=True) as conn:
            conn.execute("DROP TABLE IF EXISTS explorer_test_children")
            conn.execute("DROP TABLE IF EXISTS explorer_test_patients")
            conn.execute("DROP TABLE IF EXISTS explorer_test_nopk")
            conn.execute("DROP TABLE IF EXISTS taskiq_should_skip")
            conn.execute(
                """
                CREATE TABLE explorer_test_patients (
                    id uuid PRIMARY KEY,
                    full_name text NOT NULL,
                    phone text,
                    clinical_note text,
                    tags jsonb,
                    codes text[],
                    born date,
                    seen_at timestamp,
                    price numeric(10,2),
                    photo bytea,
                    password_hash text,
                    refresh_token text
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE explorer_test_children (
                    tenant_id text NOT NULL,
                    record_number integer NOT NULL,
                    patient_id uuid REFERENCES explorer_test_patients(id),
                    note text,
                    PRIMARY KEY (tenant_id, record_number)
                )
                """
            )
            conn.execute("CREATE TABLE explorer_test_nopk (label text)")
            conn.execute("CREATE TABLE taskiq_should_skip (id integer PRIMARY KEY)")

    @classmethod
    def tearDownClass(cls) -> None:
        import psycopg

        with psycopg.connect(cls.dsn, autocommit=True) as conn:
            conn.execute("DROP TABLE IF EXISTS explorer_test_children")
            conn.execute("DROP TABLE IF EXISTS explorer_test_patients")
            conn.execute("DROP TABLE IF EXISTS explorer_test_nopk")
            conn.execute("DROP TABLE IF EXISTS taskiq_should_skip")

    def setUp(self) -> None:
        import psycopg

        self.patient_id = uuid.uuid4()
        with psycopg.connect(self.dsn, autocommit=True) as conn:
            conn.execute("DELETE FROM explorer_test_children")
            conn.execute("DELETE FROM explorer_test_patients")
            conn.execute("DELETE FROM explorer_test_nopk")
            conn.execute(
                """
                INSERT INTO explorer_test_patients
                VALUES (%s, 'María López', '555-123', 'Nota clínica larga…',
                        '{"alergias": ["penicilina"]}', ARRAY['A01','B02'],
                        '1990-01-05', '2026-07-02 08:00:00', 1234.50,
                        '\\x00ff'::bytea, 'hash-secreto', 'token-secreto')
                """,
                (str(self.patient_id),),
            )
            conn.execute(
                "INSERT INTO explorer_test_children VALUES ('t1', 1, %s, 'hija')",
                (str(self.patient_id),),
            )
            conn.execute("INSERT INTO explorer_test_nopk VALUES ('sin pk')")

    def _export_snapshot(self):  # type: ignore[no-untyped-def]
        """Conexión exportadora abierta (mismo mecanismo que exported_read_snapshot)."""
        import psycopg

        conn = psycopg.connect(self.dsn, autocommit=True)
        cur = conn.cursor()
        cur.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        cur.execute("SELECT pg_export_snapshot()")
        row = cur.fetchone()
        assert row is not None
        return conn, str(row[0])

    def _build(self, snapshot_id: str) -> Path:
        output = Path(tempfile.mkdtemp()) / "explorer.sqlite"
        result = ExplorerSnapshotService().build(
            source_dsn=self.dsn,
            snapshot_id=snapshot_id,
            output_path=output,
            backup_run_id=uuid.uuid4(),
        )
        self.assertEqual(result.output_path, output)
        return output

    def _table_map(self, db: sqlite3.Connection) -> dict[str, str]:
        return {
            key: name
            for key, name in db.execute(
                "SELECT table_key, sqlite_table_name FROM __mp_tables"
            ).fetchall()
        }

    def test_full_build_policy_metadata_and_isolation(self) -> None:
        import psycopg

        exporter, snapshot_id = self._export_snapshot()
        try:
            # Escrituras POSTERIORES al snapshot: no deben verse en el explorer.
            with psycopg.connect(self.dsn, autocommit=True) as other:
                other.execute(
                    "INSERT INTO explorer_test_patients (id, full_name) VALUES (%s, 'Fila Posterior')",
                    (str(uuid.uuid4()),),
                )
                other.execute(
                    "UPDATE explorer_test_patients SET full_name = 'Nombre Cambiado' WHERE id = %s",
                    (str(self.patient_id),),
                )
            output = self._build(snapshot_id)
        finally:
            exporter.rollback()
            exporter.close()

        db = sqlite3.connect(str(output))
        try:
            tables = self._table_map(db)
            self.assertIn("public.explorer_test_patients", tables)
            self.assertIn("public.explorer_test_children", tables)
            self.assertIn("public.explorer_test_nopk", tables)
            self.assertNotIn("public.taskiq_should_skip", tables)

            # Metadata completa.
            meta = dict(db.execute("SELECT key, value FROM __mp_meta").fetchall())
            self.assertEqual(meta["policy_version"], "1")

            # Columnas: photo (bytea), password_hash y refresh_token NO visibles pero
            # registradas; el resto visible.
            columns = {
                name: visible
                for name, visible in db.execute(
                    "SELECT source_column_name, is_visible FROM __mp_columns "
                    "WHERE table_key = 'public.explorer_test_patients'"
                ).fetchall()
            }
            for hidden in ("photo", "password_hash", "refresh_token"):
                self.assertEqual(columns[hidden], 0, hidden)
            for shown in ("full_name", "phone", "clinical_note", "tags", "codes", "born", "seen_at", "price"):
                self.assertEqual(columns[shown], 1, shown)

            # Datos del snapshot: 1 fila (la posterior NO aparece) con el nombre VIEJO.
            t_patients = tables["public.explorer_test_patients"]
            rows = db.execute(f"SELECT * FROM {t_patients}").fetchall()
            self.assertEqual(len(rows), 1)
            flattened = " ".join(str(v) for v in rows[0])
            self.assertIn("María López", flattened)
            self.assertNotIn("Nombre Cambiado", flattened)
            self.assertNotIn("Fila Posterior", flattened)
            # Sin secretos ni binarios en la salida.
            self.assertNotIn("hash-secreto", flattened)
            self.assertNotIn("token-secreto", flattened)
            # JSONB y arrays sobreviven como JSON válido.
            self.assertIn("penicilina", flattened)
            self.assertIn("A01", flattened)

            # Record keys: PK uuid, PK compuesta y row:<n> sin PK.
            key = db.execute(f"SELECT __mp_record_key FROM {t_patients}").fetchone()[0]
            self.assertTrue(key)
            t_children = tables["public.explorer_test_children"]
            child_key = db.execute(f"SELECT __mp_record_key FROM {t_children}").fetchone()[0]
            self.assertEqual(
                child_key, record_key_from_pk({"tenant_id": "t1", "record_number": 1})
            )
            t_nopk = tables["public.explorer_test_nopk"]
            nopk_key = db.execute(f"SELECT __mp_record_key FROM {t_nopk}").fetchone()[0]
            self.assertEqual(nopk_key, "row:1")

            # Relación navegable SÓLO desde la FK real.
            relations = db.execute(
                "SELECT source_table_key, target_table_key, is_navigable FROM __mp_relations "
                "WHERE source_table_key = 'public.explorer_test_children'"
            ).fetchall()
            self.assertEqual(len(relations), 1)
            self.assertEqual(relations[0][1], "public.explorer_test_patients")
            self.assertEqual(relations[0][2], 1)

            # Integridad.
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            db.close()

    def test_pg_dump_accepts_snapshot_and_shares_instant(self) -> None:
        """pg_dump --snapshot funciona con el snapshot exportado (mismo instante)."""
        import subprocess

        exporter, snapshot_id = self._export_snapshot()
        try:
            parsed = urlparse(self.dsn)
            env = {
                "PGHOST": parsed.hostname or "postgres",
                "PGPORT": str(parsed.port or 5432),
                "PGUSER": parsed.username or "",
                "PGPASSWORD": parsed.password or "",
                "PGDATABASE": (parsed.path or "/").lstrip("/"),
            }
            with tempfile.TemporaryDirectory() as tmp:
                dump = Path(tmp) / "dump.custom"
                result = subprocess.run(
                    [
                        "pg_dump",
                        "--format=custom",
                        "--no-owner",
                        "--no-acl",
                        f"--snapshot={snapshot_id}",
                        "--file",
                        str(dump),
                    ],
                    shell=False,
                    check=False,
                    capture_output=True,
                    timeout=300,
                    env=env,
                )
                self.assertEqual(result.returncode, 0, result.stderr.decode(errors="ignore"))
                listing = subprocess.run(
                    ["pg_restore", "--list", str(dump)],
                    shell=False,
                    check=False,
                    capture_output=True,
                    timeout=120,
                )
                self.assertEqual(listing.returncode, 0)
                self.assertTrue(listing.stdout.strip())
        finally:
            exporter.rollback()
            exporter.close()


if __name__ == "__main__":
    unittest.main()
