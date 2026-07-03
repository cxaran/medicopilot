"""Mensajes de las conversaciones del copiloto: listar, agregar, actualizar metadatos y eliminar
bajo ``messages:*``.

Persiste cada turno del hilo (rol, contenido, payload). El ``sequence_index`` lo asigna el
SERVIDOR (máximo + 1 de la conversación) con la fila de la conversación bloqueada (FOR UPDATE):
dos appends concurrentes al mismo hilo se serializan y la restricción única
``(conversation_id, sequence_index)`` es la última garantía. Los hilos son POR USUARIO: cada
operación exige que la conversación pertenezca al actor (``created_by``), con 404 para no revelar
hilos ajenos. El borrado es FÍSICO (limpieza del historial de chat, nunca de datos clínicos: el
chat no es expediente). Persistir un mensaje NO es una escritura clínica (no requiere P1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    lock_active_or_404,
    paginate_resource,
    serialize,
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


def _load_owned_message(session: Session, message_id: UUID, actor_id: UUID) -> Message:
    """Mensaje cuyo hilo pertenece al actor, o 404 (no revela mensajes de hilos ajenos)."""
    message = session.get(Message, message_id)
    if message is not None:
        conversation = session.get(Conversation, message.conversation_id)
        if (
            conversation is not None
            and conversation.deleted_at is None
            and conversation.created_by == actor_id
        ):
            return message
    api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)


@router.get("", response_model=OffsetPage[MessageListItem])
def list_messages(
    session: SessionDep,
    query: Annotated[MESSAGES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    current_user: CurrentUser,
    _: MessagePermissions.READ.requiere,
) -> OffsetPage[MessageListItem]:
    # Scope base: sólo mensajes de hilos VIGENTES del propio usuario (los hilos del copiloto
    # son por usuario). Se consultan por conversación con el filtro exacto ``conversation_id``
    # y se ordenan por ``sequence_index``.
    stmt = (
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Conversation.deleted_at.is_(None),
            Conversation.created_by == current_user.id,
        )
    )
    return paginate_resource(MESSAGES, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=MessageRead)
def get_message(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.READ.requiere,
) -> MessageRead:
    return serialize(MessageRead, _load_owned_message(session, item_id, current_user.id))


@router.patch("/{item_id}", response_model=MessageRead)
def update_message(
    item_id: UUID,
    payload: MessageUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.UPDATE.requiere,
) -> MessageRead:
    """Actualiza los METADATOS de presentación de un mensaje del propio hilo (sólo ``payload``).

    Permite reflejar estado que cambia DESPUÉS del alta —p. ej. una interfaz generada ya usada,
    para restaurarla contraída al recargar el hilo—. El contenido, el rol y el ``sequence_index``
    son inmutables por esta vía; no es una escritura clínica.
    """
    item = _load_owned_message(session, item_id, current_user.id)
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
    """Borrado FÍSICO de un mensaje puntual del propio hilo (limpieza del chat, no clínico).

    La fila se elimina de verdad (el chat no es expediente); el resto del hilo conserva su
    orden (el ``sequence_index`` de los demás no se recalcula y los índices liberados no se
    reusan: el siguiente append parte del máximo restante).
    """
    item = _load_owned_message(session, item_id, current_user.id)
    session.delete(item)
    session.commit()


@router.post("", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
def create_message(
    payload: MessageCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MessagePermissions.CREATE.requiere,
) -> MessageRead:
    # La conversación debe existir, estar vigente y ser DEL ACTOR. Se toma con FOR UPDATE:
    # serializa los appends concurrentes al mismo hilo (el MAX+1 de abajo deja de ser una
    # carrera) y de paso protege el toque de ``updated_at``.
    conversation = lock_active_or_404(
        session, Conversation, payload.conversation_id, _CONVERSATION_NOT_FOUND
    )
    if conversation.created_by != current_user.id:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _CONVERSATION_NOT_FOUND)

    # La conversación registra su ÚLTIMA ACTIVIDAD: los chats recientes (sidebar) se ordenan por
    # ``updated_at``. El ``onupdate`` del modelo no dispara aquí (se INSERTA un mensaje, no se
    # actualiza la fila de la conversación), así que se marca explícito en el mismo commit.
    conversation.updated_at = utc_now()
    conversation.updated_by = current_user.id
    session.add(conversation)

    # ``sequence_index`` lo asigna el servidor: máximo + 1 (0 si es el primero). Con la
    # conversación bloqueada, dos appends no pueden leer el mismo máximo.
    current_max = session.exec(
        select(func.max(Message.sequence_index)).where(
            Message.conversation_id == payload.conversation_id,
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
