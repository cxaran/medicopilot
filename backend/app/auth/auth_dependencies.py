from typing import Annotated, cast
from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import select

from backend.app.core.database import SessionDep
from backend.app.models.user import Role, RoleAccess, User, UserRole
from backend.app.schemas.user import SessionUser

from .security import decode_jwt

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


def _unauthorized_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar el usuario",
    )


def get_token(
    session_token: str | None = Cookie(None),
    bearer_token: str | None = Depends(oauth2_scheme),
) -> str | None:
    return bearer_token or session_token


def build_current_user(
    session: SessionDep,
    user: User,
) -> SessionUser:
    """Materializa los permisos EFECTIVOS de la sesión.

    Sólo cuentan los accesos de roles ACTIVOS y con el acceso ACTIVO: desactivar un
    rol (o un acceso puntual) revoca sus permisos de inmediato en toda sesión nueva
    o reconstruida. Misma regla que ``security/admin_survival.effective_coverage``
    — mantener ambas queries alineadas (la validez del USUARIO activo la garantiza
    ``get_current_user_orm`` antes de llegar aquí).
    """
    stmt = (
        select(RoleAccess.access)
        .join_from(RoleAccess, UserRole, RoleAccess.role_id == UserRole.role_id)
        .join(Role, Role.id == RoleAccess.role_id)
        .where(
            UserRole.user_id == user.id,
            Role.is_active.is_(True),
            RoleAccess.is_active.is_(True),
        )
    )
    permissions = cast("list[str]", session.exec(stmt).all())
    base_user = SessionUser.model_validate(user, from_attributes=True)
    base_user.permissions = set(permissions)
    return base_user


def get_current_user_orm(
    session: SessionDep,
    token: str | None = Depends(get_token),
) -> User:
    """Resuelve y valida el usuario ORM de la sesión actual (cookie o bearer).

    AQUÍ vive TODA la validación de sesión (token presente y decodificable, usuario
    activo y versión de sesión vigente ``User.token == jti``); ``get_current_user``
    depende de esta función y sólo materializa los permisos encima. Devuelve la
    instancia ORM ``User`` para consumidores que necesitan campos no expuestos en
    ``SessionUser``."""
    if not token:
        raise _unauthorized_error()

    try:
        data = decode_jwt(token)
    except Exception:
        raise _unauthorized_error()

    user = session.get(User, data.sub)
    if not user or not user.is_active or user.token != data.jti:
        raise _unauthorized_error()

    return user


def get_current_user(
    session: SessionDep,
    user: User = Depends(get_current_user_orm),
) -> SessionUser:
    return build_current_user(session, user)


CurrentUser = Annotated[SessionUser, Depends(get_current_user)]
CurrentUserOrm = Annotated[User, Depends(get_current_user_orm)]
