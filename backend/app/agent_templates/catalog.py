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
from backend.app.resources.registry import RESOURCE_REGISTRY, ResourceDefinition
from backend.app.schemas.agent_template import AgentTemplate, AgentTemplatePrefill
from backend.app.schemas.user import SessionUser


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
