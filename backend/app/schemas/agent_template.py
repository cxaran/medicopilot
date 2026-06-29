"""Catálogo de PLANTILLAS para el agente (arquitectura de UI híbrida).

Proyección READ-ONLY y agent-friendly sobre el RESOURCE_REGISTRY + el sistema de capabilities:
el agente consulta primero qué plantillas REGISTRADAS existen (flujos comunes/clínicos/regulados)
para PROPONER una en vez de inventar UI. No duplica los esquemas: refleja los ya declarados.
"""

from typing import Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema


class AgentTemplatePrefill(ApiReadSchema):
    """Contrato de prellenado: qué campos acepta el agente sugerir y cuáles confirmar.

    Derivado del esquema de creación/edición ya declarado (los campos del formulario). El médico
    SIEMPRE revisa y aprueba; ``fields_requiring_confirmation`` son los obligatorios que no pueden
    quedar vacíos al guardar.
    """

    prefillable_fields: list[str] = Field(
        default_factory=list,
        description="Campos cuyo valor puede sugerir el agente (se prellenan para revisión).",
    )
    fields_requiring_confirmation: list[str] = Field(
        default_factory=list,
        description="Campos obligatorios que el médico debe confirmar antes de guardar.",
    )


class AgentTemplate(ApiReadSchema):
    """Una plantilla registrada que el agente puede proponer abrir (con prellenado)."""

    id: str = Field(
        description="Id estable de la plantilla (= nombre del recurso del registry, p. ej. 'patients')."
    )
    label: str = Field(description="Etiqueta legible en español.")
    resource: str = Field(description="Recurso del registry al que mapea la plantilla.")
    modes: list[str] = Field(
        default_factory=list,
        description="Modos de apertura permitidos al usuario: create | edit | review.",
    )
    prefill: AgentTemplatePrefill = Field(description="Contrato de prellenado de la plantilla.")
    actions: list[str] = Field(
        default_factory=list,
        description="Acciones permitidas (filtradas por el RBAC del usuario).",
    )
    create_path: Optional[str] = Field(
        default=None,
        description="Ruta de creación (POST) cuando el modo create está permitido.",
    )
    detail_path: Optional[str] = Field(
        default=None,
        description="Plantilla de ruta de detalle (GET) cuando el modo review está permitido.",
    )
