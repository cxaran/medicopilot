import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import ImmunizationRoute, ImmunizationStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones controladas reutilizadas en formulario y filtro de lista.
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "aplicada", "label": "Aplicada"},
    {"value": "no_aplicada", "label": "No aplicada"},
    {"value": "contraindicada", "label": "Contraindicada"},
]
_ROUTE_OPTIONS: list[dict[str, Any]] = [
    {"value": "intramuscular", "label": "Intramuscular"},
    {"value": "subcutanea", "label": "Subcutánea"},
    {"value": "intradermica", "label": "Intradérmica"},
    {"value": "oral", "label": "Oral"},
    {"value": "intranasal", "label": "Intranasal"},
]

_STATUS_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _STATUS_OPTIONS}
}
_ROUTE_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _ROUTE_OPTIONS}
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


class PatientImmunizationCreate(ApiWriteSchema):
    """Alta de una inmunización del paciente.

    ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece la inmunización (no se reasigna después).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    vaccine_name: str = Field(
        min_length=1,
        max_length=255,
        title="Vacuna",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    dose_number: Optional[int] = Field(
        default=None,
        ge=1,
        le=50,
        title="Número de dosis",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    administered_on: Optional[date] = Field(
        default=None,
        title="Fecha de aplicación",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    status: ImmunizationStatus = Field(
        default=ImmunizationStatus.APLICADA,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    route: Optional[ImmunizationRoute] = Field(
        default=None,
        title="Vía",
        json_schema_extra=_ROUTE_FORM_UI,
    )
    lot_number: Optional[str] = Field(
        default=None,
        max_length=100,
        title="Lote",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    site: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Sitio de aplicación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PatientImmunizationUpdate(ApiPatchSchema):
    """Actualización parcial de una inmunización (PATCH).

    ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
    (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
    """

    vaccine_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Vacuna",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    dose_number: Optional[int] = Field(
        default=None,
        ge=1,
        le=50,
        title="Número de dosis",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    administered_on: Optional[date] = Field(
        default=None,
        title="Fecha de aplicación",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    status: Optional[ImmunizationStatus] = Field(
        default=None, title="Estado", json_schema_extra=_STATUS_FORM_UI
    )
    route: Optional[ImmunizationRoute] = Field(
        default=None, title="Vía", json_schema_extra=_ROUTE_FORM_UI
    )
    lot_number: Optional[str] = Field(
        default=None,
        max_length=100,
        title="Lote",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    site: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Sitio de aplicación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PatientImmunizationRead(ApiReadSchema):
    """Representación completa de una inmunización del paciente."""

    id: uuid.UUID
    patient_id: uuid.UUID
    vaccine_name: str
    dose_number: Optional[int] = None
    administered_on: Optional[date] = None
    status: ImmunizationStatus
    route: Optional[ImmunizationRoute] = None
    lot_number: Optional[str] = None
    site: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PatientImmunizationListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    vaccine_name: str = Field(title="Vacuna", json_schema_extra={"ui": {"list": True}})
    dose_number: Optional[int] = Field(
        default=None, title="Dosis", json_schema_extra={"ui": {"list": True}}
    )
    administered_on: Optional[date] = Field(
        default=None, title="Fecha de aplicación", json_schema_extra={"ui": {"list": True}}
    )
    status: ImmunizationStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    route: Optional[ImmunizationRoute] = Field(default=None, title="Vía")
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
