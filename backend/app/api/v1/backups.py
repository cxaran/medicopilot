"""Respaldos cifrados hacia Google Drive: configuración singleton, acciones y historial.

El router NO contiene lógica de respaldo: valida sesión/permisos/entrada y delega en
``services/backup_service``. Permisos: ``backups:read`` (ver configuración e historial)
y ``backups:configure`` (editar, conectar/desconectar Drive y respaldo manual). El
callback OAuth exige la MISMA sesión del administrador que inició la conexión (el
state, además, expira en 10 minutos y se consume una sola vez).
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from fastapi.responses import RedirectResponse
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    get_or_404,
    paginate_resource,
    serialize,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.backup import BackupRun, BackupSettings
from backend.app.resources.registry import BACKUP_RUNS, BACKUP_SETTINGS
from backend.app.schemas.backup import (
    BackupRunListItem,
    BackupRunRead,
    BackupSettingsListItem,
    BackupSettingsRead,
    BackupSettingsUpdate,
    ConnectDriveResponse,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.backups import BackupPermissions
from backend.app.services.backup_crypto_service import (
    BackupCryptoError,
    age_recipient_fingerprint,
    validate_age_recipient,
)
from backend.app.services import backup_service as backups
from backend.app.utils.utc_now import utc_now

logger = logging.getLogger("backend.backups")

router = APIRouter(tags=["backups"])

_SETTINGS_NOT_FOUND = "Configuración de respaldos no encontrada"
_RUN_NOT_FOUND = "Ejecución de respaldo no encontrada"

# Pantalla del frontend a la que vuelve el callback OAuth (resultado NO sensible).
_FRONTEND_BACKUPS_PATH = "/resources/backup_settings"


@router.get("/backup-settings", response_model=OffsetPage[BackupSettingsListItem])
def list_backup_settings(
    session: SessionDep,
    query: Annotated[BACKUP_SETTINGS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: BackupPermissions.READ.requiere,
) -> OffsetPage[BackupSettingsListItem]:
    # Singleton: la "lista" devuelve una sola fila (la UI genérica la renderiza igual).
    return paginate_resource(BACKUP_SETTINGS, session, query)


@router.get("/backup-settings/{item_id}", response_model=BackupSettingsRead)
def get_backup_settings_detail(
    item_id: UUID,
    session: SessionDep,
    _: BackupPermissions.READ.requiere,
) -> BackupSettingsRead:
    row = get_or_404(session, BackupSettings, item_id, _SETTINGS_NOT_FOUND)
    return serialize(BackupSettingsRead, row)


@router.patch("/backup-settings/{item_id}", response_model=BackupSettingsRead)
def update_backup_settings(
    item_id: UUID,
    payload: BackupSettingsUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BackupPermissions.CONFIGURE.requiere,
) -> BackupSettingsRead:
    """Edita la configuración. Reglas de fondo: zona IANA real, recipient de age
    UTILIZABLE (se valida invocando age), y ``enabled=true`` sólo con la
    configuración completa. Cambios de horario recalculan ``next_run_at``."""
    row = get_or_404(session, BackupSettings, item_id, _SETTINGS_NOT_FOUND)
    data = payload.model_dump(exclude_unset=True)

    if "timezone" in data:
        try:
            backups.validate_timezone_name(data["timezone"])
        except ValueError as error:
            api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_timezone", str(error))
    if "filename_prefix" in data:
        try:
            backups.validate_filename_prefix(data["filename_prefix"])
        except ValueError as error:
            api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_filename_prefix", str(error))
    if "age_recipient" in data and data["age_recipient"] is not None:
        try:
            validate_age_recipient(data["age_recipient"])
        except BackupCryptoError as error:
            api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, error.code, error.summary)
        row.age_recipient_fingerprint = age_recipient_fingerprint(data["age_recipient"])

    for field, value in data.items():
        setattr(row, field, value)

    if row.enabled:
        missing = backups.missing_configuration(row)
        if missing:
            api_error(
                status.HTTP_409_CONFLICT,
                "configuration_incomplete",
                "No se pueden activar los respaldos; falta: " + ", ".join(sorted(missing)) + ".",
            )

    # El horario editable gobierna el próximo respaldo: cualquier cambio relevante
    # (o la activación) recalcula next_run_at; deshabilitado no programa nada.
    if row.enabled:
        row.next_run_at = backups.calculate_next_run_at(
            utc_now(), row.timezone, row.daily_time
        )
    else:
        row.next_run_at = None

    row.updated_by = current_user.id
    session.add(row)
    session.commit()
    session.refresh(row)
    return serialize(BackupSettingsRead, row)


@router.post(
    "/backup-settings/{item_id}/connect-drive", response_model=ConnectDriveResponse
)
def connect_drive(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: BackupPermissions.CONFIGURE.requiere,
) -> ConnectDriveResponse:
    get_or_404(session, BackupSettings, item_id, _SETTINGS_NOT_FOUND)
    try:
        url = backups.start_drive_connection(session, current_user.id)
    except backups.BackupPermanentError as error:
        api_error(status.HTTP_409_CONFLICT, error.code, error.summary)
    session.commit()
    return ConnectDriveResponse(authorization_url=url)


@router.get("/backups/google-drive/callback")
def google_drive_callback(
    session: SessionDep,
    _: BackupPermissions.CONFIGURE.requiere,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Callback OAuth de Google. Redirige a la pantalla de respaldos del frontend con
    un resultado NO sensible (?drive=connected|error)."""
    if error or not code or not state:
        # El usuario canceló el consent o Google reportó error: sin cambios de estado.
        return RedirectResponse(
            url=f"{_FRONTEND_BACKUPS_PATH}?drive=error", status_code=status.HTTP_302_FOUND
        )
    try:
        backups.complete_drive_connection(session, state=state, code=code)
        session.commit()
    except backups.BackupPermanentError:
        session.rollback()
        # El motivo exacto queda en logs; a la URL sólo viaja el desenlace.
        logger.warning("drive_oauth_callback_failed")
        return RedirectResponse(
            url=f"{_FRONTEND_BACKUPS_PATH}?drive=error", status_code=status.HTTP_302_FOUND
        )
    return RedirectResponse(
        url=f"{_FRONTEND_BACKUPS_PATH}?drive=connected", status_code=status.HTTP_302_FOUND
    )


