"""Tests de integración del catálogo de códigos clínicos de apoyo (G5 fase 4).

Requieren PostgreSQL real. Se ejecutan solo si ``TEST_POSTGRES_URL`` apunta a una
base cuyo nombre termina en ``_test``.
"""

import os
import unittest
import uuid
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
from backend.app.models.clinical_code import ClinicalCode  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402
from backend.app.services.clinical_codes import (  # noqa: E402
    DEFAULT_CLINICAL_CODES,
    seed_clinical_codes,
)


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

_ALL_PERMS = (
    "clinical_codes:read",
    "clinical_codes:create",
    "clinical_codes:update",
    "clinical_codes:delete",
)


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class ClinicalCodesCatalogTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in _ALL_PERMS:
            self.assertIn(permission, declared)

    def test_seed_uses_only_real_known_codes(self) -> None:
        # Sanidad del seed: cobertura limitada pero códigos reales (no inventados).
        systems = {entry["system"].value for entry in DEFAULT_CLINICAL_CODES}
        self.assertEqual(systems, {"cie10", "loinc", "atc"})
        codes = {(e["system"].value, e["code"]) for e in DEFAULT_CLINICAL_CODES}
        # Algunos códigos reales y bien conocidos que deben estar presentes.
        self.assertIn(("cie10", "E11.9"), codes)  # Diabetes mellitus tipo 2 sin complicaciones
        self.assertIn(("loinc", "4548-4"), codes)  # HbA1c
        self.assertIn(("atc", "A10BA02"), codes)  # Metformina


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ClinicalCodesRoutesTest(unittest.TestCase):
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
        self._as(*_ALL_PERMS)
        self.client = TestClient(app)
        with Session(self.engine) as session:
            seed_clinical_codes(session)
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ClinicalCode))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _search(self, **params: str) -> dict:
        response = self.client.get("/api/v1/clinical-codes", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    # --- seed / búsqueda ---

    def test_seed_present_and_idempotent(self) -> None:
        data = self._search(limit="100")
        self.assertEqual(data["pagination"]["total"], len(DEFAULT_CLINICAL_CODES))
        with Session(self.engine) as session:
            created = seed_clinical_codes(session)
            session.commit()
        self.assertEqual(created, 0)  # ya sembrado en setUp

    def test_search_seeded_cie10_diagnosis(self) -> None:
        # Búsqueda por término real -> coincidencia exacta de un CIE-10 sembrado.
        data = self._search(system="cie10", q="diabetes")
        codes = {item["code"] for item in data["items"]}
        self.assertIn("E11.9", codes)
        for item in data["items"]:
            self.assertEqual(item["system"], "cie10")

    def test_search_seeded_loinc_matches_app_analyte(self) -> None:
        # El término LOINC contiene el nombre del analito que la app usa (HbA1c).
        data = self._search(system="loinc", q="HbA1c")
        codes = {item["code"] for item in data["items"]}
        self.assertIn("4548-4", codes)

    def test_search_by_code(self) -> None:
        data = self._search(system="atc", q="A10BA02")
        self.assertEqual([item["display_term"] for item in data["items"]], ["Metformina"])

    def test_unknown_term_returns_empty_never_fabricated(self) -> None:
        # Un término desconocido devuelve vacío; nunca un código inventado.
        data = self._search(system="cie10", q="zzz-padecimiento-inexistente-999")
        self.assertEqual(data["items"], [])
        self.assertEqual(data["pagination"]["total"], 0)

    def test_system_filter_isolates_results(self) -> None:
        # "Glucosa" sólo existe como LOINC sembrado; filtrando por cie10 no aparece.
        self.assertEqual(self._search(system="cie10", q="glucosa")["items"], [])
        self.assertGreaterEqual(
            self._search(system="loinc", q="glucosa")["pagination"]["total"], 1
        )

    # --- RBAC / CRUD ---

    def test_read_requires_read_permission(self) -> None:
        self._as()  # sin permisos
        self.assertEqual(self.client.get("/api/v1/clinical-codes").status_code, 403)

    def test_create_requires_create_permission(self) -> None:
        self._as("clinical_codes:read")
        response = self.client.post(
            "/api/v1/clinical-codes",
            json={"system": "cie10", "code": "J02.9", "display_term": "Faringitis aguda"},
        )
        self.assertEqual(response.status_code, 403)

    def test_crud_create_patch_delete(self) -> None:
        created = self.client.post(
            "/api/v1/clinical-codes",
            json={
                "system": "cie10",
                "code": "J02.9",
                "display_term": "Faringitis aguda, no especificada",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        code_id = created.json()["id"]
        patched = self.client.patch(
            f"/api/v1/clinical-codes/{code_id}",
            json={"display_term": "Faringitis aguda"},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["display_term"], "Faringitis aguda")
        self.assertEqual(
            self.client.delete(f"/api/v1/clinical-codes/{code_id}").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/clinical-codes/{code_id}").status_code, 404
        )

    def test_duplicate_system_code_conflicts(self) -> None:
        body = {"system": "cie10", "code": "E11", "display_term": "Duplicado"}
        # 'E11' ya está sembrado -> conflicto.
        self.assertEqual(self.client.post("/api/v1/clinical-codes", json=body).status_code, 409)


if __name__ == "__main__":
    unittest.main()
