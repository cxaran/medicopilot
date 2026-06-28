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
from backend.app.models.enums import ConsultationDiagnosisKind, enum_values


class ConsultationDiagnosis(Base):
    """Diagnóstico o impresión diagnóstica estructurada de una consulta médica."""

    __tablename__ = "consultation_diagnoses"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta a la que pertenece el diagnóstico.",
    )
    diagnosis_kind: Mapped[ConsultationDiagnosisKind] = mapped_column(
        SAEnum(
            ConsultationDiagnosisKind,
            name="consultation_diagnosis_kind",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Tipo de diagnóstico: principal, secundario o presuntivo.",
    )
    diagnosis_text: Mapped[str] = mapped_column(
        Text, nullable=False, comment="Texto del diagnóstico o impresión diagnóstica."
    )
    coding_system: Mapped[Optional[str]] = mapped_column(
        String(80),
        nullable=True,
        comment="Sistema de codificación, si se registra (codificación futura).",
    )
    code: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True, comment="Código del diagnóstico, si se registra."
    )
    clinical_code_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("clinical_codes.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Código clínico validado (CIE-10) del catálogo, vinculado al diagnóstico si se eligió uno.",
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Observaciones breves sobre el diagnóstico."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del diagnóstico.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el diagnóstico.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última edición, mientras la consulta esté en borrador.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que editó el diagnóstico.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del diagnóstico.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el diagnóstico.",
    )

    consultation = relationship("Consultation")
    clinical_code = relationship("ClinicalCode", foreign_keys=[clinical_code_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        # El texto del diagnóstico no puede quedar vacío tras recortar espacios.
        CheckConstraint(
            "length(trim(diagnosis_text)) > 0", name="diagnosis_text_not_blank"
        ),
        # Sistema de codificación y código van juntos o ambos nulos.
        CheckConstraint(
            "(coding_system IS NULL AND code IS NULL)"
            " OR (coding_system IS NOT NULL AND code IS NOT NULL)",
            name="coding_pair",
        ),
        Index("ix_consultation_diagnoses_consultation", "consultation_id"),
        Index("ix_consultation_diagnoses_kind", "diagnosis_kind"),
        Index(
            "ix_consultation_diagnoses_consultation_kind",
            "consultation_id",
            "diagnosis_kind",
        ),
    )
