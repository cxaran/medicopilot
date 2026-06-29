"""Schemas de notas clínicas estructuradas (EPIC DOCS, fase 1: nota SOAP).

Componer una nota SOAP es una ESCRITURA clínica: el médico aprueba el borrador (protocolo
P1 en el copiloto). La nota se compone a partir de los datos REALES de una consulta; las
secciones sin datos de origen quedan vacías (no se inventan). El servidor deriva
``patient_id`` de la consulta y fija ``status='draft'``: NUNCA se finaliza de forma autónoma.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field, model_validator

from backend.app.models.enums import ClinicalNoteStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

_TEXTAREA_UI: dict[str, Any] = {"ui": {"form": True, "widget": "textarea"}}


def _has_content(*values: Optional[str]) -> bool:
    return any(v is not None and v.strip() != "" for v in values)


class ClinicalNoteCreate(ApiWriteSchema):
    """Alta de una nota SOAP (borrador que el médico aprueba, P1).

    Sólo se aceptan ``consultation_id`` y las cuatro secciones: el servidor deriva el
    paciente de la consulta y fija ``status='draft'``. Enviar patient_id/status da 422
    (extra forbid). Debe traer al menos una sección con contenido.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta",
        description="Consulta de la que se compone la nota.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    subjective: Optional[str] = Field(
        default=None, title="S — Subjetivo", json_schema_extra=_TEXTAREA_UI
    )
    objective: Optional[str] = Field(
        default=None, title="O — Objetivo", json_schema_extra=_TEXTAREA_UI
    )
    assessment: Optional[str] = Field(
        default=None, title="A — Análisis", json_schema_extra=_TEXTAREA_UI
    )
    plan: Optional[str] = Field(
        default=None, title="P — Plan", json_schema_extra=_TEXTAREA_UI
    )

    @model_validator(mode="after")
    def validate_has_content(self) -> "ClinicalNoteCreate":
        if not _has_content(self.subjective, self.objective, self.assessment, self.plan):
            raise ValueError("La nota debe incluir al menos una sección con contenido")
        return self


class ClinicalNoteUpdate(ApiPatchSchema):
    """Edición parcial de las secciones de la nota (PATCH).

    ``consultation_id``, ``status`` y la auditoría no se declaran: enviarlos da 422.
    """

    subjective: Optional[str] = Field(
        default=None, title="S — Subjetivo", json_schema_extra=_TEXTAREA_UI
    )
    objective: Optional[str] = Field(
        default=None, title="O — Objetivo", json_schema_extra=_TEXTAREA_UI
    )
    assessment: Optional[str] = Field(
        default=None, title="A — Análisis", json_schema_extra=_TEXTAREA_UI
    )
    plan: Optional[str] = Field(
        default=None, title="P — Plan", json_schema_extra=_TEXTAREA_UI
    )


class ClinicalNoteRead(ApiReadSchema):
    """Representación pública completa de una nota (incluye render Markdown)."""

    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: uuid.UUID
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None
    status: ClinicalNoteStatus
    content_markdown: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClinicalNoteListItem(ApiReadSchema):
    """Versión de listado.

    Declara los campos de filtro (``patient_id``, ``consultation_id``, ``status``) que el
    motor de query exige presentes en el schema de listado.
    """

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    consultation_id: uuid.UUID = Field(title="Consulta")
    status: ClinicalNoteStatus = Field(
        title="Estado", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
