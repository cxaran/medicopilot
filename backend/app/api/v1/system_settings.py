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
    SendTestEmailRequest,
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
    from backend.app.services.email_service import transport_unavailable_reason

    return SystemSettingsRead(
        id=row.id,
        public_registration_enabled=row.public_registration_enabled,
        registration_allowed_by_deployment=settings.registration_allowed_effective,
        public_registration_effective=system.is_public_registration_enabled(session),
        app_base_url=row.app_base_url,
        app_base_url_verified_at=row.app_base_url_verified_at,
        institution_name=row.institution_name,
        password_reset_enabled=row.password_reset_enabled,
        email_mode=row.email_mode,
        email_from_address=row.email_from_address,
        email_from_name=row.email_from_name,
        email_smtp_host=row.email_smtp_host,
        email_smtp_port=row.email_smtp_port,
        email_smtp_username=row.email_smtp_username,
        email_smtp_tls=row.email_smtp_tls,
        email_smtp_ssl=row.email_smtp_ssl,
        email_smtp_password_configured=row.email_smtp_password_ciphertext is not None,
        email_resend_api_key_configured=row.email_resend_api_key_ciphertext is not None,
        email_last_test_at=row.email_last_test_at,
        email_last_test_status=row.email_last_test_status,
        email_last_test_error=row.email_last_test_error,
        email_transport_reason=transport_unavailable_reason(row),
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
    current_user: CurrentUser,
    _: SystemSettingsPermissions.READ.requiere,
) -> SetupChecklistRead:
    """Checklist de puesta en marcha DERIVADO del estado real de la configuración."""
    items, dismissed = system.build_setup_checklist(
        session, current_user_id=current_user.id
    )
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


@router.post("/system-settings/{item_id}/send-test-email", response_model=SystemSettingsRead)
async def send_test_email(
    item_id: UUID,
    payload: SendTestEmailRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: SystemSettingsPermissions.CONFIGURE.requiere,
) -> SystemSettingsRead:
    """Verifica el transporte configurado enviando un correo real y PERSISTE el
    desenlace (email_last_test_*): el checklist marca el correo como verificado
    solo tras un test exitoso."""
    from backend.app.services.email_service import send_system_email

    row = get_or_404(session, SystemSettings, item_id, _NOT_FOUND)
    recipient = payload.recipient or current_user.email
    outcome = await send_system_email(
        session,
        subject="MediCopilot: correo de prueba",
        email_to=recipient,
        message=(
            "Este es un correo de PRUEBA de MediCopilot para verificar el "
            f"transporte configurado (modo: {row.email_mode}). Si lo recibiste, "
            "el correo saliente funciona."
        ),
    )
    row.email_last_test_at = utc_now()
    row.email_last_test_status = "ok" if outcome.sent else "failed"
    row.email_last_test_error = None if outcome.sent else (
        f"{outcome.error_code}: {outcome.error_summary}"[:255]
    )
    session.add(row)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="system_settings",
        entity_id=row.id,
        action="email_test_sent",
        changed_fields=["email_last_test_status"],
    )
    session.commit()
    session.refresh(row)
    return _serialize_read(session, row)


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
    changed_field_names = list(data.keys())
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

    # Secretos WRITE-ONLY: valor -> cifrar y reemplazar; null -> borrar; omitido ->
    # conservar. Nunca pasan por setattr (no existen como columnas en claro).
    from backend.app.services.secret_cipher import SecretCipherError, encrypt_secret

    secret_targets = {
        "email_smtp_password": "email_smtp_password_ciphertext",
        "email_resend_api_key": "email_resend_api_key_ciphertext",
    }
    try:
        for field, column in secret_targets.items():
            if field in data:
                value = data.pop(field)
                setattr(row, column, encrypt_secret(value) if value else None)
    except SecretCipherError as error:
        api_error(status.HTTP_409_CONFLICT, error.code, error.summary)

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
        changed_fields=changed_field_names,
    )
    session.commit()
    session.refresh(row)
    return _serialize_read(session, row)
