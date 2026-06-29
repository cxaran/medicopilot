"""Catálogo de plantillas del agente (arquitectura de UI híbrida), filtrado por RBAC.

READ-ONLY: el agente consulta qué plantillas REGISTRADAS puede usar para PROPONER una (con
prellenado) en vez de inventar UI. Sólo requiere autenticación (``CurrentUser``); cada plantilla y
sus modos/acciones ya van filtrados por los permisos del usuario. Es una proyección sobre el
RESOURCE_REGISTRY + capabilities (no un catálogo paralelo): nunca muta.
"""

from fastapi import APIRouter

from backend.app.agent_templates import (
    TemplateResolutionError,
    build_template_catalog,
    resolve_open_template,
    resolve_prefill_from_extraction,
)
from backend.app.api.resource_actions import api_error
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.schemas.agent_template import (
    AgentTemplate,
    OpenTemplateRequest,
    OpenTemplateResolved,
    PrefillFromExtractionRequest,
)

router = APIRouter(prefix="/agent", tags=["agent-templates"])


@router.get(
    "/templates",
    response_model=list[AgentTemplate],
    response_model_exclude_none=True,
)
def list_agent_templates(current_user: CurrentUser) -> list[AgentTemplate]:
    return build_template_catalog(current_user)


@router.post(
    "/templates/{template_id}/prefill",
    response_model=OpenTemplateResolved,
    response_model_exclude_none=True,
)
def open_template_prefill(
    template_id: str,
    payload: OpenTemplateRequest,
    current_user: CurrentUser,
) -> OpenTemplateResolved:
    """Valida y resuelve una propuesta de apertura de plantilla con prellenado. READ-ONLY.

    No persiste nada: valida ``template_id``/modo/campos contra el catálogo + RBAC y devuelve el
    plan que el frontend renderiza PRELLENADO; la aceptación del médico va por la ruta P1.
    """
    try:
        return resolve_open_template(current_user, template_id, payload)
    except TemplateResolutionError as error:
        api_error(error.status_code, error.code, error.message)


@router.post(
    "/templates/{template_id}/prefill-from-extraction",
    response_model=OpenTemplateResolved,
    response_model_exclude_none=True,
)
def prefill_from_extraction(
    template_id: str,
    payload: PrefillFromExtractionRequest,
    current_user: CurrentUser,
) -> OpenTemplateResolved:
    """Mapea un RESULTADO DE EXTRACCIÓN (transcripción/texto libre) a una plantilla prellenada.

    Cierra el flujo 'hablar/dictar -> formulario registrado prellenado -> aprobar'. READ-ONLY: la
    extracción LLM queda fuera de alcance; aquí entra su resultado ya estructurado y se reparte de
    forma DETERMINISTA por confianza (prellenado/sugerido/descartado) contra el esquema de la
    plantilla. No persiste nada: la aceptación del médico va por la ruta P1.
    """
    try:
        return resolve_prefill_from_extraction(current_user, template_id, payload)
    except TemplateResolutionError as error:
        api_error(error.status_code, error.code, error.message)
