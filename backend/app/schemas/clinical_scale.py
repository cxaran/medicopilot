"""Schemas de las escalas clínicas validadas (EPIC ESCALAS, fase 1).

Apoyo a la decisión: el endpoint lista las escalas con sus insumos requeridos y computa un
puntaje determinista. La validación es estricta: si falta o es inválido un insumo, la API
responde 422 nombrando el campo (el copiloto debe PREGUNTAR el dato, nunca asumirlo).
"""

from typing import Any, Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class ScaleInputSpecRead(ApiReadSchema):
    """Especificación de un insumo requerido por una escala."""

    key: str
    label: str
    type: str  # boolean | enum | number
    description: Optional[str] = None
    allowed_values: Optional[list[str]] = None
    min: Optional[float] = None
    max: Optional[float] = None


class ScaleDefinitionRead(ApiReadSchema):
    """Definición pública de una escala: insumos requeridos y fuente citada."""

    id: str
    name: str
    description: str
    source: str
    inputs: list[ScaleInputSpecRead]


class ScaleComputeRequest(ApiWriteSchema):
    """Insumos para computar una escala. TODOS los declarados son obligatorios."""

    inputs: dict[str, Any] = Field(
        title="Insumos",
        description="Mapa clave→valor con todos los insumos requeridos por la escala.",
    )


class ScaleComputeResponse(ApiReadSchema):
    """Resultado del cómputo: puntaje, interpretación y fuentes citadas."""

    scale_id: str
    score: int
    interpretation_label: str
    interpretation_detail: str
    sources: list[str]
