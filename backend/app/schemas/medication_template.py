import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import ActiveInactiveStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del estado operativo de la plantilla, reutilizadas en formulario y filtro.
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "active", "label": "Activa"},
    {"value": "inactive", "label": "Inactiva"},
]

# Blobs ``json_schema_extra`` precomputados y tipados ``dict[str, Any]`` (evitan el
# conflicto de invarianza de pyright con ``JsonValue`` al anidar listas de opciones).
_STATUS_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _STATUS_OPTIONS}
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


class MedicationTemplateCreate(ApiWriteSchema):
    """Alta de una plantilla de medicamento frecuente de un médico.

    ``use_count``, la auditoría y el soft-delete los gobierna el servidor; no se
    aceptan (``extra="forbid"``). ``status`` es el estado operativo del catálogo
    (activa/inactiva), distinto de la baja lógica.
    """

    doctor_id: uuid.UUID = Field(
        title="Médico",
        description="Médico propietario de la plantilla (inmutable tras la creación).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    medication_name: str = Field(
        min_length=1,
        max_length=255,
        title="Medicamento",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    presentation: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Presentación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_dose: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Dosis sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_frequency: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Frecuencia sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_duration: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Duración sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones sugeridas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    status: ActiveInactiveStatus = Field(
        default=ActiveInactiveStatus.ACTIVE,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class MedicationTemplateUpdate(ApiPatchSchema):
    """Edición parcial de una plantilla (PATCH).

    ``doctor_id`` es inmutable tras la creación: el dueño de la plantilla no se
    reasigna desde aquí. ``use_count`` y los campos gobernados por el servidor no
    se declaran: enviarlos da 422 (extra forbid).
    """

    medication_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Medicamento",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    presentation: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Presentación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_dose: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Dosis sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_frequency: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Frecuencia sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_duration: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Duración sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    default_instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones sugeridas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    status: Optional[ActiveInactiveStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class MedicationTemplateRead(ApiReadSchema):
    """Representación completa de una plantilla de medicamento."""

    id: uuid.UUID
    doctor_id: uuid.UUID
    medication_name: str
    presentation: Optional[str] = None
    default_dose: Optional[str] = None
    default_frequency: Optional[str] = None
    default_duration: Optional[str] = None
    default_instructions: Optional[str] = None
    use_count: int
    status: ActiveInactiveStatus
    created_at: datetime
    updated_at: Optional[datetime] = None


class MedicationTemplateListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    # ``doctor_id`` habilita el filtro exacto por médico (el motor exige que los
    # campos de filtro existan en el schema de listado).
    doctor_id: uuid.UUID = Field(title="Médico", json_schema_extra={"ui": {"list": True}})
    medication_name: str = Field(
        title="Medicamento", json_schema_extra={"ui": {"list": True}}
    )
    presentation: Optional[str] = Field(
        default=None, title="Presentación", json_schema_extra={"ui": {"list": True}}
    )
    default_dose: Optional[str] = Field(
        default=None, title="Dosis", json_schema_extra={"ui": {"list": True}}
    )
    default_frequency: Optional[str] = Field(
        default=None, title="Frecuencia", json_schema_extra={"ui": {"list": True}}
    )
    default_duration: Optional[str] = Field(
        default=None, title="Duración", json_schema_extra={"ui": {"list": True}}
    )
    # Presente para habilitar la búsqueda libre (search_fields); no se muestra como
    # columna por defecto (sin ``ui.list``).
    default_instructions: Optional[str] = Field(default=None, title="Indicaciones")
    use_count: int = Field(
        title="Usos", json_schema_extra={"ui": {"list": True}}
    )
    status: ActiveInactiveStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    created_at: datetime = Field(
        title="Creada", json_schema_extra={"ui": {"list": True}}
    )
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
