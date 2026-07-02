from typing import Literal
from pydantic_settings import BaseSettings
from pydantic import SecretStr, computed_field, model_validator, PostgresDsn
from pydantic_core import MultiHostUrl
from fastapi_mail import ConnectionConfig
from functools import lru_cache
from typing_extensions import Self

from backend.app.core.csrf import normalize_browser_origin


class Settings(BaseSettings):
    project_name: str = "MedicoPilot"
    environment: Literal["local", "staging", "production"] = "local"

    secret_key: SecretStr
    algorithm: str = "HS256"
    access_token_expire_minutes: int
    email_token_expire_minutes: int
    trys_before_lock: int

    # Allowlist explícita de orígenes de navegador confiables (CSV) para mutaciones
    # autenticadas por cookie. Dev: localhost. Producción: debe definirse por env.
    trusted_browser_origins: str = "http://localhost:3000"

    @computed_field
    @property
    def trusted_origins(self) -> frozenset[str]:
        normalized: set[str] = set()
        for raw in self.trusted_browser_origins.split(","):
            origin = normalize_browser_origin(raw.strip())
            if origin is not None:
                normalized.add(origin)
        return frozenset(normalized)

    @model_validator(mode="after")
    def _require_trusted_origins_in_production(self) -> Self:
        if self.environment == "production":
            origins = self.trusted_origins
            if not origins:
                raise ValueError(
                    "trusted_browser_origins debe definirse con orígenes HTTPS válidos en producción."
                )
            if any(not origin.startswith("https://") for origin in origins):
                raise ValueError(
                    "trusted_browser_origins debe contener únicamente orígenes HTTPS en producción."
                )
        return self

    redis_host: str
    redis_port: int
    redis_db: int

    # Política de archivos clínicos (clinical_documents). El binario se almacena en
    # PostgreSQL (LargeBinary); el límite acota memoria y tamaño de fila. La allowlist
    # de MIME es CSV y se evalúa contra el Content-Type declarado (no se infiere). Ver
    # services/clinical_documents.py y docs de la vertical para los límites operativos.
    clinical_document_max_size_bytes: int = 26_214_400  # 25 MiB
    clinical_document_allowed_mime_types: str = (
        "application/pdf,"
        "image/png,image/jpeg,image/webp,image/tiff,"
        "application/dicom,"
        "text/plain,"
        # Audio de consulta para transcripción (F-MEDIOS fase 2).
        "audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm"
    )

    @computed_field
    @property
    def clinical_document_allowed_mimes(self) -> frozenset[str]:
        return frozenset(
            mime.strip().lower()
            for mime in self.clinical_document_allowed_mime_types.split(",")
            if mime.strip()
        )

    # Zona horaria de aplicación (IANA) para la semántica de calendario de los filtros
    # de fecha. Default determinista UTC; dev/E2E pueden fijar p. ej. America/Monterrey.
    # Nunca se depende de la TZ del host, contenedor, navegador o PostgreSQL.
    application_timezone: str = "UTC"

    @model_validator(mode="after")
    def _validate_application_timezone(self) -> Self:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(self.application_timezone)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(
                f"application_timezone inválida (debe ser IANA ZoneInfo): {self.application_timezone!r}"
            ) from error
        return self

    # Rate limiting de rutas públicas de auth (ver security/rate_limit.py). Buckets
    # como "limit/window_seconds"; configurables por ambiente. ``fail_open`` solo se
    # respeta fuera de producción. ``trusted_proxies`` es CSV de IPs de proxy.
    rate_limit_enabled: bool = True
    rate_limit_fail_open: bool = False
    rate_limit_trusted_proxies: str = ""
    rate_limit_login_ip: str = "10/900"
    rate_limit_login_identity: str = "5/900"
    rate_limit_register_request_ip: str = "5/3600"
    rate_limit_register_request_identity: str = "3/3600"
    rate_limit_register_complete_ip: str = "10/900"
    rate_limit_forgot_ip: str = "5/3600"
    rate_limit_forgot_identity: str = "3/3600"
    rate_limit_reset_ip: str = "10/900"
    rate_limit_reset_token: str = "5/900"
    rate_limit_bootstrap_ip: str = "5/900"
    # Arriendo interno de credencial (server-to-server): límite por IP del llamador.
    rate_limit_internal_lease_ip: str = "60/60"

    # Política pública de auth. MedicoPilot no asume signup público: el registro
    # está deshabilitado por defecto y debe habilitarse explícitamente por ambiente.
    # Al completarse un registro, el usuario queda ACTIVO pero SIN roles (sin acceso
    # hasta que un administrador le asigne uno) y SIN sesión automática.
    registration_enabled: bool = False
    password_reset_enabled: bool = True

    # Ticket de conexión al Agent Gateway (puente firmado y efímero FastAPI<->Gateway).
    # FastAPI es la autoridad clínica y NO almacena credenciales de proveedor de IA; el
    # ticket solo prueba que un usuario con sesión válida autorizó abrir la conexión.
    # Secreto DEDICADO (dominio separado del secret_key de sesión), recomendado en
    # producción. Si no se configura se deriva del secret_key (con prefijo de dominio)
    # para no acoplar dev/test a una variable extra. TTL corto, en rango 60-120s.
    agent_gateway_ticket_secret: SecretStr | None = None
    agent_gateway_ticket_ttl_seconds: int = 90

    # Clave DEDICADA (Fernet, urlsafe base64 de 32 bytes) para cifrar en reposo los
    # secretos de credenciales de proveedor de IA. Sensible: nunca se loguea. Generar:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ai_credential_key: SecretStr | None = None

    # Puente INTERNO server-to-server de arriendo de credencial (B4). Secreto compartido
    # con el Agent Gateway (DISTINTO del ticket): el Gateway lo envía en X-Internal-Auth
    # al endpoint /api/v1/internal/agent/credential-lease, que devuelve el secreto
    # DESCIFRADO de vida corta. Endpoint interno: en despliegue va detrás de red interna,
    # nunca expuesto al navegador. Sensible: nunca se loguea.
    agent_gateway_internal_secret: SecretStr | None = None
    # TTL corto del arriendo (segundos): el secreto descifrado vive poco en el Gateway.
    agent_gateway_lease_ttl_seconds: int = 120

    # Flujo OAuth browser-callback PKCE para conectar la cuenta ChatGPT Plus/Codex del
    # médico (B10). FastAPI guarda el perfil OAuth CIFRADO y, en el arriendo interno,
    # devuelve el access token vigente (refrescándolo si vence). No es device-code.
    # ``client_id`` y ``redirect_uri`` deben configurarse para habilitar el flujo; si
    # faltan, los endpoints responden 503. URLs por defecto apuntan a auth.openai.com.
    openai_oauth_client_id: str | None = None
    openai_oauth_authorize_url: str = "https://auth.openai.com/oauth/authorize"
    openai_oauth_token_url: str = "https://auth.openai.com/oauth/token"
    openai_oauth_redirect_uri: str | None = None
    openai_oauth_scope: str = "openid profile email offline_access"
    # Margen (segundos) antes del vencimiento para refrescar el access token de forma
    # proactiva en el arriendo, de modo que el Gateway nunca reciba un token al límite.
    openai_oauth_refresh_skew_seconds: int = 60

    # Investigación PubMed (B13): proxy server-side a las E-utilities de NCBI. NO toca el
    # expediente clínico. La API key de NCBI es opcional (sube el límite de tasa); es
    # sensible y nunca se loguea. base_url y timeout configurables por ambiente.
    ncbi_base_url: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    ncbi_api_key: SecretStr | None = None
    ncbi_timeout_seconds: float = 10.0

    # Proveedor de transcripción de voz a texto (STT) para audio de consulta (F-MEDIOS
    # fase 2). CONFIGURABLE y SWAPPABLE igual que el proxy de PubMed (B13): si no hay URL
    # configurada, la transcripción responde "no disponible" (nunca se fabrica un texto).
    # Contrato: POST con el binario de audio -> JSON {"text": "..."}. Para pruebas/QA se
    # admite el esquema sentinela ``stub://`` que devuelve un texto fijo de PRUEBA (no es
    # STT real); un proveedor real se enchufa cambiando SOLO esta URL. La API key (si la
    # hay) es sensible y nunca se loguea.
    stt_provider_url: str | None = None
    stt_api_key: SecretStr | None = None
    stt_timeout_seconds: float = 60.0

    # Fuente de FARMACOLOGÍA para el cruce fármaco-alergia de las verificaciones de
    # calidad/seguridad (cluster quality_checks, fase 2). CONFIGURABLE y SWAPPABLE igual que
    # el STT/PubMed: resuelve un nombre de fármaco o alérgeno a sus ingredientes/clases. Si NO
    # hay URL configurada o no responde, el cruce fármaco-alergia reporta "no disponible"
    # (NUNCA inventa una coincidencia ni concluye ausencia de alergias). Contrato:
    # POST <url> JSON {"name": "<fármaco|alérgeno>"} -> {"ingredients": [...], "classes": [...]}
    # (en minúsculas, normalizado). Para pruebas/QA se admite el esquema sentinela ``stub://``
    # que resuelve un PUÑADO de fármacos de PRUEBA; un servidor real (p. ej. el MCP de
    # farmacología) se enchufa cambiando SOLO esta URL. La API key, si la hay, es sensible.
    pharma_mcp_server_url: str | None = None
    pharma_mcp_api_key: SecretStr | None = None
    pharma_mcp_timeout_seconds: float = 10.0

    @model_validator(mode="after")
    def _validate_agent_gateway_ticket_ttl(self) -> Self:
        if not (60 <= self.agent_gateway_ticket_ttl_seconds <= 120):
            raise ValueError(
                "agent_gateway_ticket_ttl_seconds debe estar entre 60 y 120 segundos."
            )
        return self

    @property
    def agent_gateway_ticket_signing_secret(self) -> SecretStr:
        """Secreto efectivo para firmar/verificar el ticket de conexión.

        Usa el secreto dedicado si está configurado; en no-producción cae a una
        derivación del ``secret_key`` (con prefijo de dominio para no reutilizar el
        mismo material que la sesión). En producción el dedicado es obligatorio.
        """
        secret = self.agent_gateway_ticket_secret
        if secret is not None and secret.get_secret_value().strip():
            return secret
        return SecretStr("agent-gateway-ticket:" + self.secret_key.get_secret_value())

    # Respaldos cifrados hacia Google Drive (una sola cuenta, scope drive.file). El
    # horario/retención EDITABLES viven en la tabla backup_settings (no aquí); estos
    # settings son el interruptor global y los secretos de despliegue. Apagado por
    # defecto: la API y el worker arrancan igual que antes sin configurar nada.
    backups_enabled: bool = False
    # Artefacto de EXPLORACIÓN por respaldo (SQLite legible del mismo snapshot).
    # Apagado por defecto: no afecta instalaciones existentes.
    backup_explorer_enabled: bool = False
    backup_temp_dir: str = "/tmp/medicopilot-backups"
    backup_run_lease_minutes: int = 120
    backup_max_attempts: int = 3
    # OAuth de la app de Google (web application). El client secret NUNCA se persiste
    # en PostgreSQL ni se loguea; sólo vive en el .env del despliegue.
    google_drive_client_id: str | None = None
    google_drive_client_secret: SecretStr | None = None
    google_drive_redirect_uri: str | None = None
    # Clave Fernet DEDICADA que cifra en reposo el refresh token de Google (NO el
    # archivo del respaldo, que se cifra con age y la clave pública del administrador).
    backup_token_encryption_key: SecretStr | None = None

    postgres_user: str
    postgres_password: str
    postgres_server: str
    postgres_port: int
    postgres_db: str

    @computed_field
    @property
    def postgres_dsn(self) -> PostgresDsn:
        return PostgresDsn(
            str(
                MultiHostUrl.build(
                    scheme="postgresql+psycopg2",
                    username=self.postgres_user,
                    password=self.postgres_password,
                    host=self.postgres_server,
                    port=self.postgres_port,
                    path=self.postgres_db,
                )
            )
        )

    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: SecretStr
    smtp_from_email: str
    smtp_from_name: str
    smtp_tls: bool
    smtp_ssl: bool
    smtp_use_credentials: bool

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: SecretStr | None = None
    bootstrap_admin_name: str = "Admin"
    bootstrap_admin_last_name: str = "MedicoPilot"
    bootstrap_admin_role_name: str = "Administrador"
    bootstrap_user_role_name: str = "Usuario"
    bootstrap_setup_token: SecretStr | None = None

    @model_validator(mode="after")
    def _require_bootstrap_setup_token_in_production(self) -> Self:
        token = self.bootstrap_setup_token.get_secret_value().strip() if self.bootstrap_setup_token else ""
        if token and len(token) < 16:
            raise ValueError("bootstrap_setup_token debe tener al menos 16 caracteres.")
        if self.environment == "production" and not token:
            raise ValueError("bootstrap_setup_token es obligatorio en producción.")
        return self

    @computed_field
    @property
    def mail_config(self) -> ConnectionConfig:
        return ConnectionConfig(
            MAIL_USERNAME=self.smtp_user,
            MAIL_PASSWORD=self.smtp_password,
            MAIL_FROM=self.smtp_from_email,
            MAIL_FROM_NAME=self.smtp_from_name,
            MAIL_SERVER=self.smtp_host,
            MAIL_PORT=self.smtp_port,
            MAIL_STARTTLS=self.smtp_tls,
            MAIL_SSL_TLS=self.smtp_ssl,
            USE_CREDENTIALS=self.smtp_use_credentials,
            VALIDATE_CERTS=True,
        )

@lru_cache()
def get_settings() -> Settings:
    """
    Obtiene una instancia única y en caché de :class:`Settings`.
    """
    return Settings()  # pyright: ignore[reportCallIssue]


settings: Settings = get_settings()
