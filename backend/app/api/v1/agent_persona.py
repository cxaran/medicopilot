"""Persona del copiloto del usuario autenticado (owner-only, singleton).

Capa de PERSONALIDAD del system-prompt (P4): tono, enfoque de especialidad, idioma y
estilo de consulta, configurables por cada médico. NO es un recurso RBAC global (no se
registra en RESOURCE_REGISTRY): cada persona pertenece a un usuario y solo su dueño la
ve/edita. Es config en claro (no secreta). Singleton por usuario: GET devuelve la persona
(o vacía) y PUT hace upsert. La capa de SEGURIDAD clínica NO está aquí: es fija y la posee
el código del frontend; la persona nunca puede debilitarla.
"""

from fastapi import APIRouter
from sqlmodel import select

from backend.app.api.resource_actions import commit_or_conflict
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.agent_persona import AgentPersona
from backend.app.schemas.agent_persona import AgentPersonaRead, AgentPersonaUpdate

router = APIRouter(prefix="/users/me/agent-persona", tags=["agent-persona"])


@router.get("", response_model=AgentPersonaRead)
def get_persona(session: SessionDep, current_user: CurrentUser) -> AgentPersonaRead:
    persona = session.exec(
        select(AgentPersona).where(AgentPersona.user_id == current_user.id)
    ).first()
    # Persona del dueño, o una vacía si aún no configuró ninguna.
    return AgentPersonaRead.model_validate(persona) if persona else AgentPersonaRead()


@router.put("", response_model=AgentPersonaRead)
def upsert_persona(
    payload: AgentPersonaUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AgentPersonaRead:
    data = payload.model_dump(exclude_unset=True)
    persona = session.exec(
        select(AgentPersona).where(AgentPersona.user_id == current_user.id)
    ).first()
    if persona is None:
        persona = AgentPersona(user_id=current_user.id, created_by=current_user.id, **data)
        session.add(persona)
    else:
        for field, value in data.items():
            setattr(persona, field, value)
        persona.updated_by = current_user.id
    commit_or_conflict(session, "No se pudo guardar la persona")
    session.refresh(persona)
    return AgentPersonaRead.model_validate(persona)
