"""Mensajes de las conversaciones del copiloto: listar, agregar, actualizar metadatos y eliminar
bajo ``messages:*``.

Persiste cada turno del hilo (rol, contenido, payload). El ``sequence_index`` lo asigna el
SERVIDOR (máximo + 1 de la conversación), no el cliente, para mantener el orden estable. La baja es
lógica (``messages:delete``, limpieza del historial de chat, nunca de datos clínicos) y los
listados excluyen los mensajes eliminados; se consultan por conversación, ordenados por
``sequence_index`` ascendente. Persistir un mensaje NO es una escritura clínica (no requiere P1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func
from sqlmodel import select

from backend.app.api.resource_actions import (
    create_entity,
    get_active_or_404,
    paginate_resource,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.conversation import Conversation
from backend.app.models.message import Message
from backend.app.resources.registry import MESSAGES
from backend.app.schemas.message import (
    MessageCreate,
    MessageListItem,
    MessageRead,
    MessageUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.conversations import MessagePermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/messages", tags=["messages"])

_NOT_FOUND = "Mensaje no encontrado"
_CONVERSATION_NOT_FOUND = "Conversación no encontrada"
_CONFLICT = "No se pudo guardar el mensaje"


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
    return serialize(MessageRead, get_active_or_404(session, Message, item_id, _NOT_FOUND))


@router.patch("/{item_id}", response_model=MessageRead)
def update_message(
    item_id: UUID,
    payload: MessageUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.UPDATE.requiere,
) -> MessageRead:
    """Actualiza los METADATOS de presentación de un mensaje vigente (sólo ``payload``).

    Permite reflejar estado que cambia DESPUÉS del alta —p. ej. una interfaz generada ya usada,
    para restaurarla contraída al recargar el hilo—. El contenido, el rol y el ``sequence_index``
    son inmutables por esta vía; no es una escritura clínica.
    """
    item = get_active_or_404(session, Message, item_id, _NOT_FOUND)
    item.payload = payload.payload
    item.updated_at = utc_now()
    item.updated_by = current_user.id
    session.add(item)
    session.commit()
    session.refresh(item)
    return serialize(MessageRead, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.DELETE.requiere,
) -> None:
    """Baja LÓGICA de un mensaje puntual del hilo (limpieza del chat, no un borrado clínico).

    El mensaje deja de aparecer en los listados; el resto del hilo conserva su orden (el
    ``sequence_index`` de los demás no se recalcula).
    """
    item = get_active_or_404(session, Message, item_id, _NOT_FOUND)
    soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message=_NOT_FOUND,
    )


@router.post("", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def create_message(
    payload: MessageCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.CREATE.requiere,
) -> MessageRead:
    # La conversación debe existir y estar vigente para agregarle mensajes.
    conversation = get_active_or_404(
        session, Conversation, payload.conversation_id, _CONVERSATION_NOT_FOUND
    )

    # La conversación registra su ÚLTIMA ACTIVIDAD: los chats recientes (sidebar) se ordenan por
    # ``updated_at``. El ``onupdate`` del modelo no dispara aquí (se INSERTA un mensaje, no se
    # actualiza la fila de la conversación), así que se marca explícito en el mismo commit.
    conversation.updated_at = utc_now()
    conversation.updated_by = current_user.id
    session.add(conversation)

    # ``sequence_index`` lo asigna el servidor: máximo vigente + 1 (0 si es el primero).
    current_max = session.exec(
        select(func.max(Message.sequence_index)).where(
            Message.conversation_id == payload.conversation_id,
            Message.deleted_at.is_(None),
        )
    ).one()
    item = create_entity(
        session,
        Message,
        payload,
        values={
            "sequence_index": 0 if current_max is None else int(current_max) + 1,
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(MessageRead, item)
