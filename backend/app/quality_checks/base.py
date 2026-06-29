"""Tipos puros de las verificaciones de calidad/seguridad. Sin dependencias de framework."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


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
