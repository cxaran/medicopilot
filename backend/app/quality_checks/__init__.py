"""Verificaciones deterministas de calidad/seguridad clínica (NUEVO CLUSTER, fase 1).

Capacidad de SÓLO LECTURA: reglas deterministas y puras sobre los datos estructurados YA
existentes que MARCAN posibles problemas para la revisión del médico. NUNCA corrige, NUNCA
escribe, NUNCA muta datos clínicos y NUNCA inventa un problema: cada bandera (flag) apunta a
un registro/campo real que la regla detecta de forma demostrable. No hay modelo/LLM en las
reglas: lógica determinista pura. Toda bandera es una SUGERENCIA que el médico decide.

No hay persistencia en la fase 1: las verificaciones se computan al vuelo y se devuelven; no
se guarda nada (por eso no hay modelo de BD ni migración).
"""

from backend.app.quality_checks.base import (
    InteractionFinding,
    QualityFlag,
    RenalFunction,
    ResolvedDrug,
    Severity,
)
from backend.app.quality_checks.pharmacology import (
    InteractionResolution,
    PharmaResolution,
    check_interaction,
    pharmacology_source_available,
    resolve_pharmacology,
)
from backend.app.quality_checks.rules import (
    DRUG_ALLERGY_UNAVAILABLE_REF,
    DRUG_INTERACTION_UNAVAILABLE_REF,
    RENAL_ADJUSTED_DRUGS,
    RULE_CONSULTATION_NOTE_INCOMPLETE,
    RULE_DRUG_ALLERGY,
    RULE_DRUG_INTERACTION,
    RULE_DUPLICATE_MEDICATION,
    RULE_LAB_VALUE_NON_PHYSICAL,
    RULE_PRESCRIPTION_ITEM_INCOMPLETE,
    RULE_RENAL_DOSE,
    RULE_VITALS_OUT_OF_RANGE,
    VITAL_BOUNDS,
    check_consultation_note,
    check_drug_allergy,
    check_drug_interactions,
    check_duplicate_medications,
    check_lab_result,
    check_prescription_item,
    check_renal_dose,
    check_vital_sign,
)

__all__ = [
    "InteractionFinding",
    "QualityFlag",
    "RenalFunction",
    "ResolvedDrug",
    "Severity",
    "InteractionResolution",
    "PharmaResolution",
    "check_interaction",
    "pharmacology_source_available",
    "resolve_pharmacology",
    "DRUG_ALLERGY_UNAVAILABLE_REF",
    "DRUG_INTERACTION_UNAVAILABLE_REF",
    "RENAL_ADJUSTED_DRUGS",
    "RULE_CONSULTATION_NOTE_INCOMPLETE",
    "RULE_DRUG_ALLERGY",
    "RULE_DRUG_INTERACTION",
    "RULE_DUPLICATE_MEDICATION",
    "RULE_LAB_VALUE_NON_PHYSICAL",
    "RULE_PRESCRIPTION_ITEM_INCOMPLETE",
    "RULE_RENAL_DOSE",
    "RULE_VITALS_OUT_OF_RANGE",
    "VITAL_BOUNDS",
    "check_consultation_note",
    "check_drug_allergy",
    "check_drug_interactions",
    "check_duplicate_medications",
    "check_lab_result",
    "check_prescription_item",
    "check_renal_dose",
    "check_vital_sign",
]
