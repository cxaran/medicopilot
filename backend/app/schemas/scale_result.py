"""Schemas de resultados de escalas clínicas persistidos (EPIC ESCALAS, fase 2).

Persistir un resultado de escala es una ESCRITURA clínica: el médico aprueba el borrador
(protocolo P1 en el copiloto). El puntaje, la interpretación, la fuente y ``computed_at``
NO se aceptan como entrada: el servidor RE-COMPUTA desde ``scale_id`` + ``inputs`` con el
motor determinista de la fase 1 y guarda el valor autoritativo. Si faltan o son inválidos
los insumos, responde 422 nombrando el campo (igual que la fase 1).
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

_COMPUTED_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}


class ScaleResultCreate(ApiWriteSchema):
    """Alta de un resultado de escala (borrador que el médico aprueba, P1).

    Solo se aceptan ``patient_id``, ``consultation_id`` (opcional), ``scale_id`` e
    ``inputs``: el servidor recomputa el puntaje/interpretación/fuente y fija
    ``computed_at``. Enviar un puntaje u otros campos calculados da 422 (extra forbid).
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece el resultado.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    consultation_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Consulta",
        description="Consulta asociada, si aplica.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    scale_id: str = Field(
        min_length=1,
        max_length=64,
        title="Escala",
        description="Id de la escala en el registro (p. ej. 'cha2ds2_vasc').",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    inputs: dict[str, Any] = Field(
        title="Insumos",
        description="Insumos requeridos por la escala; el servidor los valida y recomputa.",
        json_schema_extra={"ui": {"form": True, "widget": "json"}},
    )


class ScaleResultUpdate(ApiPatchSchema):
    """Edición parcial (PATCH).

    Permite re-vincular la consulta y/o recomputar con nuevos ``inputs`` (el servidor
    vuelve a calcular puntaje/interpretación/fuente desde la escala guardada). El puntaje
    y los campos calculados no se aceptan como entrada.
    """

    consultation_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Consulta",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    inputs: Optional[dict[str, Any]] = Field(
        default=None,
        title="Insumos",
        description="Nuevos insumos; si se envían, el servidor recomputa el resultado.",
        json_schema_extra={"ui": {"form": True, "widget": "json"}},
    )


class ScaleResultRead(ApiReadSchema):
    """Representación pública completa de un resultado de escala."""

    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: Optional[uuid.UUID] = None
    scale_id: str
    inputs: dict[str, Any]
    score: int
    interpretation_label: str
    source: str
    computed_at: datetime
    created_at: datetime
    updated_at: Optional[datetime] = None


class ScaleResultListItem(ApiReadSchema):
    """Versión de listado.

    Declara los campos de filtro (``patient_id``, ``scale_id``, ``computed_at``) que el
    motor de query exige presentes en el schema de listado.
    """

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    consultation_id: Optional[uuid.UUID] = Field(default=None, title="Consulta")
    scale_id: str = Field(title="Escala", json_schema_extra={"ui": {"list": True}})
    score: int = Field(title="Puntaje", json_schema_extra={"ui": {"list": True}})
    interpretation_label: str = Field(
        title="Interpretación", json_schema_extra={"ui": {"list": True}}
    )
    computed_at: datetime = Field(
        title="Computado", json_schema_extra=_COMPUTED_AT_LIST_FILTER_UI
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
