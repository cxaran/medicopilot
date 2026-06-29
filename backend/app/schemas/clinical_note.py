"""Schemas de notas clínicas estructuradas (EPIC DOCS, fase 1: nota SOAP).

Componer una nota SOAP es una ESCRITURA clínica: el médico aprueba el borrador (protocolo
P1 en el copiloto). La nota se compone a partir de los datos REALES de una consulta; las
secciones sin datos de origen quedan vacías (no se inventan). El servidor deriva
``patient_id`` de la consulta y fija ``status='draft'``: NUNCA se finaliza de forma autónoma.
"""

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import Field, model_validator

from backend.app.models.enums import ClinicalNoteKind, ClinicalNoteStatus
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


class MedicalCertificateCreate(ApiWriteSchema):
    """Alta de una constancia/justificante de asistencia (borrador P1).

    Sólo se acepta la consulta y un motivo opcional: el servidor toma de la consulta la
    identidad del paciente, la fecha de asistencia y el médico + cédula (snapshot), y fija
    ``kind='constancia'`` y ``status='draft'``. No inventa hechos de asistencia.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta", description="Consulta a la que asistió el paciente."
    )
    motivo: Optional[str] = Field(
        default=None, title="Motivo", description="Motivo/diagnóstico a declarar, si aplica."
    )


class SickLeaveCreate(ApiWriteSchema):
    """Alta de una incapacidad/justificante de reposo (borrador P1).

    El servidor toma de la consulta la identidad del paciente y el médico + cédula. El
    DIAGNÓSTICO y el periodo de reposo son decisión médica: ``rest_days`` es OBLIGATORIO y
    debe ser ≥ 1; NUNCA se asume ni se inventa. Fija ``kind='incapacidad'``, ``status='draft'``.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta", description="Consulta de la que deriva la incapacidad."
    )
    diagnosis: str = Field(
        min_length=1, title="Diagnóstico/motivo", description="Diagnóstico o motivo del reposo."
    )
    rest_start_date: date = Field(
        title="Inicio del reposo", description="Fecha de inicio del reposo."
    )
    rest_days: int = Field(
        ge=1, title="Días de reposo", description="Número de días de reposo (decisión médica)."
    )


class ReferralCreate(ApiWriteSchema):
    """Alta de una referencia o contrarreferencia (borrador P1).

    Un solo endpoint con discriminador ``kind`` (las dos son direcciones de la misma carta):
    - ``referencia``: requiere ``destination`` (institución/servicio/especialidad — decisión
      explícita; NUNCA se inventa); ``reason`` y ``clinical_summary`` opcionales (compuestos de
      la consulta).
    - ``contrarreferencia``: requiere al menos ``findings`` o ``recommendations``.
    El servidor toma de la consulta la identidad del paciente y el médico + cédula; fija
    ``status='draft'``. No envíes paciente/médico/estado (extra forbid).
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta", description="Consulta de la que se compone la carta."
    )
    kind: Literal["referencia", "contrarreferencia"] = Field(
        title="Tipo", description="referencia (envío) o contrarreferencia (respuesta de vuelta)."
    )
    destination: Optional[str] = Field(
        default=None,
        title="Destino",
        description="Institución/servicio/especialidad destino (obligatorio en referencia).",
    )
    reason: Optional[str] = Field(
        default=None, title="Motivo de la referencia", description="Motivo del envío, si aplica."
    )
    clinical_summary: Optional[str] = Field(
        default=None,
        title="Resumen clínico",
        description="Resumen (motivo, hallazgos, diagnóstico presuntivo, estudios/tratamiento).",
    )
    findings: Optional[str] = Field(
        default=None,
        title="Hallazgos / lo realizado",
        description="En contrarreferencia: lo que el especialista hizo/encontró.",
    )
    recommendations: Optional[str] = Field(
        default=None,
        title="Recomendaciones / plan",
        description="En contrarreferencia: recomendaciones/plan para el médico de origen.",
    )

    @model_validator(mode="after")
    def validate_by_kind(self) -> "ReferralCreate":
        if self.kind == "referencia":
            if not (self.destination and self.destination.strip()):
                raise ValueError("La referencia requiere el destino (institución/servicio/especialidad)")
        else:  # contrarreferencia
            if not _has_content(self.findings, self.recommendations):
                raise ValueError(
                    "La contrarreferencia requiere al menos hallazgos o recomendaciones"
                )
        return self


class ClinicalNoteRead(ApiReadSchema):
    """Representación pública completa de una nota (incluye render Markdown)."""

    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: uuid.UUID
    kind: ClinicalNoteKind
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None
    details: Optional[dict[str, Any]] = None
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
    kind: ClinicalNoteKind = Field(
        title="Tipo", json_schema_extra={"ui": {"list": True}}
    )
    status: ClinicalNoteStatus = Field(
        title="Estado", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
