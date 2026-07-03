"""Servicio del singleton de configuración del sistema.

La política vive en la base de datos (fuente de verdad, editable y auditada); las
variables de entorno conservan sólo los GATES de despliegue que la UI no puede
saltar (``registration_allowed_effective``). El checklist de puesta en marcha es
DERIVADO del estado real — nunca persiste progreso propio, así no puede
desincronizarse de la configuración.
"""

import uuid
from dataclasses import dataclass
from typing import Literal, Optional

from sqlmodel import Session, select

from backend.app.core.settings import settings
from backend.app.models.ai_provider_credential import AiProviderCredential
from backend.app.models.backup import BackupSettings
from backend.app.models.doctor import Doctor
from backend.app.models.setup import PlatformSetup
from backend.app.models.system_settings import SystemSettings


def get_system_settings(session: Session, *, for_update: bool = False) -> SystemSettings:
    """Fila singleton (la migración la siembra; si falta, se crea con defaults)."""
    statement = select(SystemSettings)
    if for_update:
        statement = statement.with_for_update()
    row = session.exec(statement).first()
    if row is None:
        row = SystemSettings()
        session.add(row)
        session.flush()
    return row


def is_public_registration_enabled(session: Session) -> bool:
    """Política EFECTIVA de registro público: gate de despliegue AND política
    persistida. Producción con el gate cerrado nunca abre registro, diga lo que
    diga la base de datos."""
    if not settings.registration_allowed_effective:
        return False
    return get_system_settings(session).public_registration_enabled


ChecklistStatus = Literal["complete", "pending", "not_applicable"]


@dataclass(frozen=True)
class ChecklistItem:
    """Ítem del checklist de puesta en marcha (estado DERIVADO)."""

    key: str
    title: str
    status: ChecklistStatus
    detail: str


def build_setup_checklist(
    session: Session, *, current_user_id: Optional[uuid.UUID] = None
) -> tuple[list[ChecklistItem], bool]:
    """(ítems, dismissed). Cada estado se deriva de la configuración real."""
    system = get_system_settings(session)

    items: list[ChecklistItem] = []

    items.append(
        ChecklistItem(
            key="institution",
            title="Datos del consultorio",
            status="complete" if system.institution_name else "pending",
            detail=(
                system.institution_name
                if system.institution_name
                else "Configura el nombre de la institución para membretes y documentos."
            ),
        )
    )

    items.append(
        ChecklistItem(
            key="registration",
            title="Registro público",
            status="complete",  # siempre es una decisión tomada (default: cerrado)
            detail=(
                "Habilitado"
                if is_public_registration_enabled(session)
                else "Deshabilitado (los administradores crean las cuentas)."
            ),
        )
    )

    items.append(
        ChecklistItem(
            key="domain",
            title="Dominio de la instalación",
            status="complete" if system.app_base_url_verified_at else "pending",
            detail=(
                system.app_base_url or "Confirma el dominio para calcular las URLs de OAuth."
            ),
        )
    )

    # Correo: en entorno local Mailpit funciona solo (no exige acción); fuera de
    # local, mientras el correo no sea configurable en runtime (fase siguiente), el
    # transporte del entorno es la decisión vigente.
    items.append(
        ChecklistItem(
            key="email",
            title="Correo saliente",
            status="complete" if settings.environment == "local" else "pending",
            detail=(
                "Mailpit automático (entorno de desarrollo)."
                if settings.environment == "local"
                else "Configura el proveedor de correo del despliegue."
            ),
        )
    )

    backup = session.exec(select(BackupSettings)).first()
    backups_ready = backup is not None and backup.enabled
    items.append(
        ChecklistItem(
            key="backups",
            title="Respaldos a Google Drive",
            status="complete" if backups_ready else "pending",
            detail=(
                "Respaldo diario habilitado."
                if backups_ready
                else "Conecta Google Drive y habilita el respaldo diario."
            ),
        )
    )

    has_ai_credential = (
        session.exec(
            select(AiProviderCredential).where(
                AiProviderCredential.is_active == True,  # noqa: E712
                AiProviderCredential.deleted_at == None,  # noqa: E711
            )
        ).first()
        is not None
    )
    items.append(
        ChecklistItem(
            key="ai_providers",
            title="Proveedor de IA del copiloto",
            status="complete" if has_ai_credential else "pending",
            detail=(
                "Hay al menos una credencial de proveedor activa."
                if has_ai_credential
                else "Agrega una credencial de proveedor en tu cuenta para usar el copiloto."
            ),
        )
    )

    # Perfil de MÉDICO: los flujos clínicos (consultas/citas/finalizar) exigen una
    # fila Doctor vinculada al usuario. En una instalación unipersonal admin=médico
    # este es el requisito real de uso, no un permiso.
    own_doctor = (
        session.exec(
            select(Doctor).where(
                Doctor.user_id == current_user_id,
                Doctor.deleted_at == None,  # noqa: E711
            )
        ).first()
        if current_user_id is not None
        else None
    )
    any_doctor = session.exec(
        select(Doctor).where(Doctor.deleted_at == None)  # noqa: E711
    ).first()
    if own_doctor is not None:
        doctor_status: ChecklistStatus = "complete"
        doctor_detail = f"Tu perfil de médico está listo ({own_doctor.professional_name})."
    elif any_doctor is not None:
        doctor_status = "not_applicable"
        doctor_detail = "Hay médicos registrados; tu usuario no tiene perfil clínico propio."
    else:
        doctor_status = "pending"
        doctor_detail = "Registra el perfil de médico para poder atender consultas."
    items.append(
        ChecklistItem(
            key="doctor_profile",
            title="Perfil de médico",
            status=doctor_status,
            detail=doctor_detail,
        )
    )

    setup = session.get(PlatformSetup, 1)
    dismissed = setup is not None and setup.onboarding_dismissed_at is not None
    return items, dismissed


def dismiss_onboarding(session: Session) -> None:
    """Marca el checklist como descartado (no vuelve a mostrarse como banner)."""
    from backend.app.utils.utc_now import utc_now

    setup = session.get(PlatformSetup, 1)
    if setup is not None and setup.onboarding_dismissed_at is None:
        setup.onboarding_dismissed_at = utc_now()
        session.add(setup)


def apply_bootstrap_choices(
    session: Session,
    *,
    public_registration_enabled: bool,
    institution_name: Optional[str],
) -> None:
    """Aplica al singleton las decisiones tomadas en el asistente de bootstrap."""
    row = get_system_settings(session, for_update=True)
    row.public_registration_enabled = public_registration_enabled
    if institution_name:
        row.institution_name = institution_name.strip()
    session.add(row)
