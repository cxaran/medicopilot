import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
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
from backend.app.models.enums import StudyOrderStatus, enum_values


class StudyOrder(Base):
    """Orden de estudio/laboratorio solicitada para un paciente.

    Cubre el seguimiento de estudios pendientes/en proceso/resultados. Cuando el
    estudio se resuelve, ``result_lab_result_id`` enlaza al ``LabResult``
    estructurado correspondiente. Pertenece al paciente y la ordena un médico.
    uuid PK + auditoría + borrado lógico.
    """

    __tablename__ = "study_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente para quien se ordena el estudio.",
    )
    ordered_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("doctors.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Médico que ordena el estudio.",
    )
    study_name: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Nombre del estudio solicitado."
    )
    code: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="Código del estudio (estilo LOINC), si aplica."
    )
    reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo clínico de la solicitud."
    )
    ordered_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, comment="Fecha y hora en que se ordenó el estudio."
    )
    status: Mapped[StudyOrderStatus] = mapped_column(
        SAEnum(
            StudyOrderStatus,
            name="study_order_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=StudyOrderStatus.PENDING,
        server_default=StudyOrderStatus.PENDING.value,
        comment="Estado: pendiente, en proceso, con resultado o cancelado.",
    )
    result_lab_result_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("lab_results.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Resultado de laboratorio estructurado vinculado, cuando el estudio se resuelve.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro de la orden.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró la orden.",
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
        comment="Usuario que actualizó la orden.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la orden.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la orden.",
    )

    patient = relationship("Patient")
    ordered_by_doctor = relationship("Doctor", foreign_keys=[ordered_by])
    result_lab_result = relationship("LabResult", foreign_keys=[result_lab_result_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_study_orders_patient", "patient_id"),
        Index("ix_study_orders_ordered_at", "ordered_at"),
        Index("ix_study_orders_status", "status"),
        Index("ix_study_orders_patient_ordered_at", "patient_id", "ordered_at"),
    )