@router.post(
    "/backup-settings/{item_id}/disconnect-drive", response_model=BackupSettingsRead
)
def disconnect_drive(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: BackupPermissions.CONFIGURE.requiere,
) -> BackupSettingsRead:
    get_or_404(session, BackupSettings, item_id, _SETTINGS_NOT_FOUND)
    row = backups.disconnect_drive(session, current_user.id)
    session.commit()
    session.refresh(row)
    return serialize(BackupSettingsRead, row)


@router.post("/backup-settings/{item_id}/run-now", response_model=BackupRunRead)
async def run_backup_now(
    item_id: UUID,
    session: SessionDep,
    _: BackupPermissions.CONFIGURE.requiere,
) -> BackupRunRead:
    """Encola un respaldo manual y despierta el tick (si el broker no está arriba, el
    tick del siguiente minuto lo toma igual: la cola es la verdad)."""
    row = get_or_404(session, BackupSettings, item_id, _SETTINGS_NOT_FOUND)
    missing = backups.missing_configuration(row)
    if missing:
        api_error(
            status.HTTP_409_CONFLICT,
            "configuration_incomplete",
            "No se puede respaldar; falta: " + ", ".join(sorted(missing)) + ".",
        )
    run = backups.enqueue_manual_run(session)
    session.commit()
    session.refresh(run)

    try:
        from backend.app.jobs.tasks.backups import backups_tick

        await backups_tick.kiq()
    except Exception:
        # No fatal: el run ya es durable y el tick programado lo procesará.
        logger.warning("backups_tick_kick_failed run_id=%s", run.id)

    return serialize(BackupRunRead, run)


@router.get("/backup-runs", response_model=OffsetPage[BackupRunListItem])
def list_backup_runs(
    session: SessionDep,
    query: Annotated[BACKUP_RUNS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: BackupPermissions.READ.requiere,
) -> OffsetPage[BackupRunListItem]:
    return paginate_resource(BACKUP_RUNS, session, query, stmt=select(BackupRun))


@router.get("/backup-runs/{item_id}", response_model=BackupRunRead)
def get_backup_run(
    item_id: UUID,
    session: SessionDep,
    _: BackupPermissions.READ.requiere,
) -> BackupRunRead:
    row = session.get(BackupRun, item_id)
    if row is None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _RUN_NOT_FOUND)
    return serialize(BackupRunRead, row)
