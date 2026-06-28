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
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import (
    ClinicalEventStatus,
    ClinicalEventType,
    ClinicalSeverity,
    enum_values,
)


class ClinicalEvent(Base):
    """Evento clínico de la línea de tiempo del paciente.

    Registra hospitalizaciones, urgencias, referencias, procedimientos u otros
    eventos relevantes para reconstruir la historia y el seguimiento del paciente.
    Pertenece al paciente; ``started_at``/``ended_at`` delimitan el evento (el fin
    es opcional para eventos en curso). uuid PK + auditoría + borrado lógico.
    """

    __tablename__ = "clinical_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el evento clínico.",
    )
    event_type: Mapped[ClinicalEventType] = mapped_column(
        SAEnum(
            ClinicalEventType,
            name="clinical_event_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Tipo de evento: hospitalización, urgencia, referencia, procedimiento u otro.",
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Título breve del evento clínico."
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Descripción o contexto del evento."
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, comment="Fecha y hora de inicio del evento."
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha y hora de fin del evento, si concluyó."
    )
    severity: Mapped[Optional[ClinicalSeverity]] = mapped_column(
        SAEnum(
            ClinicalSeverity,
            name="clinical_severity",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=True,
        comment="Severidad del evento (baja, moderada, alta o crítica), si aplica.",
    )
    specialty: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Especialidad relacionada (p. ej. en una referencia)."
    )
    destination: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Destino del evento (p. ej. a quién/dónde se refiere al paciente).",
    )
    status: Mapped[Optional[ClinicalEventStatus]] = mapped_column(
        SAEnum(
            ClinicalEventStatus,
            name="clinical_event_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=True,
        comment="Estado del evento: activo, resuelto o cancelado, si aplica.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del evento.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el evento.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Fecha y hora de la última edición.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que actualizó el evento.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del evento.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el evento.",
    )

    patient = relationship("Patient")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # El fin, si existe, no puede ser anterior al inicio.
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="clinical_event_dates",
        ),
        Index("ix_clinical_events_patient", "patient_id"),
        Index("ix_clinical_events_started_at", "started_at"),
        Index("ix_clinical_events_type", "event_type"),
        Index("ix_clinical_events_patient_started_at", "patient_id", "started_at"),
    )
