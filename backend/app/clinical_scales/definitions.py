"""Definiciones en código de las escalas clínicas validadas (EPIC ESCALAS, fases 1 y 3).

Escalas REALES y citables. Fase 1: CHA2DS2-VASc (riesgo de ACV en fibrilación auricular) y
Wells para TVP (probabilidad de trombosis venosa profunda). Fase 3: qSOFA (riesgo en sepsis)
y CURB-65 (gravedad de neumonía adquirida en la comunidad). Los puntos y las bandas de
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


# --------------------------------------------------------------------------- #
# qSOFA (quick SOFA, riesgo en sepsis) — fase 3
# --------------------------------------------------------------------------- #
_QSOFA_SOURCE = (
    "Singer M, et al. The Third International Consensus Definitions for Sepsis and Septic "
    "Shock (Sepsis-3). JAMA. 2016;315(8):801-810."
)

_QSOFA_BANDS = {
    "high": InterpretationBand(
        label="Riesgo alto",
        detail=(
            "Puntaje ≥2. Mayor riesgo de mortalidad y de estancia prolongada en UCI ante "
            "sospecha de infección; valorar de forma urgente y reevaluar la disfunción "
            "orgánica (Sepsis-3)."
        ),
        source=_QSOFA_SOURCE,
    ),
    "low": InterpretationBand(
        label="Riesgo bajo",
        detail=(
            "Puntaje <2. Un qSOFA bajo NO descarta sepsis; si persiste la sospecha clínica, "
            "reevaluar al paciente (Sepsis-3)."
        ),
        source=_QSOFA_SOURCE,
    ),
}


def _compute_qsofa(inputs: dict[str, Any]) -> ScaleComputeResult:
    # Cada criterio aporta 1 punto: FR ≥22 rpm, alteración del estado mental, TA sistólica ≤100.
    score = (
        (1 if inputs["respiratory_rate"] >= 22 else 0)
        + (1 if inputs["altered_mentation"] else 0)
        + (1 if inputs["systolic_bp"] <= 100 else 0)
    )

    band = _QSOFA_BANDS["high"] if score >= 2 else _QSOFA_BANDS["low"]

    return ScaleComputeResult(
        score=score,
        interpretation_label=band.label,
        interpretation_detail=band.detail,
        sources=[_QSOFA_SOURCE],
    )


QSOFA = ScaleDefinition(
    id="qsofa",
    name="qSOFA (quick SOFA, riesgo en sepsis)",
    description=(
        "Identifica de forma rápida a pacientes con sospecha de infección y mayor riesgo de "
        "mala evolución, con tres criterios a pie de cama. Apoyo a la decisión: el médico "
        "confirma; no es un diagnóstico de sepsis."
    ),
    inputs=(
        ScaleInputSpec(
            "respiratory_rate", "Frecuencia respiratoria (rpm)", "number", min=0, max=80,
            description="Aporta 1 punto si es ≥22 rpm.",
        ),
        ScaleInputSpec(
            "altered_mentation", "Alteración del estado mental (Glasgow <15)", "boolean",
            description="Aporta 1 punto si hay alteración del estado de consciencia.",
        ),
        ScaleInputSpec(
            "systolic_bp", "TA sistólica (mmHg)", "number", min=0, max=300,
            description="Aporta 1 punto si es ≤100 mmHg.",
        ),
    ),
    source=_QSOFA_SOURCE,
    compute=_compute_qsofa,
)


# --------------------------------------------------------------------------- #
# CURB-65 (gravedad de neumonía adquirida en la comunidad) — fase 3
# --------------------------------------------------------------------------- #
_CURB65_SOURCE = (
    "Lim WS, et al. Defining community acquired pneumonia severity on presentation to "
    "hospital: an international derivation and validation study. Thorax. 2003;58(5):377-382."
)

_CURB65_BANDS = {
    "low": InterpretationBand(
        label="Riesgo bajo",
        detail=(
            "Puntaje 0-1. Mortalidad a 30 días baja (~1.5%); en general posible manejo "
            "ambulatorio según criterio clínico (Lim et al., Thorax 2003)."
        ),
        source=_CURB65_SOURCE,
    ),
    "intermediate": InterpretationBand(
        label="Riesgo intermedio",
        detail=(
            "Puntaje 2. Mortalidad a 30 días intermedia (~9.2%); considerar hospitalización o "
            "manejo supervisado (Lim et al., Thorax 2003)."
        ),
        source=_CURB65_SOURCE,
    ),
    "high": InterpretationBand(
        label="Riesgo alto",
        detail=(
            "Puntaje 3-5. Mortalidad a 30 días alta (~22% con 3; hasta ~57% con 4-5); "
            "hospitalización y valorar ingreso en UCI con 4-5 (Lim et al., Thorax 2003)."
        ),
        source=_CURB65_SOURCE,
    ),
}


def _compute_curb65(inputs: dict[str, Any]) -> ScaleComputeResult:
    # Cinco criterios de 1 punto. El criterio de TA suma 1 si SBP<90 O DBP≤60.
    bp_low = inputs["systolic_bp"] < 90 or inputs["diastolic_bp"] <= 60
    score = (
        (1 if inputs["confusion"] else 0)
        + (1 if inputs["urea_mmol_l"] > 7 else 0)
        + (1 if inputs["respiratory_rate"] >= 30 else 0)
        + (1 if bp_low else 0)
        + (1 if inputs["age"] >= 65 else 0)
    )

    if score >= 3:
        band = _CURB65_BANDS["high"]
    elif score == 2:
        band = _CURB65_BANDS["intermediate"]
    else:
        band = _CURB65_BANDS["low"]

    return ScaleComputeResult(
        score=score,
        interpretation_label=band.label,
        interpretation_detail=band.detail,
        sources=[_CURB65_SOURCE],
    )


CURB_65 = ScaleDefinition(
    id="curb_65",
    name="CURB-65 (gravedad de neumonía adquirida en la comunidad)",
    description=(
        "Estima la gravedad de la neumonía adquirida en la comunidad para orientar el lugar "
        "de manejo (ambulatorio, hospital o UCI). Apoyo a la decisión: el médico confirma; no "
        "es un diagnóstico."
    ),
    inputs=(
        ScaleInputSpec(
            "confusion", "Confusión (desorientación de nueva aparición)", "boolean",
            description="Aporta 1 punto.",
        ),
        ScaleInputSpec(
            "urea_mmol_l", "Urea sérica (mmol/L)", "number", min=0, max=200,
            description="Aporta 1 punto si es >7 mmol/L (≈ BUN >19 mg/dL).",
        ),
        ScaleInputSpec(
            "respiratory_rate", "Frecuencia respiratoria (rpm)", "number", min=0, max=80,
            description="Aporta 1 punto si es ≥30 rpm.",
        ),
        ScaleInputSpec(
            "systolic_bp", "TA sistólica (mmHg)", "number", min=0, max=300,
            description="Junto con la diastólica: 1 punto si SBP<90 mmHg o DBP≤60 mmHg.",
        ),
        ScaleInputSpec(
            "diastolic_bp", "TA diastólica (mmHg)", "number", min=0, max=200,
            description="Junto con la sistólica: 1 punto si SBP<90 mmHg o DBP≤60 mmHg.",
        ),
        ScaleInputSpec(
            "age", "Edad (años)", "number", min=0, max=120,
            description="Aporta 1 punto si es ≥65 años.",
        ),
    ),
    source=_CURB65_SOURCE,
    compute=_compute_curb65,
)


# Registro definido en CÓDIGO (las fórmulas son lógica clínica fija; no una tabla en BD).
SCALES: dict[str, ScaleDefinition] = {
    CHA2DS2_VASC.id: CHA2DS2_VASC,
    WELLS_DVT.id: WELLS_DVT,
    QSOFA.id: QSOFA,
    CURB_65.id: CURB_65,
}
