"""Configuración del SISTEMA (singleton editable por administradores).

Hogar persistente de la política de plataforma que antes vivía sólo en variables de
entorno: el backend es la fuente de verdad y los cambios quedan auditados (quién y
cuándo). Fase 1: registro público, dominio base verificado y nombre institucional.
Fases siguientes añaden columnas TIPADAS por dominio (correo, proveedores de IA);
nunca un key-value genérico.

Patrón singleton idéntico a ``BackupSettings``: una fila garantizada por CHECK sobre
``singleton_key``. La fila se siembra en la migración (importando el valor vigente de
``REGISTRATION_ENABLED`` una sola vez) y en el bootstrap HTTP se actualiza con las
decisiones del asistente.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base


class SystemSettings(Base):
    """Fila ÚNICA de configuración del sistema (política editable en runtime)."""

    __tablename__ = "system_settings"
    __table_args__ = (
        CheckConstraint("singleton_key = true", name="system_settings_singleton"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    singleton_key: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        unique=True,
        comment="Siempre true: fuerza una sola fila de configuración del sistema.",
    )

    public_registration_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment=(
            "Política de registro público (auto-registro por correo). Efectiva sólo "
            "si el despliegue lo permite (gate REGISTRATION_ALLOWED del entorno)."
        ),
    )

    app_base_url: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment=(
            "Dominio base confirmado de la instalación (https://…), usado para "
            "calcular redirect URIs. Se AÑADE a los orígenes confiables del entorno, "
            "nunca los reemplaza."
        ),
    )
    app_base_url_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Momento (UTC) en que el dominio base se verificó; lo escribe el backend.",
    )

    institution_name: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="Nombre del consultorio/institución (membrete y encabezados).",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, onupdate=func.now()
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Último administrador que modificó la configuración.",
    )
