import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import FamilyRelationship, PatientHistoryItemCategory
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones controladas reutilizadas en formulario y filtro de lista.
_CATEGORY_OPTIONS: list[dict[str, Any]] = [
    {"value": "familiar", "label": "Familiar"},
    {"value": "quirurgico", "label": "Quirúrgico"},
    {"value": "obstetrico", "label": "Obstétrico"},
    {"value": "patologico", "label": "Patológico (personal)"},
    {"value": "no_patologico", "label": "No patológico (personal)"},
]
_RELATIONSHIP_OPTIONS: list[dict[str, Any]] = [
    {"value": "padre", "label": "Padre"},
    {"value": "madre", "label": "Madre"},
    {"value": "hermano", "label": "Hermano"},
    {"value": "hermana", "label": "Hermana"},
    {"value": "abuelo", "label": "Abuelo"},
    {"value": "abuela", "label": "Abuela"},
    {"value": "hijo", "label": "Hijo"},
    {"value": "hija", "label": "Hija"},
    {"value": "otro", "label": "Otro"},
]

_CATEGORY_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _CATEGORY_OPTIONS}
}
_RELATIONSHIP_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _RELATIONSHIP_OPTIONS}
}
_CATEGORY_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Categoría",
            "widget": "select",
            "options": _CATEGORY_OPTIONS,
        },
    }
}


class PatientHistoryItemCreate(ApiWriteSchema):
    """Alta de un antecedente clínico estructurado del paciente.

    ``patient_id`` se fija en la creación y es inmutable después (no se edita por PATCH).
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece el antecedente (no se reasigna después).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    category: PatientHistoryItemCategory = Field(
        title="Categoría",
        json_schema_extra=_CATEGORY_FORM_UI,
    )
    description: str = Field(
        min_length=1,
        max_length=255,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    relationship_to_patient: Optional[FamilyRelationship] = Field(
        default=None,
        title="Parentesco",
        description="Para antecedentes familiares (opcional).",
        json_schema_extra=_RELATIONSHIP_FORM_UI,
    )
    related_condition: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Condición relacionada",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    related_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (CIE-10)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    onset_age: Optional[int] = Field(
        default=None,
        ge=0,
        le=120,
        title="Edad de inicio",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    occurred_on: Optional[date] = Field(
        default=None,
        title="Fecha del evento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PatientHistoryItemUpdate(ApiPatchSchema):
    """Actualización parcial de un antecedente (PATCH).

    ``patient_id`` es inmutable: no se declara aquí, por lo que enviarlo da 422
    (``extra="forbid"``). La auditoría tampoco es editable desde el cliente.
    """

    category: Optional[PatientHistoryItemCategory] = Field(
        default=None, title="Categoría", json_schema_extra=_CATEGORY_FORM_UI
    )
    description: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    relationship_to_patient: Optional[FamilyRelationship] = Field(
        default=None, title="Parentesco", json_schema_extra=_RELATIONSHIP_FORM_UI
    )
    related_condition: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Condición relacionada",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    related_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (CIE-10)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    onset_age: Optional[int] = Field(
        default=None,
        ge=0,
        le=120,
        title="Edad de inicio",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    occurred_on: Optional[date] = Field(
        default=None,
        title="Fecha del evento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PatientHistoryItemRead(ApiReadSchema):
    """Representación completa de un antecedente clínico estructurado."""

    id: uuid.UUID
    patient_id: uuid.UUID
    category: PatientHistoryItemCategory
    description: str
    relationship_to_patient: Optional[FamilyRelationship] = None
    related_condition: Optional[str] = None
    related_code: Optional[str] = None
    onset_age: Optional[int] = None
    occurred_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PatientHistoryItemListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    category: PatientHistoryItemCategory = Field(
        title="Categoría", json_schema_extra=_CATEGORY_LIST_FILTER_UI
    )
    description: str = Field(title="Descripción", json_schema_extra={"ui": {"list": True}})
    relationship_to_patient: Optional[FamilyRelationship] = Field(
        default=None, title="Parentesco", json_schema_extra={"ui": {"list": True}}
    )
    related_condition: Optional[str] = Field(default=None, title="Condición relacionada")
    occurred_on: Optional[date] = Field(
        default=None, title="Fecha del evento", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
