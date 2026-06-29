"""Construcción del catálogo de plantillas del agente (proyección sobre el registry).

Una PLANTILLA = un recurso del RESOURCE_REGISTRY que el usuario puede leer y, además, crear y/o
editar (un flujo prellenable). Para cada uno se proyecta, filtrado por el RBAC del usuario:
  - los MODOS permitidos (create/edit/review),
  - el CONTRATO DE PRELLENADO (campos sugeribles = campos del formulario; obligatorios = los
    requeridos), reflejado del esquema de creación/edición YA declarado (no se duplica),
  - las ACCIONES permitidas.

Todo es READ-ONLY: reusa ``permission.check`` (la misma fuente que el endpoint de capabilities) y
``_form_fields`` (la misma reflexión de esquema que usa la proyección de formularios). Nunca muta.
"""

from typing import Optional

from pydantic import BaseModel

from backend.app.resources.projection import _form_fields
from backend.app.resources.registry import (
    RESOURCE_REGISTRY,
    ResourceDefinition,
    get_resource,
)
from backend.app.schemas.agent_template import (
    AgentTemplate,
    AgentTemplatePrefill,
    OpenTemplateRequest,
    OpenTemplateResolved,
)
from backend.app.schemas.user import SessionUser

_VALID_MODES = ("create", "edit", "review")


