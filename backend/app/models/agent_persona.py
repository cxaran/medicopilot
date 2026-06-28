import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base


class AgentPersona(Base):
    """Persona configurable del copiloto, propia de cada usuario (médico).

    Capa de PERSONALIDAD del system-prompt (P4): el médico ajusta tono, enfoque de
    especialidad, idioma/locale y estilo de consulta. Es config NO secreta (no son
    datos clínicos ni credenciales), así que se guarda en CLARO; aun así es owner-only
    (cada usuario solo ve/edita la suya). Es un SINGLETON por usuario (``user_id`` único,
    upsert): no hay borrado, por eso no lleva soft-delete (a diferencia de las tablas de
    registro clínico). La capa de SEGURIDAD clínica NO vive aquí: es fija y la posee el
    código del frontend; la persona nunca puede debilitarla.
    """

    __tablename__ = "agent_personas"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Usuario dueño de la persona (única por usuario).",
    )
    tone: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Tono y registro deseado de las respuestas (p. ej. breve, formal).",
    )
    specialty_focus: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        comment="Enfoque de especialidad del médico (p. ej. pediatría).",
    )
    language_locale: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        comment="Preferencia de idioma/locale (p. ej. es-MX).",
    )
    consultation_style: Mapped[Optional[str]] = mapped_column(
        String(1000),
        nullable=True,
        comment="Estilo de consulta por defecto (estructura, nivel de detalle).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la persona.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que creó la persona.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Última actualización de la persona.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que modificó la persona.",
    )

    owner = relationship("User", foreign_keys=[user_id])
    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (UniqueConstraint("user_id", name="uq_agent_personas_user"),)
