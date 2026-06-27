import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ActiveInactiveStatus, enum_values


class MedicationTemplate(Base):
    """Medicamento frecuente reutilizable por un médico."""

    __tablename__ = "medication_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Médico propietario de la plantilla de medicamento.",
    )
    medication_name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre del medicamento."
    )
    presentation: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Presentación habitual del medicamento."
    )
    default_dose: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Dosis sugerida."
    )
    default_frequency: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Frecuencia sugerida."
    )
    default_duration: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Duración sugerida."
    )
    default_instructions: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Indicaciones sugeridas."
    )
    use_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Veces que se ha reutilizado la plantilla.",
    )
    status: Mapped[ActiveInactiveStatus] = mapped_column(
        SAEnum(
            ActiveInactiveStatus,
            name="active_inactive_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ActiveInactiveStatus.ACTIVE,
        comment="Estado de la plantilla: activa o inactiva.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la plantilla.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó la plantilla.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización de la plantilla.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó la plantilla.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de eliminación lógica de la plantilla."
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la plantilla.",
    )

    doctor = relationship("Doctor", back_populates="medication_templates")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        UniqueConstraint(
            "doctor_id",
            "medication_name",
            "presentation",
            name="uq_medication_templates_doctor_medication_presentation",
        ),
        Index("ix_medication_templates_doctor", "doctor_id"),
        Index("ix_medication_templates_status", "status"),
        Index("ix_medication_templates_medication_name", "medication_name"),
    )
