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
from backend.app.models.enums import (
    FamilyRelationship,
    PatientHistoryItemCategory,
    enum_values,
)


class PatientHistoryItem(Base):
    """Antecedente clínico ESTRUCTURADO del paciente (historia: familiar/quirúrgico/obstétrico/…).

    A diferencia de ``PatientClinicalItem`` —que captura problemas ACTIVOS del resumen (alergias,
    enfermedades crónicas, medicamentos actuales)—, esta tabla guarda ANTECEDENTES (historia)
    como registros tipados y consultables: la categoría es un enum no nativo (VARCHAR + CHECK),
    y campos opcionales estructuran el parentesco (para los familiares), la edad/fecha del evento
    y la condición/código relacionados. uuid PK + auditoría + borrado lógico, igual que el resto.
    """

    __tablename__ = "patient_history_items"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el antecedente.",
    )
    category: Mapped[PatientHistoryItemCategory] = mapped_column(
        SAEnum(
            PatientHistoryItemCategory,
            name="patient_history_item_category",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Categoría del antecedente: familiar, quirúrgico, obstétrico, patológico o no patológico.",
    )
    description: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Descripción breve del antecedente (p. ej. 'Apendicectomía', 'Diabetes en la madre').",
    )
    relationship_to_patient: Mapped[Optional[FamilyRelationship]] = mapped_column(
        SAEnum(
            FamilyRelationship,
            name="family_relationship",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=True,
        comment="Parentesco del familiar, para antecedentes familiares (opcional).",
    )
    related_condition: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        comment="Condición o diagnóstico relacionado, en texto libre (opcional).",
    )
    related_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Código de la condición relacionada (estilo CIE-10), si se conoce (opcional).",
    )
    onset_age: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Edad (años) de inicio o del evento, si se conoce (opcional).",
    )
    occurred_on: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
        comment="Fecha del evento (p. ej. de la cirugía), si se conoce (opcional).",
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Notas o contexto adicional del antecedente (opcional)."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del antecedente.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el antecedente.",
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
        comment="Usuario que actualizó el antecedente.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del antecedente.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el antecedente.",
    )

    patient = relationship("Patient", foreign_keys=[patient_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # La edad de inicio, si se registra, debe ser plausible (0-120 años).
        CheckConstraint(
            "onset_age IS NULL OR (onset_age >= 0 AND onset_age <= 120)",
            name="patient_history_item_onset_age_range",
        ),
        Index("ix_patient_history_items_patient", "patient_id"),
        Index("ix_patient_history_items_category", "category"),
        Index("ix_patient_history_items_patient_category", "patient_id", "category"),
    )
