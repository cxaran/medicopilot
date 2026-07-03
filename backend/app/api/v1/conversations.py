"""Conversaciones del copiloto (chat-first): listar, crear y reiniciar bajo ``conversations:*``.

Los hilos son POR USUARIO (``created_by`` es el dueño): cada médico tiene SU chat por paciente y
SU chat global de inicio (``patient_id`` nulo); listar/leer/reiniciar sólo alcanza los hilos
propios (404 para los ajenos, sin revelar su existencia). Persiste el hilo para que el historial
sobreviva a la sesión. Reiniciar (``conversations:reset``) elimina FÍSICAMENTE los mensajes del
hilo —todos o desde un punto—, nunca datos clínicos: el chat no es expediente y su limpieza es
real (decisión 2026-07-03). Persistir el hilo NO es una escritura clínica; las escrituras
clínicas (borradores) siguen su camino de aprobación (P1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_or_404,
    get_owned_or_404,
    paginate_resource,
    serialize,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.conversation import Conversation
from backend.app.models.message import Message
from backend.app.models.patient import Patient
from backend.app.resources.registry import CONVERSATIONS
from backend.app.schemas.conversation import ConversationCreate, ConversationRead
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.conversation import (
    ConversationListItem,
    ConversationResetRequest,
    ConversationResetResult,
)
from backend.app.security.groups.conversations import ConversationPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/conversations", tags=["conversations"])

_NOT_FOUND = "Conversación no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar la conversación"


@router.get("", response_model=OffsetPage[ConversationListItem])
def list_conversations(
    session: SessionDep,
    query: Annotated[CONVERSATIONS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    current_user: CurrentUser,
    _: ConversationPermissions.READ.requiere,
) -> OffsetPage[ConversationListItem]:
    # Scope base: sólo conversaciones vigentes DEL PROPIO USUARIO (los hilos del copiloto son
    # por usuario; el filtro ``patient_id`` acota además al chat de un paciente).
    stmt = select(Conversation).where(
        Conversation.deleted_at.is_(None),
        Conversation.created_by == current_user.id,
    )
    return paginate_resource(CONVERSATIONS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=ConversationRead)
def get_conversation(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConversationPermissions.READ.requiere,
) -> ConversationRead:
    return serialize(
        ConversationRead,
        get_owned_or_404(
            session, Conversation, item_id, current_user.id, _NOT_FOUND, owner_field="created_by"
        ),
    )


@router.post("/{item_id}/reset", response_model=ConversationResetResult)
def reset_conversation(
    item_id: UUID,
    payload: ConversationResetRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConversationPermissions.RESET.requiere,
) -> ConversationResetResult:
    """Reinicia el hilo eliminando FÍSICAMENTE sus mensajes (el chat no es expediente).

    Sin ``from_sequence_index`` se vacía la conversación completa (el hilo queda utilizable y el
    ``sequence_index`` vuelve a empezar en 0); con él, se eliminan desde ese punto (inclusive)
    hasta el final y el siguiente append continúa desde el máximo restante (los índices liberados
    no se reusan: las filas ya no existen). Sólo sobre hilos propios. La conversación en sí NO se
    elimina. Borra historial de chat, nunca datos clínicos.
    """
    conversation = get_owned_or_404(
        session, Conversation, item_id, current_user.id, _NOT_FOUND, owner_field="created_by"
    )
    stmt = select(Message).where(Message.conversation_id == conversation.id)
    if payload.from_sequence_index is not None:
        stmt = stmt.where(Message.sequence_index >= payload.from_sequence_index)

    rows = session.exec(stmt).all()
    for message in rows:
        session.delete(message)
    conversation.updated_at = utc_now()
    conversation.updated_by = current_user.id
    session.add(conversation)
    session.commit()
    return ConversationResetResult(deleted_count=len(rows))


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConversationPermissions.CREATE.requiere,
) -> ConversationRead:
    # Si el chat es de un paciente, debe existir y estar vigente; el chat global no lleva paciente.
    if payload.patient_id is not None:
        patient = get_or_404(session, Patient, payload.patient_id, _PATIENT_NOT_FOUND)
        if patient.deleted_at is not None:
            api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)
    item = create_entity(
        session,
        Conversation,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(ConversationRead, item)
