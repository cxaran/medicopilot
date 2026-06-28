import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import PatientStatus, PregnancyStatus, Sex, enum_values


class Patient(Base):
    """Ficha administrativa y general del paciente."""

    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    record_number: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        nullable=False,
        comment=(
            "Número interno de expediente generado por la base de datos (identity). "
            "Inmutable; el prefijo visual (p. ej. EXP-000123) es de presentación."
        ),
    )
    full_name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre completo del paciente."
    )
    birth_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        comment="Fecha de nacimiento. La edad se calcula a partir de este campo.",
    )
    sex: Mapped[Sex] = mapped_column(
        SAEnum(
            Sex,
            name="sex",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Sexo registrado para fines clínicos y administrativos.",
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="Teléfono del paciente."
    )
    email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Correo electrónico del paciente."
    )
    address: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Dirección del paciente."
    )
    curp: Mapped[Optional[str]] = mapped_column(
        String(18),
        nullable=True,
        comment="CURP normalizada (mayúsculas, sin espacios). Única entre expedientes no eliminados.",
    )
    occupation: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Ocupación opcional del paciente."
    )
    marital_status: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True, comment="Estado civil opcional del paciente."
    )
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Nombre del contacto de emergencia."
    )
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True, comment="Parentesco o relación del contacto de emergencia."
    )
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="Teléfono de emergencia."
    )
    status: Mapped[PatientStatus] = mapped_column(
        SAEnum(
            PatientStatus,
            name="patient_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=PatientStatus.ACTIVE,
        comment="Estado administrativo del expediente: active, inactive o archived.",
    )
    pregnancy_status: Mapped[PregnancyStatus] = mapped_column(
        SAEnum(
            PregnancyStatus,
            name="pregnancy_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=PregnancyStatus.NONE,
        server_default=PregnancyStatus.NONE.value,
        comment="Estado de embarazo/lactancia: none, pregnant, postpartum o lactating.",
    )
    pregnancy_since: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Fecha de inicio del embarazo/estado, si aplica.",
    )
    estimated_due_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Fecha probable de parto, si aplica.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha y hora de creación del registro. Representa el alta del paciente.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró al paciente.",
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
        comment="Usuario que realizó la última modificación.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del expediente del paciente.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el expediente del paciente.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    clinical_items = relationship("PatientClinicalItem", back_populates="patient")
    medical_history_versions = relationship(
        "MedicalHistoryVersion", back_populates="patient"
    )
    appointments = relationship("Appointment", back_populates="patient")
    consultations = relationship("Consultation", back_populates="patient")
    clinical_documents = relationship("ClinicalDocument", back_populates="patient")

    __table_args__ = (
        UniqueConstraint("record_number", name="uq_patients_record_number"),
        # Unicidad parcial de CURP: solo entre expedientes vigentes (no eliminados),
        # de modo que una baja lógica no impide reutilizar la CURP.
        Index(
            "uq_patients_curp_active",
            "curp",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_patients_full_name", "full_name"),
        Index("ix_patients_status", "status"),
        Index("ix_patients_created_at", "created_at"),
    )
