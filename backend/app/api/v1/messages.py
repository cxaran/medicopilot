"""Mensajes de las conversaciones del copiloto: listar y agregar bajo ``messages:*``.

Persiste cada turno del hilo (rol, contenido, payload). El ``sequence_index`` lo asigna el
SERVIDOR (máximo + 1 de la conversación), no el cliente, para mantener el orden estable. La baja es
lógica y los listados excluyen los mensajes eliminados; se consultan por conversación, ordenados por
``sequence_index`` ascendente. Persistir un mensaje NO es una escritura clínica (no requiere P1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_or_404,
    paginate_resource,
    serialize,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.conversation import Conversation
from backend.app.models.message import Message
from backend.app.resources.registry import MESSAGES
from backend.app.schemas.message import MessageCreate, MessageListItem, MessageRead
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.conversations import MessagePermissions

router = APIRouter(prefix="/messages", tags=["messages"])

_NOT_FOUND = "Mensaje no encontrado"
_CONVERSATION_NOT_FOUND = "Conversación no encontrada"
_CONFLICT = "No se pudo guardar el mensaje"


def _get_active(session: Session, item_id: UUID) -> Message:
    item = get_or_404(session, Message, item_id, _NOT_FOUND)
    if item.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return item


def _next_sequence(session: Session, conversation_id: UUID) -> int:
    """Siguiente índice de orden en la conversación (máximo vigente + 1, o 0 si es el primero)."""
    current_max = session.exec(
        select(func.max(Message.sequence_index)).where(
            Message.conversation_id == conversation_id,
            Message.deleted_at.is_(None),
        )
    ).one()
    return 0 if current_max is None else int(current_max) + 1


@router.get("", response_model=OffsetPage[MessageListItem])
def list_messages(
    session: SessionDep,
    query: Annotated[MESSAGES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: MessagePermissions.READ.requiere,
) -> OffsetPage[MessageListItem]:
    # Scope base: sólo mensajes vigentes (excluye los eliminados lógicamente). Se consultan por
    # conversación con el filtro exacto ``conversation_id`` y se ordenan por ``sequence_index``.
    stmt = select(Message).where(Message.deleted_at.is_(None))
    return paginate_resource(MESSAGES, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=MessageRead)
def get_message(
    item_id: UUID,
    session: SessionDep,
    _: MessagePermissions.READ.requiere,
) -> MessageRead:
    return serialize(MessageRead, _get_active(session, item_id))


@router.post("", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def create_message(
    payload: MessageCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.CREATE.requiere,
) -> MessageRead:
    # La conversación debe existir y estar vigente para agregarle mensajes.
    conversation = get_or_404(
        session, Conversation, payload.conversation_id, _CONVERSATION_NOT_FOUND
    )
    if conversation.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _CONVERSATION_NOT_FOUND)

    item = create_entity(
        session,
        Message,
        payload,
        values={
            "sequence_index": _next_sequence(session, payload.conversation_id),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(MessageRead, item)
