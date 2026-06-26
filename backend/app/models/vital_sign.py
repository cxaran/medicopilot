import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base


class VitalSign(Base):
    """Registro de signos vitales medidos durante una consulta médica."""

    __tablename__ = "vital_signs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta relacionada con la medición de signos vitales.",
    )
    measured_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        comment="Fecha y hora de medición de signos vitales.",
    )
    weight_kg: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 2), nullable=True, comment="Peso en kilogramos."
    )
    height_cm: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True, comment="Talla en centímetros."
    )
    temperature_c: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(4, 1), nullable=True, comment="Temperatura en grados Celsius."
    )
    systolic_bp: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Presión arterial sistólica."
    )
    diastolic_bp: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Presión arterial diastólica."
    )
    heart_rate_bpm: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Frecuencia cardiaca en latidos por minuto."
    )
    respiratory_rate_rpm: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Frecuencia respiratoria por minuto."
    )
    oxygen_saturation: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 2), nullable=True, comment="Saturación de oxígeno en porcentaje."
    )
    capillary_glucose: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(6, 2), nullable=True, comment="Glucosa capilar, si aplica."
    )
    pain_scale: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, comment="Escala de dolor de 0 a 10."
    )
    observations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Observaciones sobre la medición."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro de los signos vitales.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró los signos vitales.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última edición, mientras la consulta esté en borrador.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que editó los signos vitales.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica restringida.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente los signos vitales.",
    )

    consultation = relationship("Consultation", back_populates="vital_signs")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        CheckConstraint(
            "pain_scale IS NULL OR (pain_scale >= 0 AND pain_scale <= 10)",
            name="pain_scale_range",
        ),
        Index("ix_vital_signs_consultation", "consultation_id"),
        Index("ix_vital_signs_measured_at", "measured_at"),
        Index("ix_vital_signs_consultation_measured_at", "consultation_id", "measured_at"),
    )
