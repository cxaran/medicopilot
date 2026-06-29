import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from backend.app.models.enums import AiCredentialType, AiProvider
from backend.app.schemas.base import ApiSchema, ApiWriteSchema


class ConnectionTicketRead(ApiSchema):
    """Ticket de conexión al Agent Gateway emitido a un usuario con sesión válida.

    ``ticket`` es un JWT HS256 corto y firmado; ``expires_at`` es su vencimiento
    (UTC). No incluye datos clínicos, permisos ni secretos.
    """

    ticket: str
    expires_at: datetime


class CredentialLeaseRequest(ApiWriteSchema):
    """Solicitud server-to-server de arriendo de credencial (endpoint interno)."""

    user_id: uuid.UUID
    provider: AiProvider
    # Desambigua cuando el usuario tiene MÁS de una credencial para el mismo provider (p. ej.
    # OpenAI con API key Y OAuth de ChatGPT): el gateway pide la que corresponde al provider id
    # que enruta (openai → api_key, openai_codex → oauth). None = cualquiera activa (compat).
    credential_type: Optional[AiCredentialType] = None


class CredentialLeaseResponse(ApiSchema):
    """Arriendo de credencial: el ``secret`` es la API key DESCIFRADA, de vida corta.

    Solo lo consume el Agent Gateway por el puente interno; nunca el navegador. El
    secreto nunca se loguea.
    """

    lease_id: uuid.UUID
    secret: str
    expires_at: datetime
    default_model: Optional[str] = None
    # Id de cuenta ChatGPT: solo se rellena para credenciales OAuth/Codex (el Gateway lo
    # envía como header chatgpt-account-id). None para API keys. NO es secreto.
    account_id: Optional[str] = None


class OAuthStartResponse(ApiSchema):
    """Inicio del flujo OAuth: URL de autorización y ``state`` anti-CSRF.

    El navegador redirige a ``authorize_url``; al volver con el ``code`` debe enviar
    el mismo ``state`` a ``/complete``. No incluye el ``code_verifier`` (server-side).
    """

    authorize_url: str
    state: str


class OAuthCompleteRequest(ApiWriteSchema):
    """Callback del flujo OAuth: ``code`` y ``state`` recibidos del proveedor."""

    code: str = Field(min_length=1, title="Código de autorización")
    state: str = Field(min_length=1, title="State")


class OAuthStatusResponse(ApiSchema):
    """Estado de la conexión OAuth del usuario. NUNCA incluye tokens."""

    connected: bool
    account_id: Optional[str] = None
    expires_at: Optional[datetime] = None
