"""Configuración del sistema: singleton editable + checklist de puesta en marcha.

El router valida permisos y delega; la política vive en la base de datos y cada
cambio queda en la bitácora de auditoría con SOLO los nombres de los campos
modificados (nunca valores). Permisos: ``system_settings:read`` para el estado
seguro y el checklist; ``system_settings:configure`` para editar y descartar el
checklist.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from backend.app.api.resource_actions import api_error, get_or_404, paginate_resource
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.models.system_settings import SystemSettings
from backend.app.resources.registry import SYSTEM_SETTINGS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.system_settings import (
    SetupChecklistItemRead,
    SetupChecklistRead,
    SystemSettingsListItem,
    SystemSettingsRead,
    SystemSettingsUpdate,
)
from backend.app.security.groups.system_settings import SystemSettingsPermissions
from backend.app.services import system_settings_service as system
from backend.app.services.config_audit import record_config_change
from backend.app.utils.utc_now import utc_now

router = APIRouter(tags=["system-settings"])

_NOT_FOUND = "Configuración del sistema no encontrada"


def _serialize_read(session: SessionDep, row: SystemSettings) -> SystemSettingsRead:
    return SystemSettingsRead(
        id=row.id,
        public_registration_enabled=row.public_registration_enabled,
        registration_allowed_by_deployment=settings.registration_allowed_effective,
        public_registration_effective=system.is_public_registration_enabled(session),
        app_base_url=row.app_base_url,
        app_base_url_verified_at=row.app_base_url_verified_at,
        institution_name=row.institution_name,
        environment=settings.environment,
        created_at=row.created_at,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("/system-settings", response_model=OffsetPage[SystemSettingsListItem])
def list_system_settings(
    session: SessionDep,
    query: Annotated[SYSTEM_SETTINGS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: SystemSettingsPermissions.READ.requiere,
) -> OffsetPage[SystemSettingsListItem]:
    # Singleton: la "lista" devuelve una sola fila (contrato de la UI declarativa).
    return paginate_resource(SYSTEM_SETTINGS, session, query)


@router.get("/system-settings/setup-checklist", response_model=SetupChecklistRead)
def get_setup_checklist(
    session: SessionDep,
    _: SystemSettingsPermissions.READ.requiere,
) -> SetupChecklistRead:
    """Checklist de puesta en marcha DERIVADO del estado real de la configuración."""
    items, dismissed = system.build_setup_checklist(session)
    serialized = [
        SetupChecklistItemRead(key=i.key, title=i.title, status=i.status, detail=i.detail)
        for i in items
    ]
    pending = sum(1 for i in items if i.status == "pending")
    return SetupChecklistRead(items=serialized, dismissed=dismissed, pending_count=pending)


@router.post("/system-settings/setup-checklist/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_setup_checklist(
    session: SessionDep,
    _: SystemSettingsPermissions.CONFIGURE.requiere,
) -> None:
    """Descarta el banner del checklist (el checklist sigue disponible a demanda)."""
    system.dismiss_onboarding(session)
    session.commit()


@router.get("/system-settings/{item_id}", response_model=SystemSettingsRead)
def get_system_settings_detail(
    item_id: UUID,
    session: SessionDep,
    _: SystemSettingsPermissions.READ.requiere,
) -> SystemSettingsRead:
    row = get_or_404(session, SystemSettings, item_id, _NOT_FOUND)
    return _serialize_read(session, row)


@router.patch("/system-settings/{item_id}", response_model=SystemSettingsRead)
def update_system_settings(
    item_id: UUID,
    payload: SystemSettingsUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: SystemSettingsPermissions.CONFIGURE.requiere,
) -> SystemSettingsRead:
    row = get_or_404(session, SystemSettings, item_id, _NOT_FOUND)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return _serialize_read(session, row)

    # Candado de despliegue: activar el registro con el gate cerrado sería un switch
    # sin efecto — se rechaza con la causa en lugar de fingir que quedó activo.
    if data.get("public_registration_enabled") is True and not settings.registration_allowed_effective:
        api_error(
            status.HTTP_409_CONFLICT,
            "registration_locked_by_deployment",
            "El despliegue no permite registro público (REGISTRATION_ALLOWED). "
            "Actívalo en el entorno antes de habilitarlo aquí.",
        )

    for field, value in data.items():
        setattr(row, field, value)
    row.updated_by = current_user.id
    row.updated_at = utc_now()
    session.add(row)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="system_settings",
        entity_id=row.id,
        action="system_settings_updated",
        changed_fields=list(data.keys()),
    )
    session.commit()
    session.refresh(row)
    return _serialize_read(session, row)
