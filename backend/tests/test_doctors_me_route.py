"""Tests de ``GET /doctors/me`` (perfil de médico del usuario autenticado).

Endpoint self-service SIN permiso de recurso: devuelve el perfil PROPIO (o 404 si el usuario no es
médico). Lo consume el copiloto para anclar el contexto inicial. Pruebas sobre Postgres real (sólo
si TEST_POSTGRES_URL apunta a una base *_test).
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
from backend.app.models.doctor import Doctor  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class DoctorsMeRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.doctor_user_id = uuid.uuid4()
        cls.plain_user_id = uuid.uuid4()
        cls.other_user_id = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(User(id=cls.doctor_user_id, name="Ana", last_name="López",
                             email=f"ana-{cls.doctor_user_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(User(id=cls.plain_user_id, name="Sin", last_name="Perfil",
                             email=f"sp-{cls.plain_user_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(User(id=cls.other_user_id, name="Otro", last_name="Médico",
                             email=f"om-{cls.other_user_id}@example.com", hashed_password="x",
                             is_active=True))
            session.add(Doctor(user_id=cls.doctor_user_id, professional_name="Ana López",
                               professional_title="Dra.", professional_license_number="LIC-ANA",
                               specialty="Cardiología"))
            session.add(Doctor(user_id=cls.other_user_id, professional_name="Otro Médico",
                               professional_license_number="LIC-OTRO"))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(Doctor))
            session.execute(delete(User))
            session.commit()
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, user_id: uuid.UUID) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=user_id, name="X", last_name="Y", email="x@example.com", permissions=set(),
        )

    def test_returns_own_profile(self) -> None:
        self._as(self.doctor_user_id)
        response = TestClient(app).get("/api/v1/doctors/me")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["professional_name"], "Ana López")
        self.assertEqual(body["professional_license_number"], "LIC-ANA")
        self.assertEqual(body["user_id"], str(self.doctor_user_id))

    def test_404_when_user_has_no_profile(self) -> None:
        self._as(self.plain_user_id)
        self.assertEqual(TestClient(app).get("/api/v1/doctors/me").status_code, 404)

    def test_does_not_leak_other_users_profile(self) -> None:
        self._as(self.doctor_user_id)
        body = TestClient(app).get("/api/v1/doctors/me").json()
        self.assertNotEqual(body["professional_license_number"], "LIC-OTRO")


if __name__ == "__main__":
    unittest.main()
