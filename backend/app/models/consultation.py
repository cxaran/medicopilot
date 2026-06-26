import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ConsultationStatus, enum_values


class Consultation(Base):
    """Consulta médica central del expediente clínico."""

    __tablename__ = "consultations"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente atendido en la consulta.",
    )
    appointment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Cita de origen, si la consulta deriva de una cita agendada.",
    )
    attending_doctor_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Médico tratante de la consulta.",
    )
    consulted_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        comment="Fecha y hora de la atención médica.",
    )
    reason_for_visit: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo de consulta."
    )
    current_illness: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Padecimiento actual."
    )
    interrogation: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Interrogatorio clínico."
    )
    physical_examination: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Exploración física."
    )
    clinical_assessment: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Valoración o impresión clínica narrativa.",
    )
    treatment: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Tratamiento general."
    )
    instructions: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Indicaciones para el paciente."
    )
    prognosis: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Pronóstico, si aplica."
    )
    follow_up_plan: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Plan de seguimiento."
    )
    next_appointment_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha sugerida para próxima cita, con hora si se define.",
    )
    observations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Observaciones adicionales."
    )
    status: Mapped[ConsultationStatus] = mapped_column(
        SAEnum(
            ConsultationStatus,
            name="consultation_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ConsultationStatus.DRAFT,
        comment="Estado de la consulta: borrador, finalizada o cancelada.",
    )
    finalized_by_doctor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Médico que cerró la consulta.",
    )
    finalized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha y hora de cierre de la consulta."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la consulta.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que inició o registró la consulta.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Fecha y hora de la última modificación.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó la consulta.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Sólo aplicable a borradores no clínicamente finalizados.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la consulta.",
    )

    patient = relationship("Patient", back_populates="consultations")
    appointment = relationship("Appointment", foreign_keys=[appointment_id])
    attending_doctor = relationship(
        "Doctor",
        back_populates="attended_consultations",
        foreign_keys=[attending_doctor_id],
    )
    finalized_by_doctor = relationship(
        "Doctor",
        back_populates="finalized_consultations",
        foreign_keys=[finalized_by_doctor_id],
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    vital_signs = relationship("VitalSign", back_populates="consultation")
    ai_outputs = relationship("ConsultationAiOutput", back_populates="consultation")
    prescriptions = relationship("Prescription", back_populates="consultation")
    clinical_documents = relationship("ClinicalDocument", back_populates="consultation")

    __table_args__ = (
        UniqueConstraint("appointment_id", name="uq_consultations_appointment_id"),
        Index("ix_consultations_patient", "patient_id"),
        Index("ix_consultations_attending_doctor", "attending_doctor_id"),
        Index("ix_consultations_status", "status"),
        Index("ix_consultations_consulted_at", "consulted_at"),
        Index(
            "ix_consultations_patient_consulted_at",
            "patient_id",
            "consulted_at",
        ),
    )
