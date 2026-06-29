"""Reglas deterministas de calidad/seguridad (fase 1).

Cada regla es una FUNCIÓN PURA: recibe el/los registro(s) estructurado(s) ya cargados y
devuelve cero o más ``QualityFlag``. No accede a la base, no escribe, no muta y no inventa:
sólo marca lo que el criterio detecta de forma demostrable sobre datos reales.

Las tres reglas de la fase 1:
  1. ``vitals_out_of_physiologic_range`` — un signo vital fuera de un rango fisiológico de
     plausibilidad CONSERVADOR (orientado a cazar errores de captura/unidad, no anormalidad).
     Además, un valor de laboratorio cuantitativo negativo (físicamente imposible).
  2. ``consultation_note_incomplete`` — campos SOAP relevantes vacíos en una consulta en
     BORRADOR (antes de firmar).
  3. ``prescription_item_incomplete`` — un medicamento de receta sin dosis o sin frecuencia.

NOTA sobre la regla 3: el modelo ``PrescriptionItem`` NO tiene un campo "vía" (route): sus
campos son medication_name, presentation, dose, frequency, duration, instructions. Por eso la
regla verifica dosis y frecuencia (las dos presentes en el modelo); la "vía" no se evalúa por
no existir en el esquema (no se inventa un campo).
"""

from collections import defaultdict
from typing import Optional, Sequence

from backend.app.models.consultation import Consultation
from backend.app.models.enums import ConsultationStatus
from backend.app.models.lab_result import LabResult
from backend.app.models.prescription import PrescriptionItem
from backend.app.models.vital_sign import VitalSign
from backend.app.quality_checks.base import (
    Bound,
    QualityFlag,
    ResolvedDrug,
    Severity,
    normalize_text,
)

RULE_VITALS_OUT_OF_RANGE = "vitals_out_of_physiologic_range"
RULE_LAB_VALUE_NON_PHYSICAL = "lab_value_non_physical"
RULE_CONSULTATION_NOTE_INCOMPLETE = "consultation_note_incomplete"
RULE_PRESCRIPTION_ITEM_INCOMPLETE = "prescription_item_incomplete"
RULE_DRUG_ALLERGY = "drug_allergy_cross_check"
RULE_DUPLICATE_MEDICATION = "duplicate_active_medication"

# Marcador especial de origen cuando el cruce fármaco-alergia no puede ejecutarse.
DRUG_ALLERGY_UNAVAILABLE_REF = "drug_allergy:no_disponible"

# Rangos fisiológicos de PLAUSIBILIDAD (no de normalidad): valores fuera de estos límites son
# prácticamente incompatibles con un registro humano vivo y suelen indicar un error de captura
# o de unidad. Son CONSERVADORES y amplios a propósito: sólo disparan ante lo extremo, no ante
# lo meramente anormal. Cada límite se CITA en la bandera para que el médico lo verifique.
VITAL_BOUNDS: dict[str, Bound] = {
    "systolic_bp": Bound(
        40, 300, "mmHg", "TA sistólica",
        "rango fisiológico de plausibilidad 40–300 mmHg",
    ),
    "diastolic_bp": Bound(
        20, 200, "mmHg", "TA diastólica",
        "rango fisiológico de plausibilidad 20–200 mmHg",
    ),
    "temperature_c": Bound(
        30.0, 45.0, "°C", "Temperatura",
        "rango fisiológico de plausibilidad 30–45 °C (sospecha de °F mal capturados)",
    ),
    "heart_rate_bpm": Bound(
        20, 300, "lpm", "Frecuencia cardiaca",
        "rango fisiológico de plausibilidad 20–300 lpm",
    ),
    "respiratory_rate_rpm": Bound(
        4, 80, "rpm", "Frecuencia respiratoria",
        "rango fisiológico de plausibilidad 4–80 rpm",
    ),
    "oxygen_saturation": Bound(
        50, 100, "%", "Saturación de oxígeno",
        "rango de plausibilidad de medición 50–100 %",
    ),
}


def _filled(value: Optional[str]) -> bool:
    """True si un campo de texto tiene contenido no vacío."""
    return value is not None and str(value).strip() != ""


def _fmt(value: float) -> str:
    """Formato compacto de un número (sin ceros/decimales sobrantes)."""
    return f"{value:g}"


