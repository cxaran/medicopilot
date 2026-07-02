"""Conversaciones del copiloto (chat-first): listar, crear y reiniciar bajo ``conversations:*``.

Cada paciente es un chat (``patient_id`` del hilo); el chat global del inicio tiene ``patient_id``
nulo. Persiste el hilo para que el historial sobreviva a la sesión. La baja es lógica
(``deleted_at``/``deleted_by``) y los listados excluyen las conversaciones eliminadas. Reiniciar
(``conversations:reset``) da de baja lógica los mensajes del hilo —todos o desde un punto—, nunca
datos clínicos. Persistir el hilo NO es una escritura clínica; las escrituras clínicas (borradores)
siguen su camino de aprobación (P1).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_active_or_404,
    get_or_404,
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
    _: ConversationPermissions.READ.requiere,
) -> OffsetPage[ConversationListItem]:
    # Scope base: sólo conversaciones vigentes (excluye las eliminadas lógicamente).
    stmt = select(Conversation).where(Conversation.deleted_at.is_(None))
    return paginate_resource(CONVERSATIONS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=ConversationRead)
def get_conversation(
    item_id: UUID,
    session: SessionDep,
    _: ConversationPermissions.READ.requiere,
) -> ConversationRead:
    return serialize(ConversationRead, get_active_or_404(session, Conversation, item_id, _NOT_FOUND))


@router.post("/{item_id}/reset", response_model=ConversationResetResult)
def reset_conversation(
    item_id: UUID,
    payload: ConversationResetRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: ConversationPermissions.RESET.requiere,
) -> ConversationResetResult:
    """Reinicia el hilo con baja LÓGICA en lote de sus mensajes vigentes.

    Sin ``from_sequence_index`` se vacía la conversación completa (el hilo queda utilizable y el
    ``sequence_index`` vuelve a empezar en 0, porque el siguiente índice se calcula sobre los
    vigentes); con él, se eliminan desde ese punto (inclusive) hasta el final. La conversación en
    sí NO se elimina. Borra historial de chat, nunca datos clínicos.
    """
    conversation = get_active_or_404(session, Conversation, item_id, _NOT_FOUND)
    stmt = select(Message).where(
        Message.conversation_id == conversation.id,
        Message.deleted_at.is_(None),
    )
    if payload.from_sequence_index is not None:
        stmt = stmt.where(Message.sequence_index >= payload.from_sequence_index)

    now = utc_now()
    rows = session.exec(stmt).all()
    for message in rows:
        message.deleted_at = now
        message.deleted_by = current_user.id
        message.updated_at = now
        message.updated_by = current_user.id
        session.add(message)
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
