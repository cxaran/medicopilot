"""Lógica PURA de conciliación de medicación. Sin acceso a BD ni a red: las resoluciones de
farmacología se inyectan ya hechas, de modo que es determinista y unit-testeable sin red.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal, Optional

from backend.app.quality_checks.base import normalize_text

FLAG_PRESCRIBED_NOT_REPORTED = "prescribed_not_reported"
FLAG_REPORTED_NOT_PRESCRIBED = "reported_not_prescribed"
FLAG_DUPLICATE = "duplicate_medication"

MedicationSource = Literal["prescribed", "reported"]


class ResolverStatus(str, Enum):
    """Cómo se determinó la clave de un medicamento."""

    RESOLVED = "resolved"  # por ingrediente/clase (resolutor consultado y cubrió el fármaco)
    NAME_ONLY = "name_only"  # resolutor disponible pero no cubre el fármaco -> por nombre
    NO_DISPONIBLE = "no_disponible"  # resolutor no disponible -> por nombre, sin ingrediente/clase


@dataclass(frozen=True)
class ResolvedMedication:
    """Un medicamento de una fuente, ya resuelto a ingredientes/clases (frozensets normalizados)."""

    ref: str
    name: str
    source: MedicationSource
    ingredients: frozenset[str] = field(default_factory=frozenset)
    classes: frozenset[str] = field(default_factory=frozenset)
    covered: bool = False  # el resolutor cubrió este fármaco (devolvió ingrediente/clase)


@dataclass(frozen=True)
class ConsolidatedMedication:
    """Una entrada consolidada de la lista única de medicación del paciente."""

    key: str
    display_name: str
    ingredient_or_class: Optional[str]
    resolver_status: str
    prescribed_refs: tuple[str, ...]
    reported_refs: tuple[str, ...]


@dataclass(frozen=True)
class ReconciliationFlag:
    """Una discrepancia para revisión del médico (no es una corrección)."""

    kind: str
    message_es: str
    source_refs: tuple[str, ...]
    ingredient_or_class: Optional[str]
    resolver_status: str


def _key_for(med: ResolvedMedication, source_available: bool) -> tuple[str, Optional[str], ResolverStatus]:
    """Clave de agrupación + ingrediente/clase mostrado + estado del resolutor."""
    if source_available and med.covered:
        if med.ingredients:
            chosen = min(med.ingredients)
        else:
            chosen = min(med.classes)
        return chosen, chosen, ResolverStatus.RESOLVED
    name_key = normalize_text(med.name or "")
    status = ResolverStatus.NO_DISPONIBLE if not source_available else ResolverStatus.NAME_ONLY
    return name_key, None, status


def reconcile_medications(
    medications: list[ResolvedMedication],
    *,
    source_available: bool,
) -> tuple[list[ConsolidatedMedication], list[ReconciliationFlag]]:
    """Consolida por ingrediente/clase (o nombre si no hay resolutor) y deriva las discrepancias.

    Devuelve (lista consolidada, banderas). Determinista; no muta nada.
    """
    grouped: dict[str, list[ResolvedMedication]] = defaultdict(list)
    display: dict[str, str] = {}
    ingredient_label: dict[str, Optional[str]] = {}
    status_by_key: dict[str, ResolverStatus] = {}

    for med in medications:
        if not (med.name or "").strip():
            continue
        key, label, status = _key_for(med, source_available)
        grouped[key].append(med)
        display.setdefault(key, med.name)
        ingredient_label.setdefault(key, label)
        # El peor estado manda para mostrar (resolved < name_only < no_disponible en "confianza").
        prev = status_by_key.get(key)
        if prev is None or _status_rank(status) > _status_rank(prev):
            status_by_key[key] = status

    consolidated: list[ConsolidatedMedication] = []
    flags: list[ReconciliationFlag] = []

    for key in sorted(grouped):
        members = grouped[key]
        prescribed = [m for m in members if m.source == "prescribed"]
        reported = [m for m in members if m.source == "reported"]
        prescribed_refs = tuple(m.ref for m in prescribed)
        reported_refs = tuple(m.ref for m in reported)
        label = ingredient_label[key]
        status = status_by_key[key].value
        name = display[key]

        consolidated.append(
            ConsolidatedMedication(
                key=key,
                display_name=name,
                ingredient_or_class=label,
                resolver_status=status,
                prescribed_refs=prescribed_refs,
                reported_refs=reported_refs,
            )
        )

        what = label or f"'{name}'"
        # Discrepancia 1/2: presente en una fuente y ausente en la otra.
        if prescribed and not reported:
            flags.append(
                ReconciliationFlag(
                    kind=FLAG_PRESCRIBED_NOT_REPORTED,
                    message_es=(
                        f"{name} está PRESCRITO pero el paciente no lo reporta como medicamento "
                        f"actual; confirma si lo está tomando."
                    ),
                    source_refs=prescribed_refs,
                    ingredient_or_class=label,
                    resolver_status=status,
                )
            )
        elif reported and not prescribed:
            flags.append(
                ReconciliationFlag(
                    kind=FLAG_REPORTED_NOT_PRESCRIBED,
                    message_es=(
                        f"El paciente reporta tomar {name} pero NO hay una receta activa en el "
                        f"expediente; revisa el origen de la indicación."
                    ),
                    source_refs=reported_refs,
                    ingredient_or_class=label,
                    resolver_status=status,
                )
            )

        # Discrepancia 3: duplicidad dentro de una misma fuente (mismo ingrediente/clase en más de
        # una receta, o reportado más de una vez). Prescrito + reportado (uno y uno) es CONSISTENTE.
        if len(prescribed_refs) >= 2 or len(reported_refs) >= 2:
            flags.append(
                ReconciliationFlag(
                    kind=FLAG_DUPLICATE,
                    message_es=(
                        f"{name} ({what}) aparece más de una vez en la medicación activa; revisa "
                        f"una posible duplicidad."
                    ),
                    source_refs=prescribed_refs + reported_refs,
                    ingredient_or_class=label,
                    resolver_status=status,
                )
            )

    return consolidated, flags


def _status_rank(status: ResolverStatus) -> int:
    return {
        ResolverStatus.RESOLVED: 0,
        ResolverStatus.NAME_ONLY: 1,
        ResolverStatus.NO_DISPONIBLE: 2,
    }[status]
