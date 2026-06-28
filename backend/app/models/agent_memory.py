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
from backend.app.models.enums import AgentMemoryKind, enum_values


class AgentMemory(Base):
    """Memoria persistente del agente ligada a un usuario (médico), cifrada en reposo.

    El médico acumula memorias (notas, preferencias, hechos clínicos, recordatorios)
    que el copiloto puede recordar y recuperar. El ``content`` puede contener datos
    clínicos sensibles, por eso se guarda SOLO como ciphertext Fernet en
    ``content_encrypted`` (mismo cifrado que las credenciales de B3); el claro nunca se
    persiste ni se loguea. A diferencia de las API keys, al DUEÑO sí se le devuelve el
    contenido descifrado (es su propia memoria), nunca a otro usuario."""

    __tablename__ = "agent_memories"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Usuario dueño de la memoria.",
    )
    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="Clave corta o título legible de la memoria.",
    )
    content_encrypted: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Contenido de la memoria cifrado con Fernet (NUNCA el claro).",
    )
    kind: Mapped[AgentMemoryKind] = mapped_column(
        SAEnum(
            AgentMemoryKind,
            name="agent_memory_kind",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=AgentMemoryKind.NOTA,
        server_default=AgentMemoryKind.NOTA.value,
        comment="Tipo de memoria: nota, preferencia, hecho_clinico o recordatorio.",
    )
    patient_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Paciente al que se relaciona la memoria, si aplica.",
    )
    consultation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Consulta a la que se relaciona la memoria, si aplica.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la memoria.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó la memoria.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización de la memoria.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó la memoria.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, comment="Fecha de eliminación lógica de la memoria."
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la memoria.",
    )

    owner = relationship("User", foreign_keys=[user_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    patient = relationship("Patient", foreign_keys=[patient_id])
    consultation = relationship("Consultation", foreign_keys=[consultation_id])

    __table_args__ = (
        Index("ix_agent_memories_user", "user_id"),
        Index("ix_agent_memories_kind", "kind"),
        Index("ix_agent_memories_patient", "patient_id"),
        Index("ix_agent_memories_consultation", "consultation_id"),
    )
