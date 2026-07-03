"""Tests de la materialización de permisos de sesión (build_current_user).

Ancla la regla de seguridad: sólo cuentan los accesos de roles ACTIVOS con el
acceso ACTIVO — desactivar un rol (o un acceso puntual) revoca sus permisos en
cualquier sesión reconstruida. Es la misma regla que admin_survival.effective_
coverage; este test evita que las dos queries vuelvan a divergir.
"""

import os
import unittest
import uuid

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

from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import build_current_user  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.user import Role, RoleAccess, User, UserRole  # noqa: E402
from backend.app.security.admin_survival import effective_coverage  # noqa: E402


class BuildCurrentUserPermissionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            self.user = User(
                name="Ana",
                last_name="Prueba",
                email="ana@example.com",
                hashed_password="x",
                token="t-" + uuid.uuid4().hex,
                is_active=True,
            )
            self.role = Role(name="Operación", is_active=True)
            session.add(self.user)
            session.add(self.role)
            session.flush()
            session.add(UserRole(user_id=self.user.id, role_id=self.role.id))
            session.add(
                RoleAccess(role_id=self.role.id, access="users:read", is_active=True)
            )
            session.add(
                RoleAccess(role_id=self.role.id, access="roles:read", is_active=True)
            )
            session.commit()
            self.user_id = self.user.id
            self.role_id = self.role.id

    def _permissions(self) -> set[str]:
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            assert user is not None
            return build_current_user(session, user).permissions

    def test_active_role_and_accesses_grant_permissions(self) -> None:
        self.assertEqual(self._permissions(), {"users:read", "roles:read"})

    def test_deactivating_the_role_revokes_all_its_permissions(self) -> None:
        with Session(self.engine) as session:
            role = session.get(Role, self.role_id)
            assert role is not None
            role.is_active = False
            session.add(role)
            session.commit()
        self.assertEqual(self._permissions(), set())

    def test_deactivating_one_access_revokes_only_that_permission(self) -> None:
        with Session(self.engine) as session:
            from sqlmodel import select

            access = session.exec(
                select(RoleAccess).where(RoleAccess.access == "roles:read")
            ).one()
            access.is_active = False
            session.add(access)
            session.commit()
        self.assertEqual(self._permissions(), {"users:read"})

    def test_session_permissions_match_admin_survival_coverage(self) -> None:
        # Las dos lecturas de la misma verdad deben coincidir SIEMPRE (era la
        # contradicción: la sesión ignoraba is_active y admin_survival no).
        with Session(self.engine) as session:
            role = session.get(Role, self.role_id)
            assert role is not None
            role.is_active = False
            session.add(role)
            session.commit()
            user = session.get(User, self.user_id)
            assert user is not None
            self.assertEqual(
                build_current_user(session, user).permissions,
                effective_coverage(session, self.user_id),
            )


if __name__ == "__main__":
    unittest.main()
