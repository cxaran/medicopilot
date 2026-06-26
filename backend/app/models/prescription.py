import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import PrescriptionStatus, enum_values


class Prescription(Base):
    """Receta médica emitida a partir de una consulta."""

    __tablename__ = "prescriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta origen de la receta.",
    )
    internal_folio: Mapped[str] = mapped_column(
        String(80), nullable=False, comment="Folio interno único de la receta."
    )
    related_diagnosis_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        comment="Diagnóstico relacionado, opcional. Se vinculará cuando exista el modelo de diagnósticos.",
    )
    observations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Observaciones generales de la receta."
    )
    status: Mapped[PrescriptionStatus] = mapped_column(
        SAEnum(
            PrescriptionStatus,
            name="prescription_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=PrescriptionStatus.DRAFT,
        comment="Estado de la receta: borrador, aprobada o anulada.",
    )
    doctor_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Captura de los datos profesionales del médico al momento de aprobación.",
    )
    issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de emisión de la receta."
    )
    approved_by_doctor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Médico que autorizó la receta.",
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de aprobación de la receta."
    )
    voided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de anulación de la receta."
    )
    voided_by_doctor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Médico que anuló la receta.",
    )
    void_reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo de anulación de la receta."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la receta.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó el borrador de receta.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última modificación mientras la receta esté en borrador.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que editó la receta.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Eliminación lógica sólo permitida antes de aprobación.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la receta.",
    )

    consultation = relationship("Consultation", back_populates="prescriptions")
    approved_by_doctor = relationship(
        "Doctor",
        back_populates="approved_prescriptions",
        foreign_keys=[approved_by_doctor_id],
    )
    voided_by_doctor = relationship(
        "Doctor",
        back_populates="voided_prescriptions",
        foreign_keys=[voided_by_doctor_id],
    )
    items = relationship("PrescriptionItem", back_populates="prescription")
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        UniqueConstraint("internal_folio", name="uq_prescriptions_internal_folio"),
        Index("ix_prescriptions_consultation", "consultation_id"),
        Index("ix_prescriptions_status", "status"),
        Index("ix_prescriptions_issued_at", "issued_at"),
        Index("ix_prescriptions_approved_by", "approved_by_doctor_id"),
        Index("ix_prescriptions_voided_by", "voided_by_doctor_id"),
        Index("ix_prescriptions_related_diagnosis", "related_diagnosis_id"),
    )


class PrescriptionItem(Base):
    """Medicamento incluido en una receta médica."""

    __tablename__ = "prescription_items"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    prescription_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prescriptions.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Receta relacionada con este medicamento.",
    )
    medication_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("medication_templates.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Plantilla de medicamento usada, opcional. La receta copia los textos y no depende de la plantilla después de emitirse.",
    )
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Orden de aparición del medicamento en la receta.",
    )
    medication_name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre del medicamento."
    )
    presentation: Mapped[Optional[str]] = mapped_column(
        String(160),
        nullable=True,
        comment="Presentación: tabletas, cápsulas, jarabe, ampolletas, etc.",
    )
    dose: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Dosis indicada."
    )
    frequency: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Frecuencia indicada."
    )
    duration: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Duración del tratamiento."
    )
    instructions: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Indicaciones específicas del medicamento."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación del medicamento de receta.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que capturó el medicamento.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última edición mientras la receta esté en borrador.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que editó el medicamento.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Eliminación lógica sólo permitida antes de aprobación.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el medicamento de receta.",
    )

    prescription = relationship("Prescription", back_populates="items")
    medication_template = relationship(
        "MedicationTemplate", back_populates="prescription_items"
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        CheckConstraint("position > 0", name="position_positive"),
        UniqueConstraint(
            "prescription_id",
            "position",
            name="uq_prescription_items_prescription_position",
        ),
        Index("ix_prescription_items_prescription", "prescription_id"),
        Index("ix_prescription_items_medication_template", "medication_template_id"),
    )
