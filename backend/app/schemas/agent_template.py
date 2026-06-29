"""Catálogo de PLANTILLAS para el agente (arquitectura de UI híbrida).

Proyección READ-ONLY y agent-friendly sobre el RESOURCE_REGISTRY + el sistema de capabilities:
el agente consulta primero qué plantillas REGISTRADAS existen (flujos comunes/clínicos/regulados)
para PROPONER una en vez de inventar UI. No duplica los esquemas: refleja los ya declarados.
"""

from typing import Any, Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


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


class OpenTemplateRequest(ApiWriteSchema):
    """Lo que el agente PROPONE al abrir una plantilla (paso 3 de la UI híbrida).

    Es una propuesta para PRELLENAR un formulario registrado; NO guarda nada. La plataforma valida
    contra el catálogo + RBAC, descarta campos que no existan en el esquema (no inventa) y deja que
    el médico revise/edite/apruebe por la ruta P1.
    """

    mode: str = Field(description="Modo de apertura: create | edit | review.")
    prefilled: dict[str, Any] = Field(
        default_factory=dict,
        description="Valores en los que el agente confía (se prellenan para revisión).",
    )
    suggested: dict[str, Any] = Field(
        default_factory=dict,
        description="Valores de menor confianza (se muestran marcados como sugerencia).",
    )
    source_fragments: dict[str, str] = Field(
        default_factory=dict,
        description="Fragmento de origen (transcripción/fuente) que respalda cada campo.",
    )
    source_overall: Optional[str] = Field(
        default=None,
        description="Fragmento de origen general que respalda la propuesta (trazabilidad).",
    )
    allowed_actions: list[str] = Field(
        default_factory=list,
        description="Acciones que el agente sugiere habilitar tras la revisión (se filtran por RBAC).",
    )


class OpenTemplateResolved(ApiReadSchema):
    """Plan resuelto y validado para abrir una plantilla PRELLENADA (read-only, nada guardado).

    El frontend resuelve ``resource``/``mode`` al formulario registrado (capability) y lo renderiza
    con ``values`` como valores iniciales, marcando los campos sugeridos y a confirmar y mostrando
    los fragmentos de origen. La aceptación del médico se enruta por la ruta P1 existente.
    """

    template_id: str = Field(description="Id de la plantilla (recurso del registry).")
    resource: str = Field(description="Recurso destino.")
    label: str = Field(description="Etiqueta legible en español.")
    mode: str = Field(description="Modo resuelto: create | edit | review.")
    method: str = Field(description="Método HTTP del envío tras aprobación (POST/PATCH/GET).")
    url_template: str = Field(description="Ruta (o plantilla de ruta) del envío tras aprobación.")
    values: dict[str, Any] = Field(
        default_factory=dict,
        description="Valores aceptados (prefilled+suggested) SÓLO de campos del esquema.",
    )
    prefilled_fields: list[str] = Field(
        default_factory=list, description="Campos prellenados (alta confianza)."
    )
    suggested_fields: list[str] = Field(
        default_factory=list, description="Campos sugeridos (menor confianza; a revisar)."
    )
    fields_requiring_confirmation: list[str] = Field(
        default_factory=list, description="Campos obligatorios que el médico debe confirmar."
    )
    dropped_fields: list[str] = Field(
        default_factory=list,
        description="Campos propuestos que NO existen en el esquema: se descartan (no se inventan).",
    )
    source_fragments: dict[str, str] = Field(
        default_factory=dict, description="Fragmentos de origen, sólo de campos aceptados."
    )
    source_overall: Optional[str] = Field(
        default=None, description="Fragmento de origen general (trazabilidad)."
    )
    allowed_actions: list[str] = Field(
        default_factory=list, description="Acciones permitidas tras la revisión (filtradas por RBAC)."
    )
