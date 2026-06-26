import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, Text, Time, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import AppointmentStatus, enum_values


class Appointment(Base):
    """Cita médica agendada para un paciente con un médico asignado."""

    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente con la cita médica.",
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Médico asignado a la cita.",
    )
    scheduled_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Fecha programada de la cita.",
    )
    scheduled_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True,
        comment="Hora programada de la cita. Puede omitirse cuando el paciente acudirá dentro del horario de consulta.",
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Duración estimada de la cita en minutos.",
    )
    reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo de la cita."
    )
    internal_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Notas internas sobre la cita."
    )
    status: Mapped[AppointmentStatus] = mapped_column(
        SAEnum(
            AppointmentStatus,
            name="appointment_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=AppointmentStatus.PENDING,
        comment="Estado de la cita médica.",
    )
    rescheduled_from_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Cita original cuando esta cita deriva de una reprogramación.",
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha y hora de cancelación de la cita."
    )
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que canceló la cita.",
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo de cancelación de la cita."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la cita.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró la cita.",
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
        comment="Usuario que modificó la cita.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Eliminación lógica, sólo para casos administrativos excepcionales.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la cita.",
    )

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")
    rescheduled_from = relationship(
        "Appointment",
        remote_side=[id],
        back_populates="rescheduled_appointments",
        foreign_keys=[rescheduled_from_id],
    )
    rescheduled_appointments = relationship(
        "Appointment",
        back_populates="rescheduled_from",
        foreign_keys=[rescheduled_from_id],
    )
    cancelled_by_user = relationship("User", foreign_keys=[cancelled_by])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_appointments_patient", "patient_id"),
        Index("ix_appointments_doctor", "doctor_id"),
        Index("ix_appointments_status", "status"),
        Index("ix_appointments_scheduled_date", "scheduled_date"),
        Index(
            "ix_appointments_doctor_date_time",
            "doctor_id",
            "scheduled_date",
            "scheduled_time",
        ),
        Index("ix_appointments_rescheduled_from", "rescheduled_from_id"),
    )
