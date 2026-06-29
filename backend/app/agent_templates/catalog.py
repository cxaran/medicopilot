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
    PrefillFromExtractionRequest,
)
from backend.app.schemas.user import SessionUser

_VALID_MODES = ("create", "edit", "review")

# Reparto por confianza del seam EXTRACCIÓN->PREFILL (MP-CTRL-0118). Deterministas y documentados:
#   confianza >= THRESHOLD            -> prellenado (alta confianza)
#   FLOOR <= confianza <  THRESHOLD   -> sugerido   (a confirmar)
#   confianza <  FLOOR                -> descartado por confianza insuficiente
PREFILL_CONFIDENCE_THRESHOLD = 0.8
SUGGEST_CONFIDENCE_FLOOR = 0.5


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


def _validate_target(
    user: SessionUser, template_id: str, mode: str
) -> tuple[ResourceDefinition, AgentTemplate]:
    """Valida modo + plantilla + RBAC y devuelve (definición, plantilla). Compartido por ambos seams.

    Reglas (nunca revela el catálogo ni inventa):
      - ``mode`` debe ser uno válido (create/edit/review).
      - ``template_id`` debe existir y ser legible por el usuario -> si no, 404 NOMBRÁNDOLO (mismo
        404 para inexistente y no legible).
      - la plantilla debe ser prellenable por el rol (create/edit) -> si no, 403.
      - ``mode`` debe estar entre los modos permitidos de la plantilla -> si no, 422.
    """
    if mode not in _VALID_MODES:
        raise TemplateResolutionError(422, "invalid_mode", f"Modo inválido: '{mode}'.")

    definition = get_resource(template_id)
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

    if mode not in template.modes:
        raise TemplateResolutionError(
            422, "mode_not_allowed",
            f"Modo '{mode}' no permitido para la plantilla '{template_id}' "
            f"(permitidos: {', '.join(template.modes)}).",
        )

    return definition, template


def _finalize_resolved(
    definition: ResourceDefinition,
    template: AgentTemplate,
    mode: str,
    *,
    values: dict[str, object],
    prefilled_fields: list[str],
    suggested_fields: list[str],
    required_names: list[str],
    dropped: list[str],
    source_fragments: dict[str, str],
    source_overall: Optional[str],
    requested_actions: list[str],
) -> OpenTemplateResolved:
    """Construye el plan resuelto común a ambos seams (open-template y extracción). READ-ONLY.

    Misma forma ``OpenTemplateResolved`` de 0116 -> el renderizador + la ruta P1 la pintan igual.
    """
    # Fragmentos de origen: sólo de campos aceptados (trazabilidad sin ruido).
    accepted = set(values)
    kept_fragments = {
        name: frag for name, frag in source_fragments.items() if name in accepted
    }
    # Acciones: si el agente sugiere algunas, se intersectan con las permitidas por RBAC; si no
    # sugiere ninguna, se devuelven TODAS las que el usuario puede ejecutar en la plantilla.
    if requested_actions:
        allowed_actions = [a for a in requested_actions if a in template.actions]
    else:
        allowed_actions = list(template.actions)

    if mode == "create":
        method, url_template = "POST", definition.api_path
    elif mode == "edit":
        method, url_template = "PATCH", f"{definition.api_path}/{{id}}"
    else:
        method = "GET"
        url_template = definition.detail_url_template or definition.api_path

    return OpenTemplateResolved(
        template_id=definition.name,
        resource=definition.name,
        label=definition.label,
        mode=mode,
        method=method,
        url_template=url_template,
        values=values,
        prefilled_fields=prefilled_fields,
        suggested_fields=suggested_fields,
        fields_requiring_confirmation=required_names,
        dropped_fields=dropped,
        source_fragments=kept_fragments,
        source_overall=source_overall,
        allowed_actions=allowed_actions,
    )


def _mode_field_names(
    definition: ResourceDefinition, mode: str
) -> tuple[set[str], list[str]]:
    """(nombres válidos, nombres obligatorios) del esquema del modo (vacío en review)."""
    schema = _mode_schema(definition, mode)
    fields = _form_fields(schema) if schema is not None else []
    return {field.name for field in fields}, [field.name for field in fields if field.required]


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
    definition, template = _validate_target(user, template_id, request.mode)
    valid_names, required_names = _mode_field_names(definition, request.mode)

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

    return _finalize_resolved(
        definition, template, request.mode,
        values=values,
        prefilled_fields=prefilled_fields,
        suggested_fields=suggested_fields,
        required_names=required_names,
        dropped=dropped,
        source_fragments=request.source_fragments,
        source_overall=request.source_overall,
        requested_actions=request.allowed_actions,
    )


def resolve_prefill_from_extraction(
    user: SessionUser, template_id: str, request: PrefillFromExtractionRequest
) -> OpenTemplateResolved:
    """Mapea un RESULTADO DE EXTRACCIÓN a un plan de plantilla prellenada. READ-ONLY (seam 0118).

    El reparto es DETERMINISTA por confianza (la extracción LLM queda fuera de alcance: aquí entra
    su resultado ya estructurado). Reglas (nunca inventa, coacciona ni guarda):
      - Valida ``template_id``/modo/RBAC igual que ``resolve_open_template`` (mismos 404/403/422).
      - Campo FUERA del esquema del modo -> ``dropped_fields`` (no se inventa ni se coacciona).
      - Confianza >= ``PREFILL_CONFIDENCE_THRESHOLD`` -> prellenado; >= ``SUGGEST_CONFIDENCE_FLOOR``
        -> sugerido (a confirmar); por debajo del piso -> ``dropped_fields`` por confianza
        insuficiente (no entra al formulario).
      - Campo del esquema AUSENTE de la extracción -> se deja vacío; sigue listado en
        ``fields_requiring_confirmation`` si es obligatorio. La ausencia NO es una afirmación
        negativa: nunca se rellena un valor por defecto que implique un negativo clínico.
      - Si un campo viene repetido, gana la PRIMERA ocurrencia (determinista).
    """
    definition, template = _validate_target(user, template_id, request.mode)
    valid_names, required_names = _mode_field_names(definition, request.mode)

    values: dict[str, object] = {}
    prefilled_fields: list[str] = []
    suggested_fields: list[str] = []
    dropped: list[str] = []
    source_fragments: dict[str, str] = {}
    seen: set[str] = set()

    for extracted in request.extracted_fields:
        name = extracted.field
        # Campo fuera del esquema -> descartado (no se inventa ni se coacciona).
        if name not in valid_names:
            dropped.append(name)
            continue
        if name in seen:
            continue  # repetido: gana la primera ocurrencia
        seen.add(name)
        # Confianza por debajo del piso -> descartado por confianza insuficiente (no entra al form).
        if extracted.confidence < SUGGEST_CONFIDENCE_FLOOR:
            dropped.append(name)
            continue
        values[name] = extracted.value
        if extracted.confidence >= PREFILL_CONFIDENCE_THRESHOLD:
            prefilled_fields.append(name)
        else:
            suggested_fields.append(name)
        if extracted.source_fragment is not None:
            source_fragments[name] = extracted.source_fragment

    return _finalize_resolved(
        definition, template, request.mode,
        values=values,
        prefilled_fields=prefilled_fields,
        suggested_fields=suggested_fields,
        required_names=required_names,
        dropped=dropped,
        source_fragments=source_fragments,
        source_overall=request.source_overall,
        requested_actions=request.allowed_actions,
    )
