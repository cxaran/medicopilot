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
from backend.app.models.enums import ClinicalTaskPriority, ClinicalTaskStatus, enum_values


class ClinicalTask(Base):
    """Tarea clínica de seguimiento de un usuario (médico/personal).

    Cubre los pendientes y vencidos (follow-up): la tarea pertenece a un usuario
    (``owner_id``) y opcionalmente refiere a un paciente. ``due_at`` marca el
    vencimiento. uuid PK + auditoría + borrado lógico.
    """

    __tablename__ = "clinical_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Usuario dueño/responsable de la tarea.",
    )
    patient_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Paciente relacionado con la tarea, si aplica.",
    )
    title: Mapped[str] = mapped_column(
        String(255), nullable=False, comment="Título de la tarea."
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Descripción o detalle de la tarea."
    )
    due_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha y hora de vencimiento, si aplica."
    )
    priority: Mapped[ClinicalTaskPriority] = mapped_column(
        SAEnum(
            ClinicalTaskPriority,
            name="clinical_task_priority",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalTaskPriority.MEDIUM,
        server_default=ClinicalTaskPriority.MEDIUM.value,
        comment="Prioridad de la tarea: baja, media o alta.",
    )
    status: Mapped[ClinicalTaskStatus] = mapped_column(
        SAEnum(
            ClinicalTaskStatus,
            name="clinical_task_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalTaskStatus.OPEN,
        server_default=ClinicalTaskStatus.OPEN.value,
        comment="Estado de la tarea: abierta, hecha o cancelada.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro de la tarea.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó la tarea.",
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
        comment="Usuario que actualizó la tarea.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la tarea.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la tarea.",
    )

    owner = relationship("User", foreign_keys=[owner_id])
    patient = relationship("Patient", foreign_keys=[patient_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_clinical_tasks_owner", "owner_id"),
        Index("ix_clinical_tasks_patient", "patient_id"),
        Index("ix_clinical_tasks_due_at", "due_at"),
        Index("ix_clinical_tasks_status", "status"),
        Index("ix_clinical_tasks_owner_status", "owner_id", "status"),
    )
