"""Catálogo INICIAL de códigos clínicos de apoyo (G5 fase 4).

Conjunto de PARTIDA, deliberadamente PEQUEÑO y de COBERTURA LIMITADA pero EXTENSIBLE:
sólo incluye códigos REALES y reconocidos de cada sistema (CIE-10 de la OMS, LOINC y
ATC de la OMS). No es un servidor de terminología completo. Los analitos LOINC se
eligieron para que COINCIDAN con los que la aplicación ya usa (HbA1c, Glucosa).

Regla de honestidad: aquí no se inventan códigos. La búsqueda de un término que no esté
sembrado devuelve vacío; nunca un código fabricado. Para ampliar la cobertura se agregan
más entradas REALES a ``DEFAULT_CLINICAL_CODES`` o se usa el CRUD de ``clinical_codes``.

El sembrado es idempotente (inserta sólo las parejas (sistema, código) faltantes) y se
ejecuta al inicializar la plataforma (bootstrap).
"""

from typing import Any

from sqlmodel import Session, select

from backend.app.models.clinical_code import ClinicalCode
from backend.app.models.enums import ClinicalCodeSystem

# Conjunto INICIAL (cobertura limitada). Cada entrada es un código REAL; el sistema se
# cita en el comentario de cada bloque. ``parent_code`` enlaza la jerarquía cuando aplica.
DEFAULT_CLINICAL_CODES: tuple[dict[str, Any], ...] = (
    # --- CIE-10 (OMS): diagnósticos comunes en consulta de primer contacto ---
    {"system": ClinicalCodeSystem.CIE10, "code": "E11", "display_term": "Diabetes mellitus tipo 2", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "E11.9", "display_term": "Diabetes mellitus tipo 2 sin complicaciones", "parent_code": "E11"},
    {"system": ClinicalCodeSystem.CIE10, "code": "I10", "display_term": "Hipertensión esencial (primaria)", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "E78.5", "display_term": "Hiperlipidemia no especificada", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "E66.9", "display_term": "Obesidad no especificada", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "J00", "display_term": "Rinofaringitis aguda (resfriado común)", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "J45.9", "display_term": "Asma no especificada", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "K21.9", "display_term": "Enfermedad por reflujo gastroesofágico sin esofagitis", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "N39.0", "display_term": "Infección de vías urinarias, sitio no especificado", "parent_code": None},
    {"system": ClinicalCodeSystem.CIE10, "code": "M54.5", "display_term": "Lumbago no especificado", "parent_code": None},
    # --- LOINC: analitos de laboratorio (los términos contienen el nombre que usa la app) ---
    {"system": ClinicalCodeSystem.LOINC, "code": "4548-4", "display_term": "Hemoglobina glucosilada (HbA1c) en sangre", "parent_code": None},
    {"system": ClinicalCodeSystem.LOINC, "code": "1558-6", "display_term": "Glucosa en ayunas en suero o plasma", "parent_code": None},
    {"system": ClinicalCodeSystem.LOINC, "code": "2345-7", "display_term": "Glucosa en suero o plasma", "parent_code": None},
    {"system": ClinicalCodeSystem.LOINC, "code": "2160-0", "display_term": "Creatinina en suero o plasma", "parent_code": None},
    {"system": ClinicalCodeSystem.LOINC, "code": "2093-3", "display_term": "Colesterol total en suero o plasma", "parent_code": None},
    # --- ATC (OMS): medicamentos frecuentes ---
    {"system": ClinicalCodeSystem.ATC, "code": "A10BA02", "display_term": "Metformina", "parent_code": None},
    {"system": ClinicalCodeSystem.ATC, "code": "C09CA01", "display_term": "Losartán", "parent_code": None},
    {"system": ClinicalCodeSystem.ATC, "code": "N02BE01", "display_term": "Paracetamol (acetaminofén)", "parent_code": None},
    {"system": ClinicalCodeSystem.ATC, "code": "M01AE01", "display_term": "Ibuprofeno", "parent_code": None},
    {"system": ClinicalCodeSystem.ATC, "code": "J01CA04", "display_term": "Amoxicilina", "parent_code": None},
    {"system": ClinicalCodeSystem.ATC, "code": "A02BC01", "display_term": "Omeprazol", "parent_code": None},
)


def seed_clinical_codes(session: Session) -> int:
    """Inserta los códigos por defecto faltantes. Idempotente; devuelve cuántos creó.

    Una pareja (sistema, código) ya presente (incluso si está dada de baja lógica) no se
    vuelve a insertar, respetando la unicidad parcial del modelo.
    """
    created = 0
    for entry in DEFAULT_CLINICAL_CODES:
        exists = session.exec(
            select(ClinicalCode.id).where(
                ClinicalCode.system == entry["system"],
                ClinicalCode.code == entry["code"],
            )
        ).first()
        if exists is not None:
            continue
        session.add(
            ClinicalCode(
                system=entry["system"],
                code=entry["code"],
                display_term=entry["display_term"],
                parent_code=entry["parent_code"],
            )
        )
        created += 1
    return created
