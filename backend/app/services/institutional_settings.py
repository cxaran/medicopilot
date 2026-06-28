"""Configuración institucional: defaults sembrables y resolución de umbrales (G5 fase 3).

Provee un conjunto INICIAL de reglas clínicas configurables (extensible) y los helpers
para que la lógica clínica lea esos valores en vez de constantes fijas. El sembrado es
idempotente (inserta sólo las claves faltantes) y se ejecuta al inicializar la
plataforma (bootstrap); también puede invocarse desde un proceso de mantenimiento.
"""

from typing import Any, Optional

from sqlmodel import Session, select

from backend.app.models.enums import SettingCategory
from backend.app.models.institutional_setting import InstitutionalSetting
from backend.app.schemas.cohort import Comparator, VitalMetric

# Conjunto INICIAL de configuración institucional. Es un punto de partida razonado y
# EXTENSIBLE (cobertura limitada): cada valor por defecto cita una referencia sensata en
# su descripción. La forma de ``value`` depende de la categoría.
DEFAULT_SETTINGS: tuple[dict[str, Any], ...] = (
    {
        "key": "vital_redflag.systolic_bp",
        "category": SettingCategory.VITAL_THRESHOLD,
        "value": {"comparator": Comparator.GTE.value, "value": 140},
        "description": (
            "Umbral de bandera roja de presión arterial sistólica (mmHg). Default: "
            "≥140 mmHg, criterio habitual de hipertensión (referencia tipo ACC/AHA). "
            "Ajustable por la institución."
        ),
    },
    {
        "key": "vital_redflag.heart_rate_bpm",
        "category": SettingCategory.VITAL_THRESHOLD,
        "value": {"comparator": Comparator.GTE.value, "value": 100},
        "description": (
            "Umbral de bandera roja de frecuencia cardiaca (lpm). Default: ≥100 lpm "
            "(taquicardia en reposo del adulto). Ajustable por la institución."
        ),
    },
    {
        "key": "lab_target.hba1c",
        "category": SettingCategory.LAB_TARGET,
        "value": {"target_max": 7.0, "unit": "%"},
        "description": (
            "Meta de control de HbA1c (%). Default: <7.0% en el adulto con diabetes "
            "(referencia tipo ADA). Ajustable por la institución."
        ),
    },
    {
        "key": "followup.default_interval_days",
        "category": SettingCategory.FOLLOW_UP,
        "value": {"days": 30},
        "description": (
            "Intervalo de seguimiento por defecto (días). Default: 30 días. Ajustable "
            "por la institución según el tipo de padecimiento."
        ),
    },
)


def seed_institutional_settings(session: Session) -> int:
    """Inserta los defaults faltantes (idempotente). Devuelve cuántos se crearon."""
    created = 0
    for default in DEFAULT_SETTINGS:
        existing = session.exec(
            select(InstitutionalSetting).where(
                InstitutionalSetting.key == default["key"],
                InstitutionalSetting.deleted_at.is_(None),
            )
        ).first()
        if existing is not None:
            continue
        session.add(
            InstitutionalSetting(
                key=default["key"],
                category=default["category"],
                value=default["value"],
                description=default["description"],
            )
        )
        created += 1
    return created


def get_setting(session: Session, key: str) -> Optional[InstitutionalSetting]:
    """Configuración vigente por clave (excluye eliminadas), o ``None``."""
    return session.exec(
        select(InstitutionalSetting).where(
            InstitutionalSetting.key == key,
            InstitutionalSetting.deleted_at.is_(None),
        )
    ).first()


def resolve_vital_threshold(
    session: Session, vital: VitalMetric
) -> Optional[tuple[Comparator, float]]:
    """Umbral de bandera roja configurado para un signo vital, o ``None`` si no hay.

    Lee la clave ``vital_redflag.<vital>``; devuelve (comparador, valor). Si la clave no
    existe o su valor está mal formado, devuelve ``None`` (el caller decide el fallback).
    """
    setting = get_setting(session, f"vital_redflag.{vital.value}")
    if setting is None:
        return None
    data = setting.value
    try:
        comparator = Comparator(str(data["comparator"]))
        value = float(data["value"])
    except (KeyError, ValueError, TypeError):
        return None
    return comparator, value
