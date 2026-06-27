import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Enum as SAEnum, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import (
    ClinicalItemStatus,
    ClinicalSeverity,
    PatientClinicalItemType,
    enum_values,
)


class PatientClinicalItem(Base):
    """Dato clínico importante que aparece en el resumen del paciente."""

    __tablename__ = "patient_clinical_items"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el dato clínico importante.",
    )
    item_type: Mapped[PatientClinicalItemType] = mapped_column(
        SAEnum(
            PatientClinicalItemType,
            name="patient_clinical_item_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Tipo de dato: alergia, enfermedad crónica, medicamento actual, hábito, alerta clínica u otro.",
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre del elemento clínico."
    )
    details: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Reacción, dosis, frecuencia, descripción o contexto del dato clínico.",
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
        comment="Severidad baja, moderada, alta o crítica, si aplica.",
    )
    status: Mapped[ClinicalItemStatus] = mapped_column(
        SAEnum(
            ClinicalItemStatus,
            name="clinical_item_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalItemStatus.ACTIVE,
        comment="Estado del dato clínico importante.",
    )
    started_on: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Inicio conocido del dato clínico, si aplica."
    )
    ended_on: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Fin o resolución del dato clínico, si aplica."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del dato clínico.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que agregó el dato clínico.",
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
        comment="Usuario que actualizó el dato clínico.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del dato clínico.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el dato clínico.",
    )

    patient = relationship("Patient", back_populates="clinical_items")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_patient_clinical_items_patient", "patient_id"),
        Index("ix_patient_clinical_items_type", "item_type"),
        Index("ix_patient_clinical_items_status", "status"),
        Index(
            "ix_patient_clinical_items_patient_type_status",
            "patient_id",
            "item_type",
            "status",
        ),
    )
