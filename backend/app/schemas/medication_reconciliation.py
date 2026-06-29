"""Schemas de la conciliación de medicación (sólo lectura).

Devuelve la lista consolidada de medicación activa del paciente y las discrepancias para
revisión del médico. No persiste nada ni muta el expediente.
"""

import uuid
from typing import Literal, Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema


class ConsolidatedMedicationRead(ApiReadSchema):
    """Una entrada de la lista única de medicación activa."""

    key: str = Field(description="Clave de agrupación (ingrediente/clase o nombre normalizado).")
    display_name: str = Field(description="Nombre legible del medicamento.")
    ingredient_or_class: Optional[str] = Field(
        default=None, description="Ingrediente o clase resuelto, si la fuente de farmacología lo dio."
    )
    resolver_status: Literal["resolved", "name_only", "no_disponible"] = Field(
        description="Cómo se agrupó: por ingrediente/clase, por nombre, o sin fuente (no disponible)."
    )
    prescribed_refs: list[str] = Field(
        default_factory=list, description="Registros prescritos que aportan a esta entrada."
    )
    reported_refs: list[str] = Field(
        default_factory=list, description="Registros reportados por el paciente para esta entrada."
    )


class ReconciliationFlagRead(ApiReadSchema):
    """Una discrepancia para revisión (no es una corrección)."""

    kind: Literal[
        "prescribed_not_reported", "reported_not_prescribed", "duplicate_medication"
    ] = Field(description="Tipo de discrepancia.")
    message: str = Field(
        validation_alias="message_es",
        serialization_alias="message",
        description="Descripción en español de la discrepancia.",
    )
    source_refs: list[str] = Field(
        default_factory=list, description="Registros (modelo:id) que sustentan la discrepancia."
    )
    ingredient_or_class: Optional[str] = Field(default=None)
    resolver_status: Literal["resolved", "name_only", "no_disponible"]


class MedicationReconciliationResponse(ApiReadSchema):
    """Resultado de la conciliación: lista consolidada + discrepancias."""

    patient_id: uuid.UUID
    consolidated: list[ConsolidatedMedicationRead]
    flags: list[ReconciliationFlagRead]
    flag_count: int = Field(description="Número de discrepancias.")
    resolver_available: bool = Field(
        description="Si la fuente de farmacología respondió (false -> emparejamiento por nombre)."
    )
