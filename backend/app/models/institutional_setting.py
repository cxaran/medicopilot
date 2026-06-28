import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import SettingCategory, enum_values


class InstitutionalSetting(Base):
    """Configuración institucional: una regla clínica configurable (umbral, meta, intervalo).

    Permite que la lógica clínica (p. ej. los umbrales de bandera roja de la cohorte)
    lea valores configurables por la institución en lugar de constantes fijas. El valor
    se guarda como JSON y su forma esperada depende de la ``category`` (se tipa en la capa
    de schema/servicio). La baja es lógica; la ``key`` es única entre registros vigentes.
    """

    __tablename__ = "institutional_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    key: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Clave única de la configuración (p. ej. 'vital_redflag.systolic_bp').",
    )
    category: Mapped[SettingCategory] = mapped_column(
        SAEnum(
            SettingCategory,
            name="setting_category",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Categoría/ámbito de la configuración: vital_threshold, lab_target, follow_up o protocol.",
    )
    value: Mapped[dict[str, Any]] = mapped_column(
        # JSONB en PostgreSQL (producción) y JSON genérico en otros dialectos (SQLite de pruebas).
        JSON().with_variant(JSONB(), "postgresql"),
        nullable=False,
        comment="Valor JSON de la configuración; su forma depende de la categoría.",
    )
    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Descripción en español de la configuración y el valor por defecto razonado.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la configuración.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó la configuración.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización de la configuración.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó la configuración.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la configuración.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la configuración.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # Unicidad parcial de ``key``: sólo entre registros vigentes (no eliminados),
        # de modo que una baja lógica no impide volver a registrar la misma clave.
        Index(
            "uq_institutional_settings_key_active",
            "key",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_institutional_settings_category", "category"),
    )
