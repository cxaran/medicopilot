"""Tipos puros de las verificaciones de calidad/seguridad. Sin dependencias de framework."""

import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


def normalize_text(value: str) -> str:
    """Minúsculas, sin acentos, recortado: para comparar nombres de forma estable."""
    folded = unicodedata.normalize("NFD", value.lower())
    return "".join(ch for ch in folded if unicodedata.category(ch) != "Mn").strip()


class Severity(str, Enum):
    """Severidad de una bandera. Ninguna implica acción automática: todas son a revisar."""

    INFO = "info"
    WARNING = "warning"


@dataclass(frozen=True)
class QualityFlag:
    """Una posible incidencia detectada por una regla, para que el médico la revise.

    No es un diagnóstico ni una corrección: es una sugerencia. ``source_ref`` apunta al
    registro/campo concreto que la disparó (``modelo:id.campo``) y ``threshold_cited`` cita
    el umbral/criterio usado, para que el médico pueda verificarlo.
    """

    rule_id: str
    severity: Severity
    message_es: str
    source_ref: str
    threshold_cited: Optional[str] = None


@dataclass(frozen=True)
class Bound:
    """Rango fisiológico de plausibilidad de un signo vital, con su cita."""

    low: float
    high: float
    unit: str
    label: str
    citation: str


@dataclass(frozen=True)
class ResolvedDrug:
    """Un fármaco o alérgeno resuelto a sus ingredientes/clases (para el cruce fármaco-alergia).

    ``ref`` es el origen (``modelo:id``) y ``label`` el nombre legible. Los conjuntos vienen
    normalizados (minúsculas, sin acentos) por la fuente de farmacología.
    """

    ref: str
    label: str
    ingredients: frozenset[str] = field(default_factory=frozenset)
    classes: frozenset[str] = field(default_factory=frozenset)


@dataclass(frozen=True)
class InteractionFinding:
    """Resultado de consultar una interacción entre DOS medicamentos activos del paciente.

    ``interacts`` y ``severity``/``source`` provienen ÍNTEGRAMENTE de la fuente de farmacología
    (no se infieren ni se inventan aquí). ``ref_a``/``ref_b`` son los orígenes (``modelo:id``).
    """

    ref_a: str
    label_a: str
    ref_b: str
    label_b: str
    interacts: bool
    severity: Optional[str] = None
    source: Optional[str] = None


@dataclass(frozen=True)
class RenalFunction:
    """Función renal del paciente tomada de un LabResult real (eGFR medida).

    ``value`` es el eGFR numérico; ``measured_label`` describe el dato (analito + fecha) para
    citarlo en la bandera. ``source_ref`` apunta al ``lab_result:id`` concreto.
    """

    value: float
    unit: Optional[str]
    source_ref: str
    measured_label: str
