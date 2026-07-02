import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import MessageRole
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class MessageCreate(ApiWriteSchema):
    """Alta (append) de un mensaje en una conversación.

    El índice de orden (``sequence_index``) lo asigna el servidor (máximo + 1 de la conversación);
    el cliente no lo envía. Persistir el mensaje NO es una escritura clínica (no requiere P1).
    """

    conversation_id: uuid.UUID = Field(
        title="Conversación",
        description="Conversación a la que se agrega el mensaje.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    role: MessageRole = Field(
        title="Rol",
        description="Rol del autor: user, assistant, system o tool.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    content: str = Field(
        default="",
        title="Contenido",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    payload: Optional[dict[str, Any]] = Field(
        default=None,
        title="Payload",
        description="Payload estructurado opcional (tool calls / metadatos).",
    )


class MessageUpdate(ApiWriteSchema):
    """Actualización de los METADATOS de presentación de un mensaje.

    Sólo el ``payload`` (sobres de UI generativa / tool calls / notas): permite reflejar estado
    que cambia DESPUÉS del alta (p. ej. una interfaz ya usada, para restaurarla contraída). El
    contenido, rol y orden del mensaje son inmutables por esta vía.
    """

    payload: Optional[dict[str, Any]] = Field(
        default=None,
        title="Payload",
        description="Payload estructurado de presentación (tool calls / metadatos).",
    )


class MessageRead(ApiReadSchema):
    """Representación completa de un mensaje."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: MessageRole
    content: str
    payload: Optional[dict[str, Any]] = None
    sequence_index: int
    created_at: datetime


class MessageListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (orden por ``sequence_index``)."""

    id: uuid.UUID
    conversation_id: uuid.UUID = Field(title="Conversación")
    role: MessageRole = Field(title="Rol", json_schema_extra={"ui": {"list": True}})
    content: str = Field(title="Contenido", json_schema_extra={"ui": {"list": True}})
    sequence_index: int = Field(title="Orden", json_schema_extra={"ui": {"list": True}})
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
