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
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import (
    ClinicalDocumentStatus,
    ClinicalDocumentType,
    enum_values,
)


class ClinicalDocument(Base):
    """Archivo clínico almacenado directamente en la base de datos."""

    __tablename__ = "clinical_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el archivo clínico.",
    )
    consultation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Consulta relacionada, si aplica.",
    )
    document_type: Mapped[ClinicalDocumentType] = mapped_column(
        SAEnum(
            ClinicalDocumentType,
            name="clinical_document_type",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        comment="Tipo de archivo clínico.",
    )
    status: Mapped[ClinicalDocumentStatus] = mapped_column(
        SAEnum(
            ClinicalDocumentStatus,
            name="clinical_document_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalDocumentStatus.ACTIVE,
        comment="Estado del archivo clínico: activo, archivado o eliminado lógicamente.",
    )
    original_filename: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre original del archivo."
    )
    file_content: Mapped[bytes] = mapped_column(
        LargeBinary,
        nullable=False,
        comment="Contenido binario del archivo almacenado en PostgreSQL.",
    )
    mime_type: Mapped[str] = mapped_column(
        String(160), nullable=False, comment="Tipo MIME del archivo."
    )
    size_bytes: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="Tamaño del archivo en bytes."
    )
    sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Huella SHA-256 para verificar integridad del archivo.",
    )
    document_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, comment="Fecha propia del documento, si aplica."
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Descripción o contexto del archivo clínico."
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de carga del archivo clínico.",
    )
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que cargó el archivo clínico.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización de metadatos del archivo clínico.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó los metadatos del archivo clínico.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de eliminación lógica del archivo clínico."
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el archivo clínico.",
    )

    patient = relationship("Patient", back_populates="clinical_documents")
    consultation = relationship("Consultation", back_populates="clinical_documents")
    uploaded_by_user = relationship("User", foreign_keys=[uploaded_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        CheckConstraint("size_bytes >= 0", name="size_bytes_non_negative"),
        Index("ix_clinical_documents_patient", "patient_id"),
        Index("ix_clinical_documents_consultation", "consultation_id"),
        Index("ix_clinical_documents_type", "document_type"),
        Index("ix_clinical_documents_status", "status"),
        Index("ix_clinical_documents_uploaded_at", "uploaded_at"),
        Index("ix_clinical_documents_sha256", "sha256"),
    )
