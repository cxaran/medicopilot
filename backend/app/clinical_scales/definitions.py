"""Definiciones en código de las escalas clínicas validadas (EPIC ESCALAS, fase 1).

Dos escalas REALES y citables: CHA2DS2-VASc (riesgo de ACV en fibrilación auricular) y
Wells para TVP (probabilidad de trombosis venosa profunda). Los puntos y las bandas de
interpretación son los REALES de las fuentes citadas; no se inventa nada. El cómputo es
determinista y puro.
"""

from typing import Any

from backend.app.clinical_scales.base import (
    InterpretationBand,
    ScaleComputeResult,
    ScaleDefinition,
    ScaleInputSpec,
)

# --------------------------------------------------------------------------- #
# CHA2DS2-VASc
# --------------------------------------------------------------------------- #
_CHADS_SOURCE = (
    "Hindricks G, et al. 2020 ESC Guidelines for the diagnosis and management of atrial "
    "fibrillation. Eur Heart J. 2021;42(5):373-498."
)

_CHADS_BANDS = {
    "low": InterpretationBand(
        label="Riesgo bajo",
        detail=(
            "Puntaje 0 (hombre). Riesgo tromboembólico bajo; en general no se recomienda "
            "anticoagulación. Nota: en mujeres el sexo aporta 1 punto y un puntaje de 1 por "
            "sexo solo se considera bajo riesgo."
        ),
        source=_CHADS_SOURCE,
    ),
    "intermediate": InterpretationBand(
        label="Riesgo intermedio",
        detail=(
            "Puntaje 1 (por factores distintos al sexo). Considerar anticoagulación "
            "valorando el balance riesgo-beneficio del paciente."
        ),
        source=_CHADS_SOURCE,
    ),
    "high": InterpretationBand(
        label="Riesgo alto",
        detail=(
            "Puntaje ≥2. Se recomienda anticoagulación oral salvo contraindicación, según "
            "las guías ESC 2020."
        ),
        source=_CHADS_SOURCE,
    ),
}


def _compute_cha2ds2_vasc(inputs: dict[str, Any]) -> ScaleComputeResult:
    age = inputs["age"]
    if age >= 75:
        age_points = 2
    elif age >= 65:
        age_points = 1
    else:
        age_points = 0

    score = (
        (1 if inputs["chf"] else 0)
        + (1 if inputs["hypertension"] else 0)
        + age_points
        + (1 if inputs["diabetes"] else 0)
        + (2 if inputs["stroke_tia_thromboembolism"] else 0)
        + (1 if inputs["vascular_disease"] else 0)
        + (1 if inputs["sex"] == "female" else 0)
    )

    if score >= 2:
        band = _CHADS_BANDS["high"]
    elif score == 1:
        band = _CHADS_BANDS["intermediate"]
    else:
        band = _CHADS_BANDS["low"]

    return ScaleComputeResult(
        score=score,
        interpretation_label=band.label,
        interpretation_detail=band.detail,
        sources=[_CHADS_SOURCE, band.source] if band.source != _CHADS_SOURCE else [_CHADS_SOURCE],
    )


CHA2DS2_VASC = ScaleDefinition(
    id="cha2ds2_vasc",
    name="CHA₂DS₂-VASc (riesgo de ACV en fibrilación auricular)",
    description=(
        "Estima el riesgo anual de ACV/tromboembolismo en pacientes con fibrilación "
        "auricular no valvular, para orientar la anticoagulación. Apoyo a la decisión: el "
        "médico confirma; no es un diagnóstico."
    ),
    inputs=(
        ScaleInputSpec("chf", "Insuficiencia cardiaca congestiva / disfunción del VI", "boolean"),
        ScaleInputSpec("hypertension", "Hipertensión arterial", "boolean"),
        ScaleInputSpec("age", "Edad (años)", "number", min=0, max=120),
        ScaleInputSpec("diabetes", "Diabetes mellitus", "boolean"),
        ScaleInputSpec(
            "stroke_tia_thromboembolism", "ACV / AIT / tromboembolismo previo", "boolean"
        ),
        ScaleInputSpec(
            "vascular_disease",
            "Enfermedad vascular (IAM previo, enfermedad arterial periférica o placa aórtica)",
            "boolean",
        ),
        ScaleInputSpec(
            "sex", "Sexo", "enum", allowed_values=("female", "male"),
            description="female=femenino, male=masculino (el sexo femenino aporta 1 punto).",
        ),
    ),
    source=_CHADS_SOURCE,
    compute=_compute_cha2ds2_vasc,
)


