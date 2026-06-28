"""Schemas del catálogo de códigos clínicos de apoyo (G5 fase 4).

Catálogo pragmático CIE-10/LOINC/ATC para asistir la codificación. La búsqueda de un
término desconocido devuelve vacío; nunca se inventa un código.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import ClinicalCodeSystem
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del sistema de codificación, reutilizadas en el filtro de lista (select).
_SYSTEM_OPTIONS: list[dict[str, Any]] = [
    {"value": "cie10", "label": "CIE-10 (diagnósticos)"},
    {"value": "loinc", "label": "LOINC (laboratorio)"},
    {"value": "atc", "label": "ATC (medicamentos)"},
]

_SYSTEM_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _SYSTEM_OPTIONS}
}
_SYSTEM_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Sistema",
            "widget": "select",
            "options": _SYSTEM_OPTIONS,
        },
    }
}


class ClinicalCodeCreate(ApiWriteSchema):
    """Alta de un código clínico en el catálogo de apoyo."""

    system: ClinicalCodeSystem = Field(title="Sistema", json_schema_extra=_SYSTEM_FORM_UI)
    code: str = Field(
        min_length=1,
        max_length=64,
        title="Código",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    display_term: str = Field(
        min_length=1,
        max_length=512,
        title="Término",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    parent_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código padre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )


class ClinicalCodeUpdate(ApiPatchSchema):
    """Actualización parcial de un código clínico (PATCH)."""

    display_term: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=512,
        title="Término",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    parent_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código padre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )


class ClinicalCodeRead(ApiReadSchema):
    """Representación pública de un código clínico."""

    id: uuid.UUID
    system: ClinicalCodeSystem
    code: str
    display_term: str
    parent_code: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClinicalCodeListItem(ApiReadSchema):
    """Versión para listados (declara los campos filtrables/buscables)."""

    id: uuid.UUID
    system: ClinicalCodeSystem = Field(
        title="Sistema", json_schema_extra=_SYSTEM_LIST_FILTER_UI
    )
    code: str = Field(title="Código", json_schema_extra={"ui": {"list": True}})
    display_term: str = Field(
        title="Término", json_schema_extra={"ui": {"list": True}}
    )
    parent_code: Optional[str] = Field(
        default=None, title="Código padre", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
