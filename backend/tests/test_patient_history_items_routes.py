"""Tests de los antecedentes clínicos estructurados del paciente (STRUCTURED HISTORY, gap 6).

``PatientHistoryItem`` persiste antecedentes (familiar/quirúrgico/obstétrico/patológico/no
patológico) como registros tipados. Las pruebas de ruta usan Postgres real (sólo si
TEST_POSTGRES_URL apunta a una base *_test): verifican alta con auditoría, lectura filtrada por
paciente excluyendo eliminados, el CHECK del enum de categoría, el RBAC y la baja lógica.
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
from backend.app.models.enums import (  # noqa: E402
    FamilyRelationship,
    PatientHistoryItemCategory,
    Sex,
)
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.models.patient_history_item import PatientHistoryItem  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


class PatientHistoryItemsPermissionUnitTest(unittest.TestCase):
    def test_permissions_declared(self) -> None:
        declared = declared_permissions()
        for perm in (
            "patient_history_items:read",
            "patient_history_items:create",
            "patient_history_items:update",
            "patient_history_items:delete",
        ):
            self.assertIn(perm, declared)


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PatientHistoryItemsRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.patient_id = uuid.uuid4()
        cls.other_patient_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.actor_id, name="Médico", last_name="Tester",
                             email=f"a-{cls.actor_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Patient(id=cls.patient_id, full_name="Paciente Historia",
                                birth_date=date(1980, 1, 1), sex=Sex.MALE))
            session.add(Patient(id=cls.other_patient_id, full_name="Otro Paciente",
                                birth_date=date(1990, 1, 1), sex=Sex.FEMALE))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(PatientHistoryItem))
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
        self._as(
            "patient_history_items:read",
            "patient_history_items:create",
            "patient_history_items:update",
            "patient_history_items:delete",
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def _create(self, **overrides):  # type: ignore[no-untyped-def]
        payload = {
            "patient_id": str(self.patient_id),
            "category": "familiar",
            "description": "Diabetes mellitus en la madre",
            "relationship_to_patient": "madre",
        }
        payload.update(overrides)
        return self.client.post("/api/v1/patient-history-items", json=payload)

    def test_create_persists_with_audit(self) -> None:
        resp = self._create(category="quirurgico", description="Apendicectomía",
                            relationship_to_patient=None, onset_age=25, occurred_on="2010-05-01")
        self.assertEqual(resp.status_code, 201, resp.text)
        body = resp.json()
        self.assertEqual(body["category"], "quirurgico")
        self.assertEqual(body["onset_age"], 25)
        item_id = body["id"]
        with Session(self.engine) as session:
            item = session.get(PatientHistoryItem, uuid.UUID(item_id))
            assert item is not None
            self.assertEqual(item.created_by, self.actor_id)
            self.assertEqual(item.updated_by, self.actor_id)
            self.assertIsNone(item.deleted_at)
            self.assertEqual(item.category, PatientHistoryItemCategory.QUIRURGICO)

    def test_read_filters_by_patient_and_excludes_soft_deleted(self) -> None:
        a = self._create(description="Antecedente A").json()["id"]
        self._create(description="Antecedente B").json()
        # Antecedente de OTRO paciente: no debe aparecer al filtrar por patient_id.
        self._create(patient_id=str(self.other_patient_id), description="De otro").json()
        # Uno eliminado lógicamente: no debe aparecer.
        deleted_id = self._create(description="A eliminar").json()["id"]
        self.assertEqual(
            self.client.delete(f"/api/v1/patient-history-items/{deleted_id}").status_code, 200
        )

        listed = self.client.get(
            f"/api/v1/patient-history-items?patient_id={self.patient_id}"
        ).json()
        ids = {row["id"] for row in listed["items"]}
        self.assertIn(a, ids)
        self.assertNotIn(deleted_id, ids)  # eliminado excluido
        for row in listed["items"]:
            self.assertEqual(row["patient_id"], str(self.patient_id))  # filtro por paciente

    def test_filter_by_category(self) -> None:
        self._create(category="obstetrico", description="G2P1A0", relationship_to_patient=None)
        listed = self.client.get(
            f"/api/v1/patient-history-items?patient_id={self.patient_id}&category=obstetrico"
        ).json()
        self.assertTrue(listed["items"])
        for row in listed["items"]:
            self.assertEqual(row["category"], "obstetrico")

    def test_invalid_category_rejected_by_api(self) -> None:
        resp = self._create(category="inventada")
        self.assertEqual(resp.status_code, 422, resp.text)

    def test_db_check_constraint_rejects_invalid_category(self) -> None:
        # Inserción CRUDA saltándose la validación de Pydantic/ORM: el CHECK del enum no-nativo
        # debe rechazar una categoría fuera del dominio.
        # Valor inválido que CABE en el VARCHAR (el enum no-nativo se materializa como VARCHAR
        # dimensionado al valor más largo): así se ejercita el CHECK, no el límite de longitud.
        with self.assertRaises(IntegrityError):
            with Session(self.engine) as session:
                session.execute(
                    text(
                        "INSERT INTO patient_history_items (id, patient_id, category, description)"
                        " VALUES (:id, :pid, 'invalido', 'x')"
                    ),
                    {"id": str(uuid.uuid4()), "pid": str(self.patient_id)},
                )
                session.commit()

    def test_onset_age_check_constraint(self) -> None:
        # La API valida 0-120 (422); el CHECK de BD respalda el límite.
        self.assertEqual(self._create(onset_age=200).status_code, 422)

    def test_nonexistent_patient_rejected(self) -> None:
        resp = self._create(patient_id=str(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404, resp.text)

    def test_requires_permission(self) -> None:
        self._as("consultations:read")  # sin patient_history_items:*
        self.assertEqual(
            self.client.get(
                f"/api/v1/patient-history-items?patient_id={self.patient_id}"
            ).status_code,
            403,
        )
        self.assertEqual(self._create().status_code, 403)

    def test_relationship_enum_persisted(self) -> None:
        body = self._create(description="Madre con HTA").json()
        with Session(self.engine) as session:
            item = session.get(PatientHistoryItem, uuid.UUID(body["id"]))
            assert item is not None
            self.assertEqual(item.relationship_to_patient, FamilyRelationship.MADRE)


if __name__ == "__main__":
    unittest.main()
