"""Conciliación de medicación (gap case 26): capacidad de SÓLO LECTURA.

Consolida la lista de medicación ACTIVA del paciente desde DOS fuentes (lo PRESCRITO en recetas
activas y lo REPORTADO por el paciente como 'medicamento actual') y MARCA discrepancias para que
el médico las revise. NUNCA escribe, NUNCA muta, NUNCA auto-concilia y NUNCA inventa: cada
bandera cita los registros de origen. El médico decide; esto sólo ofrece la vista consolidada +
las discrepancias.

La de-duplicación/comparación se hace por INGREDIENTE o CLASE usando el MISMO resolutor de
farmacología configurable del cluster quality_checks. Si el resolutor no está disponible, se cae a
una normalización CONSERVADORA por nombre y se marca el emparejamiento por ingrediente/clase como
'no disponible' (jamás se fabrica una coincidencia). Sin persistencia (puro read+compute): no hay
modelo de BD ni migración.
"""

from backend.app.medication_reconciliation.reconcile import (
    FLAG_DUPLICATE,
    FLAG_PRESCRIBED_NOT_REPORTED,
    FLAG_REPORTED_NOT_PRESCRIBED,
    ConsolidatedMedication,
    MedicationSource,
    ReconciliationFlag,
    ResolvedMedication,
    reconcile_medications,
)

__all__ = [
    "FLAG_DUPLICATE",
    "FLAG_PRESCRIBED_NOT_REPORTED",
    "FLAG_REPORTED_NOT_PRESCRIBED",
    "ConsolidatedMedication",
    "MedicationSource",
    "ReconciliationFlag",
    "ResolvedMedication",
    "reconcile_medications",
]
