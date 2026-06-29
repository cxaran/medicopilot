"""Tests de integración de resultados de escalas clínicas persistidos (ESCALAS fase 2).

Requieren PostgreSQL real (la persistencia y el JSONB). Se ejecutan solo si
``TEST_POSTGRES_URL`` apunta a una base cuyo nombre termina en ``_test``.

Cubren el invariante central de la fase 2: el servidor RE-COMPUTA el puntaje desde
``scale_id`` + ``inputs`` (no se confía en un puntaje del cliente), valida insumos (422
nombrando el campo), filtra por paciente/escala/fecha, respeta el RBAC y excluye los
eliminados lógicamente.
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
from sqlalchemy import create_engine, delete  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.enums import Sex  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.scale_result import ScaleResult  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")

_ALL_PERMS = (
    "scale_results:read",
    "scale_results:create",
    "scale_results:update",
    "scale_results:delete",
)

# Mujer de 80 años con HTA + DM: edad≥75 (2) + sexo femenino (1) + HTA (1) + DM (1) = 5.
_CHADS_INPUTS = {
    "chf": False,
    "hypertension": True,
    "age": 80,
    "diabetes": True,
    "stroke_tia_thromboembolism": False,
    "vascular_disease": False,
    "sex": "female",
}


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class ScaleResultsPermissionsTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for permission in _ALL_PERMS:
            self.assertIn(permission, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class ScaleResultsRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
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
            session.add(
                Patient(
                    id=cls.patient_id,
                    full_name="Paciente Escala",
                    birth_date=date(1945, 1, 1),
                    sex=Sex.FEMALE,
                )
            )
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(ScaleResult))
            session.execute(delete(Patient))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as(*_ALL_PERMS)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        with Session(self.engine) as session:
            session.execute(delete(ScaleResult))
            session.commit()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id,
            name="Admin",
            last_name="Tester",
            email="admin@example.com",
            permissions=set(permissions),
        )

    def _create(self, **overrides):
        body: dict = {
            "patient_id": str(self.patient_id),
            "scale_id": "cha2ds2_vasc",
            "inputs": _CHADS_INPUTS,
        }
        body.update(overrides)
        return self.client.post("/api/v1/scale-results", json=body)

    # --- recompute-on-save (invariante central) ---

    def test_create_recomputes_authoritative_score(self) -> None:
        resp = self._create()
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["score"], 5)  # re-computado por el servidor
        self.assertEqual(body["interpretation_label"], "Riesgo alto")
        self.assertIn("ESC", body["source"])  # fuente citada
        self.assertEqual(body["scale_id"], "cha2ds2_vasc")
        self.assertEqual(body["patient_id"], str(self.patient_id))
        self.assertIsNotNone(body["computed_at"])
        # Persistió ligado al paciente.
        got = self.client.get(f"/api/v1/scale-results/{body['id']}")
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["score"], 5)

    def test_client_supplied_score_is_rejected_not_trusted(self) -> None:
        # El cliente NO puede inyectar un puntaje: el write schema lo prohíbe (extra forbid).
        # El puntaje guardado siempre proviene del re-cómputo del servidor.
        resp = self._create(score=99)
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_create_missing_inputs_returns_422_naming_field(self) -> None:
        resp = self._create(inputs={"chf": True})
        self.assertEqual(resp.status_code, 422, resp.text)
        detail = resp.json().get("detail", resp.json())
        self.assertEqual(detail["code"], "scale_inputs_invalid")
        fields = {e["field"] for e in detail["errors"]}
        self.assertIn("age", fields)
        self.assertIn("sex", fields)

    def test_create_unknown_scale_returns_422_naming_scale_id(self) -> None:
        resp = self._create(scale_id="no_existe")
        self.assertEqual(resp.status_code, 422, resp.text)
        detail = resp.json().get("detail", resp.json())
        self.assertEqual(detail["code"], "scale_inputs_invalid")
        self.assertIn("scale_id", {e["field"] for e in detail["errors"]})

    def test_update_recomputes_on_new_inputs(self) -> None:
        created = self._create().json()
        # Nuevos insumos: hombre 50 sin factores -> 0, riesgo bajo.
        patch = self.client.patch(
            f"/api/v1/scale-results/{created['id']}",
            json={"inputs": {
                "chf": False, "hypertension": False, "age": 50, "diabetes": False,
                "stroke_tia_thromboembolism": False, "vascular_disease": False, "sex": "male"}},
        )
        self.assertEqual(patch.status_code, 200, patch.text)
        self.assertEqual(patch.json()["score"], 0)
        self.assertEqual(patch.json()["interpretation_label"], "Riesgo bajo")

    # --- listado / filtros ---

    def test_list_filters_by_patient_and_scale(self) -> None:
        self.assertEqual(self._create().status_code, 201)
        # Crear uno de Wells para el mismo paciente.
        self.client.post("/api/v1/scale-results", json={
            "patient_id": str(self.patient_id), "scale_id": "wells_dvt",
            "inputs": {
                "active_cancer": True, "paralysis_paresis_immobilization": False,
                "bedridden_or_major_surgery": False, "localized_tenderness": True,
                "entire_leg_swollen": True, "calf_swelling_gt_3cm": False, "pitting_edema": False,
                "collateral_superficial_veins": False, "previously_documented_dvt": False,
                "alternative_diagnosis_as_likely": False}})
        by_patient = self.client.get(f"/api/v1/scale-results?patient_id={self.patient_id}")
        self.assertEqual(by_patient.status_code, 200, by_patient.text)
        self.assertGreaterEqual(by_patient.json()["pagination"]["total"], 2)
        by_scale = self.client.get(
            f"/api/v1/scale-results?patient_id={self.patient_id}&scale_id=wells_dvt"
        )
        scales = {item["scale_id"] for item in by_scale.json()["items"]}
        self.assertEqual(scales, {"wells_dvt"})

    def test_list_filters_by_computed_at_range(self) -> None:
        self._create()
        # Rango con cota inferior pasada: el resultado recién computado debe quedar dentro.
        resp = self.client.get(
            f"/api/v1/scale-results?patient_id={self.patient_id}&computed_at_after=2000-01-01"
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertGreaterEqual(resp.json()["pagination"]["total"], 1)

    # --- RBAC / soft-delete ---

    def test_read_requires_read_permission(self) -> None:
        self._as()  # sin permisos
        self.assertEqual(self.client.get("/api/v1/scale-results").status_code, 403)

    def test_create_requires_create_permission(self) -> None:
        self._as("scale_results:read")
        self.assertEqual(self._create().status_code, 403)

    def test_soft_deleted_excluded(self) -> None:
        created = self._create().json()
        self.assertEqual(
            self.client.delete(f"/api/v1/scale-results/{created['id']}").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/v1/scale-results/{created['id']}").status_code, 404
        )
        listed = self.client.get(f"/api/v1/scale-results?patient_id={self.patient_id}")
        ids = {item["id"] for item in listed.json()["items"]}
        self.assertNotIn(created["id"], ids)


if __name__ == "__main__":
    unittest.main()