def check_vital_sign(vital: VitalSign) -> list[QualityFlag]:
    """Marca los signos vitales presentes que caen fuera del rango de plausibilidad citado."""
    flags: list[QualityFlag] = []
    for field, bound in VITAL_BOUNDS.items():
        raw = getattr(vital, field)
        if raw is None:
            continue
        value = float(raw)
        if value < bound.low or value > bound.high:
            flags.append(
                QualityFlag(
                    rule_id=RULE_VITALS_OUT_OF_RANGE,
                    severity=Severity.WARNING,
                    message_es=(
                        f"{bound.label} = {_fmt(value)} {bound.unit} está fuera del rango "
                        f"fisiológico de plausibilidad; revisa un posible error de captura o "
                        f"de unidad."
                    ),
                    source_ref=f"vital_sign:{vital.id}.{field}",
                    threshold_cited=f"{bound.label}: {bound.citation}",
                )
            )
    return flags


def check_lab_result(lab: LabResult) -> list[QualityFlag]:
    """Marca un valor de laboratorio cuantitativo negativo (físicamente imposible).

    NO marca valores meramente fuera del rango de referencia (eso es 'anormal', no
    'implausible', y ya lo cubre ``abnormal_flag``): sólo lo físicamente imposible.
    """
    flags: list[QualityFlag] = []
    if lab.value_numeric is not None and float(lab.value_numeric) < 0:
        unit = f" {lab.unit}" if lab.unit else ""
        flags.append(
            QualityFlag(
                rule_id=RULE_LAB_VALUE_NON_PHYSICAL,
                severity=Severity.WARNING,
                message_es=(
                    f"El resultado de '{lab.analyte_name}' es negativo "
                    f"({_fmt(float(lab.value_numeric))}{unit}); un valor cuantitativo de "
                    f"laboratorio no puede ser negativo: revisa la captura."
                ),
                source_ref=f"lab_result:{lab.id}.value_numeric",
                threshold_cited="Un resultado de laboratorio cuantitativo no puede ser negativo.",
            )
        )
    return flags


# Campos SOAP relevantes que se esperan en una consulta antes de firmarla. reason_for_visit es
# NOT NULL (siempre existe), así que la verificación se centra en S/O/A; el Plan se trata aparte
# (basta con uno de tratamiento/indicaciones/seguimiento).
_REQUIRED_NOTE_FIELDS: tuple[tuple[str, str], ...] = (
    ("current_illness", "Subjetivo (padecimiento actual)"),
    ("physical_examination", "Objetivo (exploración física)"),
    ("clinical_assessment", "Análisis (valoración clínica)"),
)
_PLAN_FIELDS = ("treatment", "instructions", "follow_up_plan")
_NOTE_CITATION = "Nota clínica completa antes de la firma: Subjetivo/Objetivo/Análisis/Plan."


def check_consultation_note(consultation: Consultation) -> list[QualityFlag]:
    """Marca campos SOAP vacíos en una consulta en BORRADOR (antes de firmar).

    Si la consulta ya está finalizada (firmada), no aplica: la regla es de pre-firma.
    """
    if consultation.status != ConsultationStatus.DRAFT:
        return []
    flags: list[QualityFlag] = []
    for field, label in _REQUIRED_NOTE_FIELDS:
        if not _filled(getattr(consultation, field)):
            flags.append(
                QualityFlag(
                    rule_id=RULE_CONSULTATION_NOTE_INCOMPLETE,
                    severity=Severity.INFO,
                    message_es=f"Falta {label} en la consulta antes de firmarla.",
                    source_ref=f"consultation:{consultation.id}.{field}",
                    threshold_cited=_NOTE_CITATION,
                )
            )
    if not any(_filled(getattr(consultation, field)) for field in _PLAN_FIELDS):
        flags.append(
            QualityFlag(
                rule_id=RULE_CONSULTATION_NOTE_INCOMPLETE,
                severity=Severity.INFO,
                message_es=(
                    "Falta el Plan (tratamiento, indicaciones o plan de seguimiento) en la "
                    "consulta antes de firmarla."
                ),
                source_ref=f"consultation:{consultation.id}.plan",
                threshold_cited=_NOTE_CITATION,
            )
        )
    return flags


_RX_CITATION = "Una indicación de medicamento debe especificar al menos dosis y frecuencia."


