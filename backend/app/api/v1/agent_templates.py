"""Catálogo de plantillas del agente (arquitectura de UI híbrida), filtrado por RBAC.

READ-ONLY: el agente consulta qué plantillas REGISTRADAS puede usar para PROPONER una (con
prellenado) en vez de inventar UI. Sólo requiere autenticación (``CurrentUser``); cada plantilla y
sus modos/acciones ya van filtrados por los permisos del usuario. Es una proyección sobre el
RESOURCE_REGISTRY + capabilities (no un catálogo paralelo): nunca muta.
"""

from fastapi import APIRouter

from backend.app.agent_templates import build_template_catalog
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.schemas.agent_template import AgentTemplate

router = APIRouter(prefix="/agent", tags=["agent-templates"])


@router.get(
    "/templates",
    response_model=list[AgentTemplate],
    response_model_exclude_none=True,
)
def list_agent_templates(current_user: CurrentUser) -> list[AgentTemplate]:
    return build_template_catalog(current_user)
