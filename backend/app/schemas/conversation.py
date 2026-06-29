import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class ConversationCreate(ApiWriteSchema):
    """Alta de una conversación del copiloto (chat-first).

    ``patient_id`` opcional: presente para el chat de un paciente, ausente/nulo para el chat
    global del inicio. Persistir el hilo NO es una escritura clínica.
    """

    patient_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Paciente",
        description="Paciente del chat; nulo para el chat global (tareas sin paciente).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    title: Optional[str] = Field(
        default=None,
        max_length=200,
        title="Título",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )


class ConversationRead(ApiReadSchema):
    """Representación completa de una conversación."""

    id: uuid.UUID
    patient_id: Optional[uuid.UUID] = None
    title: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConversationListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    patient_id: Optional[uuid.UUID] = Field(default=None, title="Paciente")
    title: Optional[str] = Field(
        default=None, title="Título", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
