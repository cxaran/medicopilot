import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ClinicalCodeSystem, enum_values


class ClinicalCode(Base):
    """Código clínico de apoyo a la codificación (CIE-10, LOINC o ATC).

    Catálogo pragmático y EXTENSIBLE (no es un servidor de terminología completo): un
    término legible asociado a un código real de un sistema reconocido, para asistir al
    médico cuando codifica un diagnóstico, un analito de laboratorio o un medicamento.
    La búsqueda de un término desconocido devuelve vacío; nunca se inventa un código.
    La baja es lógica; la pareja (sistema, código) es única entre registros vigentes.
    """

    __tablename__ = "clinical_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    system: Mapped[ClinicalCodeSystem] = mapped_column(
        SAEnum(
            ClinicalCodeSystem,
            name="clinical_code_system",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Sistema de codificación: cie10 (diagnósticos), loinc (laboratorio) o atc (medicamentos).",
    )
    code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Código real dentro del sistema (p. ej. 'E11.9' en CIE-10, '4548-4' en LOINC).",
    )
    display_term: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Término legible en español asociado al código (campo de búsqueda).",
    )
    parent_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Código padre dentro del mismo sistema, si el código pertenece a una jerarquía.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del código.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el código.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización del código.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó el código.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del código.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el código.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # El código y el término no pueden quedar vacíos tras recortar espacios.
        CheckConstraint("length(trim(code)) > 0", name="clinical_code_not_blank"),
        CheckConstraint(
            "length(trim(display_term)) > 0", name="clinical_code_display_term_not_blank"
        ),
        # Unicidad parcial de (sistema, código): sólo entre registros vigentes, de modo
        # que una baja lógica no impide volver a registrar el mismo código.
        Index(
            "uq_clinical_codes_system_code_active",
            "system",
            "code",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_clinical_codes_system", "system"),
    )