# --------------------------------------------------------------------------- #
# Wells para TVP (trombosis venosa profunda)
# --------------------------------------------------------------------------- #
_WELLS_SOURCE = (
    "Wells PS, et al. Value of assessment of pretest probability of deep-vein thrombosis "
    "in clinical management. Lancet. 1997;350(9094):1795-1798."
)

_WELLS_BANDS = {
    "high": InterpretationBand(
        label="Probabilidad alta",
        detail="Puntaje ≥3. Alta probabilidad pretest de TVP.",
        source=_WELLS_SOURCE,
    ),
    "moderate": InterpretationBand(
        label="Probabilidad moderada",
        detail="Puntaje 1-2. Probabilidad pretest intermedia de TVP.",
        source=_WELLS_SOURCE,
    ),
    "low": InterpretationBand(
        label="Probabilidad baja",
        detail="Puntaje ≤0. Baja probabilidad pretest de TVP.",
        source=_WELLS_SOURCE,
    ),
}

_WELLS_POSITIVE_KEYS = (
    "active_cancer",
    "paralysis_paresis_immobilization",
    "bedridden_or_major_surgery",
    "localized_tenderness",
    "entire_leg_swollen",
    "calf_swelling_gt_3cm",
    "pitting_edema",
    "collateral_superficial_veins",
    "previously_documented_dvt",
)


def _compute_wells_dvt(inputs: dict[str, Any]) -> ScaleComputeResult:
    score = sum(1 for key in _WELLS_POSITIVE_KEYS if inputs[key])
    # Diagnóstico alternativo al menos tan probable como TVP resta 2 puntos.
    if inputs["alternative_diagnosis_as_likely"]:
        score -= 2

    if score >= 3:
        band = _WELLS_BANDS["high"]
    elif score >= 1:
        band = _WELLS_BANDS["moderate"]
    else:
        band = _WELLS_BANDS["low"]

    return ScaleComputeResult(
        score=score,
        interpretation_label=band.label,
        interpretation_detail=band.detail,
        sources=[_WELLS_SOURCE],
    )


WELLS_DVT = ScaleDefinition(
    id="wells_dvt",
    name="Wells para TVP (probabilidad de trombosis venosa profunda)",
    description=(
        "Estima la probabilidad pretest de trombosis venosa profunda a partir de criterios "
        "clínicos. Apoyo a la decisión: el médico confirma; no es un diagnóstico."
    ),
    inputs=(
        ScaleInputSpec("active_cancer", "Cáncer activo (tratamiento ≤6 meses o paliativo)", "boolean"),
        ScaleInputSpec(
            "paralysis_paresis_immobilization",
            "Parálisis, paresia o inmovilización reciente de la extremidad inferior",
            "boolean",
        ),
        ScaleInputSpec(
            "bedridden_or_major_surgery",
            "Encamado >3 días o cirugía mayor en las últimas 12 semanas",
            "boolean",
        ),
        ScaleInputSpec(
            "localized_tenderness",
            "Dolor localizado en el trayecto del sistema venoso profundo",
            "boolean",
        ),
        ScaleInputSpec("entire_leg_swollen", "Edema de toda la pierna", "boolean"),
        ScaleInputSpec(
            "calf_swelling_gt_3cm",
            "Aumento del perímetro de la pantorrilla >3 cm respecto a la asintomática",
            "boolean",
        ),
        ScaleInputSpec(
            "pitting_edema", "Edema con fóvea limitado a la pierna sintomática", "boolean"
        ),
        ScaleInputSpec(
            "collateral_superficial_veins",
            "Venas superficiales colaterales (no varicosas)",
            "boolean",
        ),
        ScaleInputSpec(
            "previously_documented_dvt", "TVP previa documentada", "boolean"
        ),
        ScaleInputSpec(
            "alternative_diagnosis_as_likely",
            "Diagnóstico alternativo al menos tan probable como TVP (resta 2 puntos)",
            "boolean",
        ),
    ),
    source=_WELLS_SOURCE,
    compute=_compute_wells_dvt,
)


# Registro definido en CÓDIGO (las fórmulas son lógica clínica fija; no una tabla en BD).
SCALES: dict[str, ScaleDefinition] = {
    CHA2DS2_VASC.id: CHA2DS2_VASC,
    WELLS_DVT.id: WELLS_DVT,
}
