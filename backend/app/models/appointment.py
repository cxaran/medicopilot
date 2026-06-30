import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DDL,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Text,
    Time,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import AppointmentStatus, enum_values


class Appointment(Base):
    """Cita médica agendada para un paciente con un médico asignado.

    El ciclo de vida (pending → confirmed → attended/cancelled/rescheduled/no_show)
    lo gobierna el servidor mediante acciones explícitas. Una cita activa
    (``pending`` o ``confirmed``, no eliminada) no puede traslaparse con otra cita
    activa del mismo médico: lo garantiza una restricción de exclusión GiST a nivel
    de base de datos (ver el evento DDL al final del módulo).
    """

    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente con la cita médica (inmutable).",
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
        comment="Fecha programada de la cita (obligatoria).",
    )
    scheduled_time: Mapped[Optional[time]] = mapped_column(
        Time,
        nullable=True,
        comment=(
            "Hora programada de la cita. Puede omitirse cuando el paciente acudirá "
            "dentro del horario de consulta sin una hora concreta."
        ),
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment=(
            "Duración estimada de la cita en minutos (entre 5 y 480). Sólo aplica "
            "cuando hay hora concreta; nula para citas sin hora."
        ),
    )
    reason: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Motivo de la cita."
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
        comment="Estado de la cita médica, controlado por acciones explícitas.",
    )
    rescheduled_from_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Cita original cuando esta cita deriva de una reprogramación.",
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
        comment="Eliminación lógica, sólo permitida sobre citas pendientes creadas por error.",
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
    consultation = relationship(
        "Consultation",
        back_populates="appointment",
        foreign_keys="[Consultation.appointment_id]",
        uselist=False,
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        CheckConstraint(
            "duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 480)",
            name="duration_minutes_range",
        ),
        CheckConstraint("length(trim(reason)) > 0", name="reason_not_blank"),
        CheckConstraint(
            "rescheduled_from_id IS NULL OR rescheduled_from_id <> id",
            name="rescheduled_from_not_self",
        ),
        Index("ix_appointments_patient", "patient_id"),
        Index("ix_appointments_doctor", "doctor_id"),
        Index("ix_appointments_status", "status"),
        Index("ix_appointments_scheduled_date", "scheduled_date"),
        Index("ix_appointments_doctor_date", "doctor_id", "scheduled_date"),
        Index("ix_appointments_rescheduled_from", "rescheduled_from_id"),
    )


# La agenda sin traslapes se garantiza con una restricción de exclusión GiST: dos
# citas activas (pending/confirmed, no eliminadas) del mismo médico CON HORA CONCRETA no
# pueden solaparse. Las citas SIN hora (``scheduled_time`` nulo) NO reservan un intervalo
# —el paciente acude dentro del horario de consulta— y por eso quedan FUERA de la
# restricción (varias el mismo día son normales). El instante de inicio se compone como
# ``scheduled_date + scheduled_time`` (date + time = timestamp en PostgreSQL). Se aplica
# vía DDL sólo en PostgreSQL (SQLite no soporta EXCLUDE/GiST y los tests no-PG crean el
# esquema sobre SQLite). El rango usa ``tsrange`` (timestamps naive, sin zona). La
# aplicación traduce la violación al conflicto estándar (409).
EXCLUDE_NO_OVERLAP = "excl_appointments_doctor_no_overlap"

event.listen(
    Appointment.__table__,
    "before_create",
    DDL("CREATE EXTENSION IF NOT EXISTS btree_gist").execute_if(dialect="postgresql"),
)
event.listen(
    Appointment.__table__,
    "after_create",
    DDL(
        f"ALTER TABLE appointments ADD CONSTRAINT {EXCLUDE_NO_OVERLAP} "
        "EXCLUDE USING gist ("
        "doctor_id WITH =, "
        "tsrange("
        "(scheduled_date + scheduled_time), "
        "(scheduled_date + scheduled_time) + make_interval(mins => duration_minutes), "
        "'[)') WITH &&"
        ") WHERE ("
        "status IN ('pending', 'confirmed') AND deleted_at IS NULL "
        "AND scheduled_time IS NOT NULL AND duration_minutes IS NOT NULL"
        ")"
    ).execute_if(dialect="postgresql"),
)
