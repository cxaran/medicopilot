import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import LabResultAbnormalFlag, enum_values


class LabResult(Base):
    """Resultado estructurado de laboratorio u observación clínica del paciente.

    A diferencia de ``ClinicalDocument`` (que es solo el archivo), este modelo
    guarda el dato CONSULTABLE: analito, valor numérico o cualitativo, unidad,
    rango de referencia, marca de anormalidad y fecha de medición. Habilita
    tendencias, comparaciones y la detección de resultados fuera de rango o
    críticos. Pertenece al paciente; opcionalmente se liga a una consulta y al
    archivo del que se extrajo. ``reviewed_at``/``reviewed_by`` son la costura del
    flujo de revisión de resultados críticos.
    """

    __tablename__ = "lab_results"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el resultado de laboratorio.",
    )
    consultation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Consulta en la que se registró el resultado, si aplica.",
    )
    clinical_document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("clinical_documents.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Archivo clínico del que se extrajo el resultado, si aplica.",
    )
    analyte_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nombre del analito o prueba (texto libre; p. ej. 'HbA1c').",
    )
    analyte_code: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Código del analito (estilo LOINC) para normalización futura.",
    )
    value_numeric: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 4),
        nullable=True,
        comment="Valor numérico del resultado, si es cuantitativo.",
    )
    value_text: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Valor cualitativo del resultado (p. ej. 'positivo'), si aplica.",
    )
    unit: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, comment="Unidad de medida del valor numérico."
    )
    reference_range_low: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 4), nullable=True, comment="Límite inferior del rango de referencia."
    )
    reference_range_high: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 4), nullable=True, comment="Límite superior del rango de referencia."
    )
    abnormal_flag: Mapped[LabResultAbnormalFlag] = mapped_column(
        SAEnum(
            LabResultAbnormalFlag,
            name="lab_result_abnormal_flag",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=LabResultAbnormalFlag.UNKNOWN,
        comment="Marca de anormalidad: normal, bajo, alto, crítico o desconocido.",
    )
    measured_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        comment="Fecha y hora de la medición del resultado.",
    )
    source_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Nombre del laboratorio o fuente del resultado."
    )
    method: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Método o técnica de medición, si se conoce."
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha en que el médico revisó el resultado (flujo de críticos).",
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que revisó el resultado.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del resultado.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el resultado.",
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
        comment="Usuario que actualizó el resultado.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del resultado.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el resultado.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    reviewed_by_user = relationship("User", foreign_keys=[reviewed_by])

    __table_args__ = (
        # Un resultado debe traer al menos un valor (numérico o cualitativo): no se
        # registra un analito vacío.
        CheckConstraint(
            "value_numeric IS NOT NULL OR value_text IS NOT NULL",
            name="lab_result_value_present",
        ),
        # Rango de referencia coherente cuando ambos extremos existen.
        CheckConstraint(
            "reference_range_low IS NULL"
            " OR reference_range_high IS NULL"
            " OR reference_range_low <= reference_range_high",
            name="lab_result_reference_range",
        ),
        Index("ix_lab_results_patient", "patient_id"),
        Index("ix_lab_results_measured_at", "measured_at"),
        Index("ix_lab_results_abnormal_flag", "abnormal_flag"),
        Index("ix_lab_results_patient_measured_at", "patient_id", "measured_at"),
        Index("ix_lab_results_patient_analyte", "patient_id", "analyte_name"),
    )
