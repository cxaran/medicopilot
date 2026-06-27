import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import Field, model_validator

from backend.app.models.enums import (
    ClinicalItemStatus,
    ClinicalSeverity,
    PatientClinicalItemType,
)
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones controladas reutilizadas en formulario y filtro de lista (compatibles con
# la proyección futura del frontend).
_ITEM_TYPE_OPTIONS: list[dict[str, Any]] = [
    {"value": "allergy", "label": "Alergia"},
    {"value": "chronic_condition", "label": "Enfermedad crónica"},
    {"value": "current_medication", "label": "Medicamento actual"},
    {"value": "relevant_habit", "label": "Hábito relevante"},
    {"value": "clinical_alert", "label": "Alerta clínica"},
    {"value": "other", "label": "Otro"},
]
_SEVERITY_OPTIONS: list[dict[str, Any]] = [
    {"value": "low", "label": "Baja"},
    {"value": "moderate", "label": "Moderada"},
    {"value": "high", "label": "Alta"},
    {"value": "critical", "label": "Crítica"},
]
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "active", "label": "Activo"},
    {"value": "inactive", "label": "Inactivo"},
    {"value": "resolved", "label": "Resuelto"},
    {"value": "suspended", "label": "Suspendido"},
]

# Blobs ``json_schema_extra`` precomputados y tipados ``dict[str, Any]``: pasar un
# dict tipado evita el conflicto de invarianza de pyright con ``JsonValue`` cuando
# el literal anida listas de opciones.
_ITEM_TYPE_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _ITEM_TYPE_OPTIONS}
}
_SEVERITY_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _SEVERITY_OPTIONS}
}
_STATUS_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _STATUS_OPTIONS}
}
_ITEM_TYPE_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Tipo",
            "widget": "select",
            "options": _ITEM_TYPE_OPTIONS,
        },
    }
}
_SEVERITY_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Severidad",
            "widget": "select",
            "options": _SEVERITY_OPTIONS,
        },
    }
}
_STATUS_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Estado",
            "widget": "select",
            "options": _STATUS_OPTIONS,
        },
    }
}


def _validate_date_range(
    started_on: Optional[date], ended_on: Optional[date]
) -> None:
    """El fin no puede ser anterior al inicio cuando ambos están presentes."""
    if started_on is not None and ended_on is not None and ended_on < started_on:
        raise ValueError("La fecha de fin no puede ser anterior a la de inicio")


class PatientClinicalItemCreate(ApiWriteSchema):
    """Alta de un dato clínico importante del resumen del paciente.

    ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece el dato clínico (no se reasigna después).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    item_type: PatientClinicalItemType = Field(
        title="Tipo",
        json_schema_extra=_ITEM_TYPE_FORM_UI,
    )
    title: str = Field(
        min_length=1,
        max_length=255,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    details: Optional[str] = Field(
        default=None,
        title="Detalle",
        description="Reacción, dosis, frecuencia, descripción o contexto.",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    severity: Optional[ClinicalSeverity] = Field(
        default=None,
        title="Severidad",
        json_schema_extra=_SEVERITY_FORM_UI,
    )
    status: ClinicalItemStatus = Field(
        default=ClinicalItemStatus.ACTIVE,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    started_on: Optional[date] = Field(
        default=None,
        title="Inicio",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    ended_on: Optional[date] = Field(
        default=None,
        title="Fin",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )

    @model_validator(mode="after")
    def validate_date_range(self) -> "PatientClinicalItemCreate":
        _validate_date_range(self.started_on, self.ended_on)
        return self


class PatientClinicalItemUpdate(ApiPatchSchema):
    """Actualización parcial de un dato clínico (PATCH).

    ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
    (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
    """

    item_type: Optional[PatientClinicalItemType] = Field(
        default=None,
        title="Tipo",
        json_schema_extra=_ITEM_TYPE_FORM_UI,
    )
    title: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    details: Optional[str] = Field(
        default=None,
        title="Detalle",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    severity: Optional[ClinicalSeverity] = Field(
        default=None,
        title="Severidad",
        json_schema_extra=_SEVERITY_FORM_UI,
    )
    status: Optional[ClinicalItemStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    started_on: Optional[date] = Field(
        default=None,
        title="Inicio",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    ended_on: Optional[date] = Field(
        default=None,
        title="Fin",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )

    @model_validator(mode="after")
    def validate_date_range(self) -> "PatientClinicalItemUpdate":
        # Solo valida el rango cuando ambos extremos llegan en el mismo PATCH.
        _validate_date_range(self.started_on, self.ended_on)
        return self


class PatientClinicalItemRead(ApiReadSchema):
    """Representación completa de un dato clínico importante."""

    id: uuid.UUID
    patient_id: uuid.UUID
    item_type: PatientClinicalItemType
    title: str
    details: Optional[str] = None
    severity: Optional[ClinicalSeverity] = None
    status: ClinicalItemStatus
    started_on: Optional[date] = None
    ended_on: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PatientClinicalItemListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    # ``patient_id`` habilita el filtro exacto declarado por el recurso (el motor
    # exige que los campos de filtro existan en el schema de listado).
    patient_id: uuid.UUID = Field(title="Paciente")
    item_type: PatientClinicalItemType = Field(
        title="Tipo", json_schema_extra=_ITEM_TYPE_LIST_FILTER_UI
    )
    title: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    # ``details`` se incluye para habilitar la búsqueda libre declarada por el recurso;
    # no se muestra en la tabla.
    details: Optional[str] = Field(default=None, title="Detalle")
    severity: Optional[ClinicalSeverity] = Field(
        default=None, title="Severidad", json_schema_extra=_SEVERITY_LIST_FILTER_UI
    )
    status: ClinicalItemStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    started_on: Optional[date] = Field(
        default=None, title="Inicio", json_schema_extra={"ui": {"list": True}}
    )
    ended_on: Optional[date] = Field(
        default=None, title="Fin", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
