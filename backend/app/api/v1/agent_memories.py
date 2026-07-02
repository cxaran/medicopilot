"""Memorias del agente del usuario autenticado (owner-only).

NO es un recurso RBAC global (no se registra en RESOURCE_REGISTRY): cada memoria
pertenece a un usuario y solo su dueño puede verla/editarla/borrarla. El ``content``
en claro solo se acepta como entrada y se cifra antes de guardar; al DUEÑO se le
devuelve descifrado (es su memoria), a nadie más. El contenido nunca se loguea.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.agent.crypto import decrypt_secret, encrypt_secret
from backend.app.api.resource_actions import (
    commit_or_conflict,
    get_owned_or_404,
    serialize_with,
    soft_delete_entity,
    update_entity_values,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.agent_memory import AgentMemory
from backend.app.schemas.agent_memory import (
    AgentMemoryCreate,
    AgentMemoryRead,
    AgentMemoryUpdate,
)
from backend.app.schemas.auth import MessageResponse

router = APIRouter(prefix="/users/me/agent-memories", tags=["agent-memories"])


def _serialize(memory: AgentMemory) -> AgentMemoryRead:
    """Construye el Read con el ``content`` DESCIFRADO (uso del dueño)."""
    return serialize_with(
        AgentMemoryRead,
        memory,
        {"content": decrypt_secret(memory.content_encrypted)},
    )


@router.get("", response_model=list[AgentMemoryRead])
def list_memories(
    session: SessionDep,
    current_user: CurrentUser,
    patient_id: Optional[uuid.UUID] = Query(default=None),
) -> list[AgentMemoryRead]:
    stmt = select(AgentMemory).where(
        AgentMemory.user_id == current_user.id,
        AgentMemory.deleted_at.is_(None),
    )
    if patient_id is not None:
        stmt = stmt.where(AgentMemory.patient_id == patient_id)
    stmt = stmt.order_by(AgentMemory.created_at)
    rows = session.exec(stmt).all()
    return [_serialize(row) for row in rows]


@router.post("", response_model=AgentMemoryRead, status_code=status.HTTP_201_CREATED)
def create_memory(
    payload: AgentMemoryCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AgentMemoryRead:
    memory = AgentMemory(
        user_id=current_user.id,
        title=payload.title,
        content_encrypted=encrypt_secret(payload.content),
        kind=payload.kind,
        patient_id=payload.patient_id,
        consultation_id=payload.consultation_id,
        created_by=current_user.id,
    )
    session.add(memory)
    commit_or_conflict(session, "No se pudo guardar la memoria")
    session.refresh(memory)
    return _serialize(memory)


@router.patch("/{memory_id}", response_model=AgentMemoryRead)
def update_memory(
    memory_id: uuid.UUID,
    payload: AgentMemoryUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AgentMemoryRead:
    memory = get_owned_or_404(
        session, AgentMemory, memory_id, current_user.id, "Memoria no encontrada"
    )

    data = payload.model_dump(exclude_unset=True)
    # El contenido se recifra si viene; nunca se guarda en claro.
    if "content" in data:
        content = data.pop("content")
        if content is not None:
            data["content_encrypted"] = encrypt_secret(content)

    update_entity_values(
        session,
        memory,
        data,
        actor_id=current_user.id,
        conflict_message="No se pudo actualizar la memoria",
    )
    return _serialize(memory)


@router.delete("/{memory_id}", response_model=MessageResponse)
def delete_memory(
    memory_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> MessageResponse:
    memory = get_owned_or_404(
        session, AgentMemory, memory_id, current_user.id, "Memoria no encontrada"
    )
    soft_delete_entity(
        session,
        memory,
        actor_id=current_user.id,
        already_deleted_message="La memoria ya estaba eliminada",
    )
    return MessageResponse(message="Memoria eliminada correctamente")
