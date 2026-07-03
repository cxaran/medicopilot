import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import PrescriptionStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del ciclo de vida de la receta, reutilizadas en el filtro de lista.
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "draft", "label": "Borrador"},
    {"value": "approved", "label": "Aprobada"},
    {"value": "voided", "label": "Anulada"},
]

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


# --- Recetas ---


class PrescriptionCreate(ApiWriteSchema):
    """Alta de un borrador de receta ligado a una consulta.

    El folio interno, el estado, el snapshot del médico, la auditoría y el borrado
    los gobierna el servidor; no se aceptan.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta",
        description="Consulta origen de la receta (inmutable).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    related_diagnosis_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Diagnóstico relacionado",
        description="Diagnóstico de la misma consulta, opcional.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PrescriptionUpdate(ApiPatchSchema):
    """Edición parcial de un borrador (PATCH), sólo si receta y consulta son draft.

    Permite quitar el diagnóstico relacionado enviando ``null``. El folio, el estado,
    el snapshot, los datos de aprobación/anulación, la auditoría y el borrado no se
    declaran aquí: enviarlos da 422 (extra forbid).
    """

    related_diagnosis_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Diagnóstico relacionado",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PrescriptionApprove(ApiWriteSchema):
    """Cuerpo de la aprobación: vacío por diseño.

    El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
    snapshot, fecha ni estado. ``extra="forbid"`` rechaza cualquiera.
    """


class PrescriptionVoid(ApiWriteSchema):
    """Cuerpo de la anulación: exige un motivo no vacío."""

    void_reason: str = Field(
        min_length=1,
        title="Motivo de anulación",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PrescriptionRead(ApiReadSchema):
    """Representación completa de una receta (incluye el snapshot del médico)."""

    id: uuid.UUID
    consultation_id: uuid.UUID
    # Derivado de la consulta (subconsulta en el modelo); no se acepta como entrada.
    patient_id: uuid.UUID
    internal_folio: int
    related_diagnosis_id: Optional[uuid.UUID] = None
    observations: Optional[str] = None
    status: PrescriptionStatus
    doctor_snapshot: Optional[dict[str, Any]] = None
    approved_by_doctor_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    voided_by_doctor_id: Optional[uuid.UUID] = None
    voided_at: Optional[datetime] = None
    void_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PrescriptionListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin snapshot ni notas)."""

    id: uuid.UUID
    consultation_id: uuid.UUID = Field(title="Consulta")
    # Paciente derivado de la consulta (subconsulta en el modelo): habilita el filtro
    # exacto por paciente a través de todas sus consultas.
    patient_id: uuid.UUID = Field(title="Paciente")
    internal_folio: int = Field(title="Folio", json_schema_extra={"ui": {"list": True}})
    related_diagnosis_id: Optional[uuid.UUID] = Field(
        default=None, title="Diagnóstico"
    )
    status: PrescriptionStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    approved_at: Optional[datetime] = Field(
        default=None, title="Aprobada", json_schema_extra={"ui": {"list": True}}
    )
    voided_at: Optional[datetime] = Field(
        default=None, title="Anulada", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")


# --- Renglones de receta ---


class PrescriptionItemCreate(ApiWriteSchema):
    """Alta de un medicamento en una receta borrador.

    La posición la asigna el servidor; no se acepta. La consulta, el paciente y el
    médico se derivan de la receta.
    """

    prescription_id: uuid.UUID = Field(
        title="Receta",
        description="Receta a la que pertenece el medicamento (inmutable).",
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
    dose: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Dosis",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    frequency: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Frecuencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    duration: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Duración",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PrescriptionItemUpdate(ApiPatchSchema):
    """Edición parcial de un renglón (PATCH), sólo si receta y consulta son draft.

    ``prescription_id``, la posición, la auditoría y el borrado no se declaran aquí:
    enviarlos da 422 (extra forbid).
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
    dose: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Dosis",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    frequency: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Frecuencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    duration: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Duración",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class PrescriptionItemRead(ApiReadSchema):
    """Representación completa de un renglón de receta (incluye ``position``)."""

    id: uuid.UUID
    prescription_id: uuid.UUID
    position: int
    medication_name: str
    presentation: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    instructions: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PrescriptionItemListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin ``instructions``)."""

    id: uuid.UUID
    prescription_id: uuid.UUID = Field(title="Receta")
    position: int = Field(title="Orden", json_schema_extra={"ui": {"list": True}})
    medication_name: str = Field(
        title="Medicamento", json_schema_extra={"ui": {"list": True}}
    )
    presentation: Optional[str] = Field(
        default=None, title="Presentación", json_schema_extra={"ui": {"list": True}}
    )
    dose: Optional[str] = Field(
        default=None, title="Dosis", json_schema_extra={"ui": {"list": True}}
    )
    frequency: Optional[str] = Field(
        default=None, title="Frecuencia", json_schema_extra={"ui": {"list": True}}
    )
    duration: Optional[str] = Field(
        default=None, title="Duración", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