def check_prescription_item(item: PrescriptionItem) -> list[QualityFlag]:
    """Marca un medicamento de receta sin dosis o sin frecuencia.

    El modelo no tiene campo 'vía' (route): no se evalúa lo inexistente.
    """
    flags: list[QualityFlag] = []
    for field, label in (("dose", "la dosis"), ("frequency", "la frecuencia")):
        if not _filled(getattr(item, field)):
            flags.append(
                QualityFlag(
                    rule_id=RULE_PRESCRIPTION_ITEM_INCOMPLETE,
                    severity=Severity.WARNING,
                    message_es=(
                        f"El medicamento '{item.medication_name}' no especifica {label}."
                    ),
                    source_ref=f"prescription_item:{item.id}.{field}",
                    threshold_cited=_RX_CITATION,
                )
            )
    return flags


_DRUG_ALLERGY_UNAVAILABLE_MSG = (
    "Cruce fármaco-alergia NO disponible: no hay fuente de farmacología (MCP) configurada o no "
    "respondió. No se concluye ausencia de alergias; verifícalo manualmente."
)
_DRUG_ALLERGY_CITATION = (
    "Coincidencia por ingrediente/clase resuelta por la fuente de farmacología configurada."
)


def check_drug_allergy(
    medications: Sequence[ResolvedDrug],
    allergies: Sequence[ResolvedDrug],
    *,
    source_available: bool,
) -> list[QualityFlag]:
    """Marca un medicamento prescrito que coincide con una alergia documentada del paciente.

    La coincidencia es por INGREDIENTE o CLASE ya resueltos por la fuente de farmacología
    (no hay tabla de fármacos en esta lógica). Si la fuente NO está disponible, devuelve un
    ÚNICO marcador 'no disponible' (severidad info): NUNCA inventa una coincidencia ni concluye
    ausencia de alergias. Sólo marca solapamientos REALES resueltos; cita lo coincidente.
    """
    if not source_available:
        return [
            QualityFlag(
                rule_id=RULE_DRUG_ALLERGY,
                severity=Severity.INFO,
                message_es=_DRUG_ALLERGY_UNAVAILABLE_MSG,
                source_ref=DRUG_ALLERGY_UNAVAILABLE_REF,
                threshold_cited=None,
            )
        ]
    flags: list[QualityFlag] = []
    for med in medications:
        for allergy in allergies:
            matched = sorted(
                (med.ingredients & allergy.ingredients) | (med.classes & allergy.classes)
            )
            if matched:
                matched_str = ", ".join(matched)
                flags.append(
                    QualityFlag(
                        rule_id=RULE_DRUG_ALLERGY,
                        severity=Severity.WARNING,
                        message_es=(
                            f"El medicamento '{med.label}' coincide con una alergia documentada "
                            f"del paciente ('{allergy.label}') por: {matched_str}."
                        ),
                        source_ref=f"{med.ref}|{allergy.ref}:{matched_str}",
                        threshold_cited=_DRUG_ALLERGY_CITATION,
                    )
                )
    return flags


_DUPLICATE_CITATION = (
    "Mismo medicamento (por nombre normalizado) en más de una indicación activa."
)


def check_duplicate_medications(
    active_items: Sequence[tuple[str, str]],
) -> list[QualityFlag]:
    """Marca un medicamento que aparece más de una vez entre las indicaciones ACTIVAS.

    ``active_items`` es una secuencia de (ref, nombre). La coincidencia es por nombre
    normalizado (minúsculas/sin acentos): un subconjunto CONSERVADOR de 'mismo ingrediente'
    que no requiere fuente externa y no inventa nada. El orden es estable.
    """
    groups: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for ref, name in active_items:
        key = normalize_text(name or "")
        if key:
            groups[key].append((ref, name))
    flags: list[QualityFlag] = []
    for key in sorted(groups):
        members = groups[key]
        if len(members) >= 2:
            label = members[0][1]
            refs = ", ".join(ref for ref, _ in members)
            flags.append(
                QualityFlag(
                    rule_id=RULE_DUPLICATE_MEDICATION,
                    severity=Severity.WARNING,
                    message_es=(
                        f"El medicamento '{label}' aparece {len(members)} veces en las "
                        f"indicaciones activas del paciente; revisa una posible duplicidad."
                    ),
                    source_ref=refs,
                    threshold_cited=_DUPLICATE_CITATION,
                )
            )
    return flags
