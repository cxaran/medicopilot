import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import MedicalHistoryVersionStatus, enum_values


class MedicalHistoryVersion(Base):
    """Historia clínica narrativa y versionada de un paciente."""

    __tablename__ = "medical_history_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente relacionado con esta versión de historia clínica.",
    )
    version_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Número consecutivo de versión de historia clínica del paciente.",
    )
    status: Mapped[MedicalHistoryVersionStatus] = mapped_column(
        SAEnum(
            MedicalHistoryVersionStatus,
            name="medical_history_version_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=MedicalHistoryVersionStatus.DRAFT,
        comment="Estado de la versión: borrador, vigente o sustituida.",
    )
    based_on_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("medical_history_versions.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Versión vigente desde la cual nació este borrador; nulo sólo en la primera versión.",
    )
    family_history: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Antecedentes heredofamiliares."
    )
    pathological_history: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Antecedentes personales patológicos."
    )
    non_pathological_history: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Antecedentes personales no patológicos."
    )
    previous_surgeries: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Cirugías previas."
    )
    hospitalizations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Hospitalizaciones."
    )
    relevant_habits: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Hábitos relevantes (narrativa). El resumen vigente vive en patient_clinical_items.",
    )
    gyneco_obstetric_history: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Antecedentes gineco-obstétricos, si aplica.",
    )
    clinical_observations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Observaciones clínicas generales."
    )
    reviewed_by_doctor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Médico que revisó o validó esta versión de historia clínica.",
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de validación de la historia clínica."
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la versión de historia clínica.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que capturó la versión de historia clínica.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última edición mientras la versión sea borrador.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que editó la versión de historia clínica.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Eliminación lógica, sólo permitida en borradores no validados.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la versión de historia clínica.",
    )

    patient = relationship("Patient", back_populates="medical_history_versions")
    based_on_version = relationship(
        "MedicalHistoryVersion",
        remote_side=[id],
        foreign_keys=[based_on_version_id],
    )
    reviewed_by_doctor = relationship(
        "Doctor",
        back_populates="reviewed_medical_history_versions",
        foreign_keys=[reviewed_by_doctor_id],
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        UniqueConstraint(
            "patient_id",
            "version_number",
            name="uq_medical_history_versions_patient_version",
        ),
        Index("ix_medical_history_versions_patient", "patient_id"),
        Index("ix_medical_history_versions_status", "status"),
        Index("ix_medical_history_versions_reviewed_by", "reviewed_by_doctor_id"),
        Index("ix_medical_history_versions_based_on", "based_on_version_id"),
        # Índices parciales únicos: a lo sumo una versión vigente y a lo sumo un
        # borrador no eliminado por paciente. Las versiones superseded no se limitan.
        Index(
            "uq_medical_history_versions_current_patient",
            "patient_id",
            unique=True,
            postgresql_where=text("status = 'current' AND deleted_at IS NULL"),
        ),
        Index(
            "uq_medical_history_versions_draft_patient",
            "patient_id",
            unique=True,
            postgresql_where=text("status = 'draft' AND deleted_at IS NULL"),
        ),
    )
