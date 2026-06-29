"""Registro de escalas clínicas validadas (EPIC ESCALAS, fase 1).

Cómputo determinista y sin estado de escalas REALES y citables. Toda salida es APOYO A LA
DECISIÓN que el médico confirma; no es un diagnóstico ni se guarda de forma autónoma.
"""

from backend.app.clinical_scales.base import (
    InputType,
    InterpretationBand,
    ScaleComputeResult,
    ScaleDefinition,
    ScaleInputSpec,
    ScaleValidationError,
    coerce_inputs,
)
from backend.app.clinical_scales.definitions import SCALES


def get_scale(scale_id: str) -> ScaleDefinition | None:
    """Devuelve la definición de la escala por id, o ``None`` si no existe."""
    return SCALES.get(scale_id)


def list_scales() -> list[ScaleDefinition]:
    """Lista todas las escalas registradas, en orden estable."""
    return list(SCALES.values())


def compute_scale(definition: ScaleDefinition, raw_inputs: dict) -> ScaleComputeResult:
    """Valida los insumos y computa la escala.

    Lanza ``ScaleValidationError`` (→ 422) si falta o es inválido algún insumo; nunca asume
    valores por defecto ni produce puntajes parciales.
    """
    coerced = coerce_inputs(definition, raw_inputs)
    return definition.compute(coerced)


__all__ = [
    "SCALES",
    "InputType",
    "InterpretationBand",
    "ScaleComputeResult",
    "ScaleDefinition",
    "ScaleInputSpec",
    "ScaleValidationError",
    "coerce_inputs",
    "compute_scale",
    "get_scale",
    "list_scales",
]
