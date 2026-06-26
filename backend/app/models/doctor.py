import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import RecordStatus, enum_values


class Doctor(Base):
    """Identidad profesional del médico dentro del sistema clínico."""

    __tablename__ = "doctors"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Usuario al que pertenece este perfil médico. Un usuario sólo puede tener un perfil de médico.",
    )
    professional_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nombre mostrado en consultas, recetas y documentos clínicos.",
    )
    professional_title: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Título profesional mostrado, por ejemplo Dr., Dra. o Médico Cirujano.",
    )
    professional_license_number: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        comment="Cédula profesional principal.",
    )
    specialty: Mapped[Optional[str]] = mapped_column(
        String(160), nullable=True, comment="Especialidad médica, si aplica."
    )
    specialty_license_number: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True, comment="Cédula de especialidad, si aplica."
    )
    professional_phone: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="Teléfono profesional del médico."
    )
    professional_email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Correo profesional del médico."
    )
    clinic_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="Nombre de clínica o consultorio."
    )
    office_address: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Dirección profesional o de consultorio."
    )
    office_phone: Mapped[Optional[str]] = mapped_column(
        String(40), nullable=True, comment="Teléfono del consultorio."
    )
    prescription_footer: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Texto o leyenda que aparecerá en recetas.",
    )
    status: Mapped[RecordStatus] = mapped_column(
        SAEnum(
            RecordStatus,
            name="record_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=RecordStatus.ACTIVE,
        comment="Sólo médicos activos pueden finalizar consultas, revisar historia clínica o aprobar recetas.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de alta del perfil médico.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó el perfil médico.",
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
        comment="Fecha de eliminación lógica del perfil médico.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el perfil médico.",
    )

    user = relationship("User", foreign_keys=[user_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    reviewed_medical_history_versions = relationship(
        "MedicalHistoryVersion",
        back_populates="reviewed_by_doctor",
        foreign_keys="[MedicalHistoryVersion.reviewed_by_doctor_id]",
    )
    appointments = relationship("Appointment", back_populates="doctor")
    attended_consultations = relationship(
        "Consultation",
        back_populates="attending_doctor",
        foreign_keys="[Consultation.attending_doctor_id]",
    )
    finalized_consultations = relationship(
        "Consultation",
        back_populates="finalized_by_doctor",
        foreign_keys="[Consultation.finalized_by_doctor_id]",
    )
    reviewed_ai_outputs = relationship(
        "ConsultationAiOutput",
        back_populates="reviewed_by_doctor",
        foreign_keys="[ConsultationAiOutput.reviewed_by_doctor_id]",
    )
    approved_prescriptions = relationship(
        "Prescription",
        back_populates="approved_by_doctor",
        foreign_keys="[Prescription.approved_by_doctor_id]",
    )
    voided_prescriptions = relationship(
        "Prescription",
        back_populates="voided_by_doctor",
        foreign_keys="[Prescription.voided_by_doctor_id]",
    )
    medication_templates = relationship("MedicationTemplate", back_populates="doctor")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_doctors_user_id"),
        UniqueConstraint(
            "professional_license_number",
            name="uq_doctors_professional_license_number",
        ),
        Index("ix_doctors_status", "status"),
    )
