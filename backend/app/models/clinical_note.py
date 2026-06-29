import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ClinicalNoteStatus, enum_values


class ClinicalNote(Base):
    """Nota clínica estructurada (fase 1: nota SOAP) compuesta de una consulta.

    Una nota SOAP final se COMPONE a partir de los datos REALES de una consulta del
    expediente (Subjetivo/Objetivo/Análisis/Plan) y se persiste como BORRADOR que el
    médico aprueba (P1). NUNCA se finaliza de forma autónoma: nace en estado ``draft`` y
    sólo el médico la pasa a ``approved``. El copiloto redacta la narrativa fundamentada
    en la consulta; si una sección no tiene datos de origen, se deja vacía (no se inventa).

    Es un modelo dedicado y ligero: a diferencia de ``ClinicalDocument`` (un ARCHIVO
    binario con mime/tamaño/sha256), aquí el contenido es TEXTO estructurado en cuatro
    secciones. La baja es lógica.
    """

    __tablename__ = "clinical_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece la nota (derivado de la consulta).",
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta de la que se compone la nota SOAP.",
    )
    subjective: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección S (Subjetivo): motivo, padecimiento, interrogatorio."
    )
    objective: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección O (Objetivo): exploración física y hallazgos."
    )
    assessment: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección A (Análisis): valoración/impresión diagnóstica."
    )
    plan: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección P (Plan): tratamiento, indicaciones, seguimiento."
    )
    status: Mapped[ClinicalNoteStatus] = mapped_column(
        SAEnum(
            ClinicalNoteStatus,
            name="clinical_note_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalNoteStatus.DRAFT,
        comment="Estado de la nota: draft (borrador) o approved (aprobada por el médico).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la nota.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró la nota.",
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
        comment="Usuario que actualizó la nota.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la nota.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la nota.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_clinical_notes_patient", "patient_id"),
        Index("ix_clinical_notes_consultation", "consultation_id"),
        Index("ix_clinical_notes_status", "status"),
        Index("ix_clinical_notes_patient_created_at", "patient_id", "created_at"),
    )

    @property
    def content_markdown(self) -> str:
        """Renderiza la nota SOAP a Markdown. Las secciones sin datos se marcan, no se inventan."""
        empty = "_(sin información registrada)_"
        sections = (
            ("S — Subjetivo", self.subjective),
            ("O — Objetivo", self.objective),
            ("A — Análisis", self.assessment),
            ("P — Plan", self.plan),
        )
        parts = ["# Nota SOAP (borrador)"]
        for title, body in sections:
            text = body.strip() if body and body.strip() else empty
            parts.append(f"## {title}\n\n{text}")
        return "\n\n".join(parts)
