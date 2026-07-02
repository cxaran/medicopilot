"""Adaptador ÚNICO de Google Drive para respaldos (scope drive.file).

Nadie más llama a googleapiclient: ni el router, ni la tarea, ni backup_service tocan
la API de Google directamente. El scope ``drive.file`` sólo da acceso a archivos que la
propia app crea — nunca a todo el Drive del administrador. Se usa una carpeta VISIBLE
creada por la app ("MediCopilot Backups"), no ``appDataFolder``.

Errores: se clasifican aquí en dos excepciones SEGURAS (sin texto crudo de Google, sin
tokens): ``DriveTemporaryError`` (red/5xx/429: reintentable) y ``DriveReauthError``
(credencial inválida/revocada: detener reintentos hasta reconectar).
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

BACKUP_FOLDER_NAME = "MediCopilot Backups"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

# appProperties con las que se reconcilian subidas tras un timeout (idempotencia).
_PROP_RUN_ID = "medicopilot_backup_run_id"
_PROP_SHA256 = "medicopilot_sha256"


class DriveTemporaryError(Exception):
    """Fallo temporal (red, 5xx, 429): el run reintenta con backoff."""

    def __init__(self, code: str, summary: str) -> None:
        super().__init__(summary)
        self.code = code
        self.summary = summary


class DriveReauthError(Exception):
    """La credencial dejó de servir (revocada/expirada): reintentos DETENIDOS hasta
    que el administrador reconecte Drive."""

    def __init__(self, code: str, summary: str) -> None:
        super().__init__(summary)
        self.code = code
        self.summary = summary


@dataclass(frozen=True)
class RemoteBackupFile:
    """Proyección mínima de un archivo remoto (para reconciliación y retención)."""

    file_id: str
    name: str
    size_bytes: Optional[int]
    sha256: Optional[str]
    run_id: Optional[str]


def _classify_http_error(error: Exception) -> Exception:
    """Traduce errores del cliente de Google a nuestras excepciones seguras."""
    from google.auth.exceptions import RefreshError  # import perezoso (ver abajo)
    from googleapiclient.errors import HttpError

    if isinstance(error, RefreshError):
        return DriveReauthError(
            "drive_needs_reauth",
            "Google rechazó la credencial guardada; reconecta Google Drive.",
        )
    if isinstance(error, HttpError):
        status = error.resp.status if error.resp is not None else None
        if status in (401, 403):
            # 403 también cubre insufficientPermissions/appNotAuthorized: requiere
            # intervención del administrador, no reintento ciego.
            return DriveReauthError(
                "drive_needs_reauth",
                "Google Drive rechazó el acceso; reconecta Google Drive.",
            )
        if status == 429 or (status is not None and status >= 500):
            return DriveTemporaryError(
                "drive_unavailable", f"Google Drive no disponible (HTTP {status})."
            )
        return DriveTemporaryError(
            "drive_request_failed", f"La petición a Google Drive falló (HTTP {status})."
        )
    return DriveTemporaryError(
        "drive_network_error", "No se pudo contactar a Google Drive."
    )


class GoogleDriveBackupService:
    """Cliente pequeño de Drive autenticado con el refresh token de la conexión.

    Los imports de googleapiclient son PEREZOSOS (dentro de métodos): importar el
    módulo no exige tener las libs cargadas en procesos que no respaldan, y los tests
    unitarios pueden sustituir ``_files()`` sin red.
    """

    def __init__(
        self,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str,
    ) -> None:
        self._refresh_token = refresh_token
        self._client_id = client_id
        self._client_secret = client_secret
        self._service: Any = None

    def _drive(self) -> Any:
        if self._service is None:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build

            credentials = Credentials(
                token=None,
                refresh_token=self._refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=self._client_id,
                client_secret=self._client_secret,
                scopes=[DRIVE_SCOPE],
            )
            # cache_discovery=False: sin caché en disco (imagen de solo lectura).
            self._service = build(
                "drive", "v3", credentials=credentials, cache_discovery=False
            )
        return self._service

    def _files(self) -> Any:
        return self._drive().files()

    # -- Carpeta ---------------------------------------------------------------

    def create_folder(self) -> str:
        """Crea la carpeta visible de respaldos y devuelve su id."""
        try:
            created = (
                self._files()
                .create(
                    body={
                        "name": BACKUP_FOLDER_NAME,
                        "mimeType": "application/vnd.google-apps.folder",
                    },
                    fields="id",
                )
                .execute()
            )
        except Exception as error:  # clasificado: nunca burbujea texto crudo
            raise _classify_http_error(error) from error
        return str(created["id"])

    def validate_folder(self, folder_id: str) -> bool:
        """¿La carpeta sigue existiendo, accesible y fuera de la papelera?"""
        try:
            found = (
                self._files()
                .get(fileId=folder_id, fields="id, trashed, mimeType")
                .execute()
            )
        except Exception as error:
            classified = _classify_http_error(error)
            if isinstance(classified, DriveReauthError):
                raise classified from error
            # 404/no accesible: no es reauth; simplemente ya no sirve esa carpeta.
            return False
        return (
            not bool(found.get("trashed"))
            and found.get("mimeType") == "application/vnd.google-apps.folder"
        )

    def ensure_folder(self, folder_id: Optional[str]) -> str:
        """Valida la carpeta guardada o crea una nueva (reconexión)."""
        if folder_id and self.validate_folder(folder_id):
            return folder_id
        return self.create_folder()

    # -- Archivos ----------------------------------------------------------------

    def find_backup_by_run_id(self, folder_id: str, run_id: str) -> Optional[RemoteBackupFile]:
        """Busca en la carpeta un respaldo ya subido para este run (idempotencia)."""
        query = (
            f"'{folder_id}' in parents and trashed = false "
            f"and appProperties has {{ key='{_PROP_RUN_ID}' and value='{run_id}' }}"
        )
        try:
            response = (
                self._files()
                .list(
                    q=query,
                    fields="files(id, name, size, appProperties)",
                    pageSize=5,
                )
                .execute()
            )
        except Exception as error:
            raise _classify_http_error(error) from error
        files = response.get("files", [])
        if not files:
            return None
        first = files[0]
        properties = first.get("appProperties") or {}
        size_raw = first.get("size")
        return RemoteBackupFile(
            file_id=str(first["id"]),
            name=str(first.get("name", "")),
            size_bytes=int(size_raw) if size_raw is not None else None,
            sha256=properties.get(_PROP_SHA256),
            run_id=properties.get(_PROP_RUN_ID),
        )

    def upload_backup(
        self,
        *,
        folder_id: str,
        file_path: Path,
        file_name: str,
        run_id: str,
        sha256: str,
    ) -> str:
        """Sube el archivo cifrado (resumable) y devuelve el id remoto."""
        from googleapiclient.http import MediaFileUpload

        media = MediaFileUpload(
            str(file_path), mimetype="application/octet-stream", resumable=True
        )
        try:
            created = (
                self._files()
                .create(
                    body={
                        "name": file_name,
                        "parents": [folder_id],
                        "appProperties": {
                            _PROP_RUN_ID: run_id,
                            _PROP_SHA256: sha256,
                        },
                    },
                    media_body=media,
                    fields="id",
                )
                .execute()
            )
        except Exception as error:
            raise _classify_http_error(error) from error
        return str(created["id"])

    def delete_backup(self, file_id: str) -> None:
        """Borra un respaldo remoto (retención). Un 404 se trata como ya borrado."""
        from googleapiclient.errors import HttpError

        try:
            self._files().delete(fileId=file_id).execute()
        except HttpError as error:
            if error.resp is not None and error.resp.status == 404:
                return
            raise _classify_http_error(error) from error
        except Exception as error:
            raise _classify_http_error(error) from error
