import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ImmunizationRoute, ImmunizationStatus, enum_values


class PatientImmunization(Base):
    """Registro de una inmunización (vacuna) del paciente.

    Estructura el esquema de vacunación como registros tipados y consultables: nombre de la
    vacuna, número de dosis, fecha de aplicación, lote, vía y sitio, además de un estado de
    registro (aplicada/no aplicada/contraindicada). La vía y el estado son enums NO nativos
    (VARCHAR + CHECK). uuid PK + auditoría + borrado lógico, igual que el resto de tablas
    clínicas. NO infiere qué vacunas 'tocan': sólo guarda lo que el médico registró.
    """

    __tablename__ = "patient_immunizations"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece la inmunización.",
    )
    vaccine_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nombre de la vacuna (p. ej. 'Influenza estacional', 'Hepatitis B').",
    )
    dose_number: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Número de dosis aplicada (1ª, 2ª, refuerzo…), si aplica.",
    )
    administered_on: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Fecha de aplicación de la vacuna, si se conoce.",
    )
    status: Mapped[ImmunizationStatus] = mapped_column(
        SAEnum(
            ImmunizationStatus,
            name="immunization_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ImmunizationStatus.APLICADA,
        server_default=ImmunizationStatus.APLICADA.value,
        comment="Estado del registro: aplicada, no aplicada o contraindicada.",
    )
    route: Mapped[Optional[ImmunizationRoute]] = mapped_column(
        SAEnum(
            ImmunizationRoute,
            name="immunization_route",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=True,
        comment="Vía de administración (intramuscular, subcutánea, oral, etc.), si aplica.",
    )
    lot_number: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Número de lote del biológico, si se conoce.",
    )
    site: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Sitio anatómico de aplicación (p. ej. 'deltoides izquierdo'), si aplica.",
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Notas o contexto adicional de la inmunización (opcional)."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro de la inmunización.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró la inmunización.",
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
        comment="Usuario que actualizó la inmunización.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la inmunización.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la inmunización.",
    )

    patient = relationship("Patient", foreign_keys=[patient_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # El número de dosis, si se registra, debe ser positivo y plausible.
        CheckConstraint(
            "dose_number IS NULL OR (dose_number >= 1 AND dose_number <= 50)",
            name="patient_immunization_dose_number_range",
        ),
        Index("ix_patient_immunizations_patient", "patient_id"),
        Index("ix_patient_immunizations_administered_on", "administered_on"),
        Index("ix_patient_immunizations_patient_administered", "patient_id", "administered_on"),
    )
