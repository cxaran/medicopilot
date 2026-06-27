import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Enum as SAEnum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import (
    AiOutputStatus,
    ConsultationAiOutputType,
    enum_values,
)


class ConsultationAiOutput(Base):
    """Resultado generado por el copiloto de IA para una consulta."""

    __tablename__ = "consultation_ai_outputs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta relacionada con el resultado generado por IA.",
    )
    output_type: Mapped[ConsultationAiOutputType] = mapped_column(
        SAEnum(
            ConsultationAiOutputType,
            name="consultation_ai_output_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Tipo de resultado: nota clínica, resumen, sugerencia, borrador de indicaciones u otro.",
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Texto generado por el copiloto de IA.",
    )
    status: Mapped[AiOutputStatus] = mapped_column(
        SAEnum(
            AiOutputStatus,
            name="ai_output_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=AiOutputStatus.DRAFT,
        comment="Estado de revisión: borrador, aprobado o rechazado.",
    )
    model_name: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Modelo de IA utilizado."
    )
    model_version: Mapped[Optional[str]] = mapped_column(
        String(160),
        nullable=True,
        comment="Versión o configuración relevante del modelo utilizado.",
    )
    generation_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=True,
        comment="Metadatos técnicos mínimos de la generación.",
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha y hora de generación del resultado de IA.",
    )
    reviewed_by_doctor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Médico que revisó el resultado generado por IA.",
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha y hora de revisión del resultado generado por IA.",
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Motivo de rechazo, si aplica.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación del registro del resultado de IA.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario o proceso que solicitó la generación.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última modificación de estado del resultado de IA.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó el resultado de IA.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica restringida del resultado de IA.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el resultado de IA.",
    )

    consultation = relationship("Consultation", back_populates="ai_outputs")
    reviewed_by_doctor = relationship(
        "Doctor",
        back_populates="reviewed_ai_outputs",
        foreign_keys=[reviewed_by_doctor_id],
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_consultation_ai_outputs_consultation", "consultation_id"),
        Index("ix_consultation_ai_outputs_type", "output_type"),
        Index("ix_consultation_ai_outputs_status", "status"),
        Index("ix_consultation_ai_outputs_generated_at", "generated_at"),
        Index("ix_consultation_ai_outputs_reviewed_by", "reviewed_by_doctor_id"),
    )
