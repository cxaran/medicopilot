"""Configuración institucional: CRUD bajo ``institutional_settings:*`` (G5 fase 3).

Define reglas clínicas configurables (umbrales de bandera roja, metas de laboratorio,
intervalos de seguimiento, protocolos) que la lógica clínica lee en vez de constantes
fijas. La baja es lógica; los listados/detalles excluyen las eliminadas.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    create_entity,
    get_active_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.institutional_setting import InstitutionalSetting
from backend.app.resources.registry import INSTITUTIONAL_SETTINGS
from backend.app.schemas.institutional_setting import (
    InstitutionalSettingCreate,
    InstitutionalSettingListItem,
    InstitutionalSettingRead,
    InstitutionalSettingUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.institutional_settings import (
    InstitutionalSettingPermissions,
)

router = APIRouter(prefix="/institutional-settings", tags=["institutional_settings"])

_NOT_FOUND = "Configuración institucional no encontrada"
_CONFLICT = "Ya existe una configuración con esa clave"


@router.get("", response_model=OffsetPage[InstitutionalSettingListItem])
def list_institutional_settings(
    session: SessionDep,
    query: Annotated[INSTITUTIONAL_SETTINGS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: InstitutionalSettingPermissions.READ.requiere,
) -> OffsetPage[InstitutionalSettingListItem]:
    stmt = select(InstitutionalSetting).where(InstitutionalSetting.deleted_at.is_(None))
    return paginate_resource(INSTITUTIONAL_SETTINGS, session, query, stmt=stmt)


@router.get("/{setting_id}", response_model=InstitutionalSettingRead)
def get_institutional_setting(
    setting_id: UUID,
    session: SessionDep,
    _: InstitutionalSettingPermissions.READ.requiere,
) -> InstitutionalSettingRead:
    return serialize(InstitutionalSettingRead, get_active_or_404(session, InstitutionalSetting, setting_id, _NOT_FOUND))


@router.post(
    "", response_model=InstitutionalSettingRead, status_code=status.HTTP_201_CREATED
)
def create_institutional_setting(
    payload: InstitutionalSettingCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: InstitutionalSettingPermissions.CREATE.requiere,
) -> InstitutionalSettingRead:
    setting = create_entity(
        session,
        InstitutionalSetting,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(InstitutionalSettingRead, setting)


@router.patch("/{setting_id}", response_model=InstitutionalSettingRead)
def update_institutional_setting(
    setting_id: UUID,
    payload: InstitutionalSettingUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: InstitutionalSettingPermissions.UPDATE.requiere,
) -> InstitutionalSettingRead:
    setting = get_active_or_404(session, InstitutionalSetting, setting_id, _NOT_FOUND)
    setting = patch_entity(
        session,
        setting,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(InstitutionalSettingRead, setting)


@router.delete("/{setting_id}", response_model=InstitutionalSettingRead)
def delete_institutional_setting(
    setting_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: InstitutionalSettingPermissions.DELETE.requiere,
) -> InstitutionalSettingRead:
    setting = get_active_or_404(session, InstitutionalSetting, setting_id, _NOT_FOUND)
    setting = soft_delete_entity(
        session,
        setting,
        actor_id=current_user.id,
        already_deleted_message="La configuración ya fue eliminada",
    )
    return serialize(InstitutionalSettingRead, setting)
