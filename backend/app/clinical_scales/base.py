"""Tipos base del registro de escalas clínicas (EPIC ESCALAS, fase 1).

Las escalas son LÓGICA CLÍNICA FIJA: se definen en código (no en BD). El cómputo es
DETERMINISTA y puro (sin azar, sin modelo). Toda salida es APOYO A LA DECISIÓN que el
médico confirma; nunca un diagnóstico ni algo que se guarde o ejecute solo.

La validación es estricta: TODOS los insumos declarados son obligatorios. Si falta o es
inválido un insumo, ``coerce_inputs`` lanza ``ScaleValidationError`` nombrando los campos;
nunca se asume ni se usa un valor clínico por defecto (no hay puntaje parcial).
"""

from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

from backend.app.schemas.error import ErrorItem

InputType = Literal["boolean", "enum", "number"]


@dataclass(frozen=True)
class ScaleInputSpec:
    """Especificación de un insumo requerido por una escala."""

    key: str
    label: str  # etiqueta en español
    type: InputType
    description: Optional[str] = None
    allowed_values: Optional[tuple[str, ...]] = None  # para ``enum``
    min: Optional[float] = None  # para ``number``
    max: Optional[float] = None  # para ``number``


@dataclass(frozen=True)
class InterpretationBand:
    """Banda de interpretación de un puntaje, con su fuente citada."""

    label: str  # etiqueta en español (p. ej. "Riesgo alto")
    detail: str  # detalle en español
    source: str  # cita de la guía/estudio que sustenta la banda


@dataclass(frozen=True)
class ScaleComputeResult:
    """Resultado del cómputo de una escala (apoyo a la decisión, no diagnóstico)."""

    score: int
    interpretation_label: str
    interpretation_detail: str
    sources: list[str]


@dataclass(frozen=True)
class ScaleDefinition:
    """Definición en código de una escala clínica validada."""

    id: str
    name: str  # nombre en español
    description: str  # descripción en español
    inputs: tuple[ScaleInputSpec, ...]
    source: str  # cita principal de la escala
    compute: Callable[[dict[str, Any]], ScaleComputeResult]


class ScaleValidationError(Exception):
    """Insumos faltantes o inválidos; se traduce a 422 nombrando los campos."""

    def __init__(self, errors: list[ErrorItem]) -> None:
        self.errors = errors
        super().__init__("Insumos de la escala faltantes o inválidos.")


def coerce_inputs(
    definition: ScaleDefinition, raw: dict[str, Any]
) -> dict[str, Any]:
    """Valida y normaliza los insumos. TODOS son obligatorios.

    Lanza ``ScaleValidationError`` con un ``ErrorItem`` por cada campo faltante o inválido.
    No asume valores por defecto: un insumo clínico ausente es un error, no un cero.
    """
    errors: list[ErrorItem] = []
    coerced: dict[str, Any] = {}

    for spec in definition.inputs:
        if spec.key not in raw or raw[spec.key] is None:
            errors.append(ErrorItem(field=spec.key, message=f"Falta el insumo requerido: {spec.label}."))
            continue
        value = raw[spec.key]

        if spec.type == "boolean":
            if not isinstance(value, bool):
                errors.append(ErrorItem(field=spec.key, message=f"{spec.label} debe ser verdadero o falso."))
                continue
            coerced[spec.key] = value

        elif spec.type == "number":
            # ``bool`` es subclase de ``int``; se rechaza explícitamente para un numérico.
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                errors.append(ErrorItem(field=spec.key, message=f"{spec.label} debe ser numérico."))
                continue
            number = float(value)
            if spec.min is not None and number < spec.min:
                errors.append(ErrorItem(field=spec.key, message=f"{spec.label} no puede ser menor que {spec.min:g}."))
                continue
            if spec.max is not None and number > spec.max:
                errors.append(ErrorItem(field=spec.key, message=f"{spec.label} no puede ser mayor que {spec.max:g}."))
                continue
            coerced[spec.key] = number

        elif spec.type == "enum":
            allowed = spec.allowed_values or ()
            if not isinstance(value, str) or value not in allowed:
                errors.append(
                    ErrorItem(
                        field=spec.key,
                        message=f"{spec.label} debe ser uno de: {', '.join(allowed)}.",
                    )
                )
                continue
            coerced[spec.key] = value

    if errors:
        raise ScaleValidationError(errors)
    return coerced