class TemplateResolutionError(Exception):
    """Error de resolución de una plantilla, con código y estado HTTP para el endpoint.

    Nombra siempre el motivo (plantilla desconocida/prohibida, modo inválido) para que el agente
    pida o elija una plantilla válida, en vez de inventar una.
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _prefill_contract(schema: Optional[type[BaseModel]]) -> AgentTemplatePrefill:
    """Deriva el contrato de prellenado del esquema de escritura ya declarado.

    Reutiliza ``_form_fields`` (misma reflexión que la proyección de capabilities): los campos del
    formulario son los sugeribles; los marcados como requeridos son los que el médico debe
    confirmar. Sin esquema (no debería ocurrir si hay modo create/edit) -> contrato vacío.
    """
    if schema is None:
        return AgentTemplatePrefill()
    fields = _form_fields(schema)
    return AgentTemplatePrefill(
        prefillable_fields=[field.name for field in fields],
        fields_requiring_confirmation=[field.name for field in fields if field.required],
    )


def _build_template(
    definition: ResourceDefinition, user: SessionUser
) -> Optional[AgentTemplate]:
    """Proyecta una plantilla si el usuario puede crear y/o editar el recurso; si no, ``None``.

    El permiso de lectura ya se verificó al elegir el recurso. ``review`` se ofrece cuando el
    recurso tiene detalle. Una plantilla SÓLO de lectura (sin create ni edit) no es prellenable y
    se omite del catálogo (no es un flujo que el agente abra para proponer valores)."""
    can_create = (
        definition.create_schema is not None
        and definition.create_permission is not None
        and definition.create_permission.check(user)
    )
    can_edit = (
        definition.update_schema is not None
        and definition.update_permission is not None
        and definition.update_permission.check(user)
    )
    if not (can_create or can_edit):
        return None

    modes: list[str] = []
    if can_create:
        modes.append("create")
    if can_edit:
        modes.append("edit")
    if definition.detail_url_template is not None:
        modes.append("review")

    # Contrato de prellenado: el esquema de creación si existe, si no el de edición.
    schema = definition.create_schema if can_create else definition.update_schema
    actions = [
        action.name for action in definition.actions if action.permission.check(user)
    ]

    return AgentTemplate(
        id=definition.name,
        label=definition.label,
        resource=definition.name,
        modes=modes,
        prefill=_prefill_contract(schema),
        actions=actions,
        create_path=definition.api_path if can_create else None,
        detail_path=definition.detail_url_template,
    )


def build_template_catalog(user: SessionUser) -> list[AgentTemplate]:
    """Catálogo de plantillas que el usuario puede usar (filtrado por RBAC). Read-only."""
    catalog: list[AgentTemplate] = []
    for definition in RESOURCE_REGISTRY:
        if not definition.read_permission.check(user):
            continue
        template = _build_template(definition, user)
        if template is not None:
            catalog.append(template)
    return catalog


def _mode_schema(
    definition: ResourceDefinition, mode: str
) -> Optional[type[BaseModel]]:
    """Esquema de escritura del modo (create/edit). ``review`` no prellena -> None."""
    if mode == "create":
        return definition.create_schema
    if mode == "edit":
        return definition.update_schema
    return None


def resolve_open_template(
    user: SessionUser, template_id: str, request: OpenTemplateRequest
) -> OpenTemplateResolved:
    """Valida y resuelve una propuesta de apertura de plantilla con prellenado. READ-ONLY.

    Reglas (nunca inventa ni guarda):
      - ``template_id`` debe existir en el catálogo del usuario (RBAC) -> si no, error NOMBRÁNDOLO.
      - ``mode`` debe estar entre los modos permitidos de la plantilla.
      - Sólo se aceptan campos que existan en el esquema del modo; los demás se DESCARTAN
        (``dropped_fields``), no se persisten ni se inventan.
      - ``allowed_actions`` se intersecta con las acciones permitidas por RBAC.
    """
    if request.mode not in _VALID_MODES:
        raise TemplateResolutionError(
            422, "invalid_mode", f"Modo inválido: '{request.mode}'."
        )

    definition = get_resource(template_id)
    # Mismo 404 para inexistente y no legible (no revela el catálogo), nombrando el id.
    if definition is None or not definition.read_permission.check(user):
        raise TemplateResolutionError(
            404, "template_not_found",
            f"Plantilla no encontrada o no disponible: '{template_id}'.",
        )

    template = _build_template(definition, user)
    if template is None:
        raise TemplateResolutionError(
            403, "template_forbidden",
            f"La plantilla '{template_id}' no está disponible para tu rol.",
        )

    if request.mode not in template.modes:
        raise TemplateResolutionError(
            422, "mode_not_allowed",
            f"Modo '{request.mode}' no permitido para la plantilla '{template_id}' "
            f"(permitidos: {', '.join(template.modes)}).",
        )

    # Campos válidos del esquema del modo (vacío en review: no se prellena).
    schema = _mode_schema(definition, request.mode)
    fields = _form_fields(schema) if schema is not None else []
    valid_names = {field.name for field in fields}
    required_names = [field.name for field in fields if field.required]

    # Partición: prefilled tiene prioridad sobre suggested para un mismo campo.
    values: dict[str, object] = {}
    prefilled_fields: list[str] = []
    suggested_fields: list[str] = []
    dropped: list[str] = []

    for name, value in request.prefilled.items():
        if name in valid_names:
            values[name] = value
            prefilled_fields.append(name)
        else:
            dropped.append(name)
    for name, value in request.suggested.items():
        if name not in valid_names:
            dropped.append(name)
            continue
        if name in values:
            continue  # ya prellenado (prefilled gana); no se duplica
        values[name] = value
        suggested_fields.append(name)

    # Fragmentos de origen: sólo de campos aceptados (trazabilidad sin ruido).
    accepted = set(values)
    source_fragments = {
        name: frag for name, frag in request.source_fragments.items() if name in accepted
    }
    # Acciones: si el agente sugiere algunas, se intersectan con las permitidas por RBAC; si no
    # sugiere ninguna, se devuelven TODAS las que el usuario puede ejecutar en la plantilla.
    if request.allowed_actions:
        allowed_actions = [a for a in request.allowed_actions if a in template.actions]
    else:
        allowed_actions = list(template.actions)

    if request.mode == "create":
        method, url_template = "POST", definition.api_path
    elif request.mode == "edit":
        method, url_template = "PATCH", f"{definition.api_path}/{{id}}"
    else:
        method = "GET"
        url_template = definition.detail_url_template or definition.api_path

    return OpenTemplateResolved(
        template_id=template_id,
        resource=definition.name,
        label=definition.label,
        mode=request.mode,
        method=method,
        url_template=url_template,
        values=values,
        prefilled_fields=prefilled_fields,
        suggested_fields=suggested_fields,
        fields_requiring_confirmation=required_names,
        dropped_fields=dropped,
        source_fragments=source_fragments,
        source_overall=request.source_overall,
        allowed_actions=allowed_actions,
    )
