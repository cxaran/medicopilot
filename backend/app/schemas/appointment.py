import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, field_validator

from backend.app.models.enums import AppointmentStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del ciclo de vida de la cita, reutilizadas en el filtro de lista.
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "pending", "label": "Pendiente"},
    {"value": "confirmed", "label": "Confirmada"},
    {"value": "attended", "label": "Atendida"},
    {"value": "cancelled", "label": "Cancelada"},
    {"value": "rescheduled", "label": "Reprogramada"},
    {"value": "no_show", "label": "No asistió"},
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
_SCHEDULED_AT_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {"operator": "range", "label": "Programada", "widget": "datetime"},
    }
}

_DURATION = Field(
    ge=5,
    le=480,
    title="Duración (min)",
    json_schema_extra={"ui": {"form": True, "widget": "number"}},
)
_DURATION_OPT = Field(
    default=None,
    ge=5,
    le=480,
    title="Duración (min)",
    json_schema_extra={"ui": {"form": True, "widget": "number"}},
)


def _naive_utc(value: datetime) -> datetime:
    """Normaliza a UTC sin tzinfo, coherente con las columnas ``DateTime`` del dominio."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class AppointmentCreate(ApiWriteSchema):
    """Alta de una cita; siempre nace en ``pending``.

    El estado, ``rescheduled_from_id``, la auditoría y el soft-delete los gobierna el
    servidor; no se aceptan.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente de la cita (inmutable).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    doctor_id: uuid.UUID = Field(
        title="Médico",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    scheduled_at: datetime = Field(
        title="Fecha y hora",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    duration_minutes: int = _DURATION
    reason: str = Field(
        min_length=1,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    internal_notes: Optional[str] = Field(
        default=None,
        title="Notas internas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("scheduled_at")
    @classmethod
    def normalize_scheduled_at(cls, value: datetime) -> datetime:
        return _naive_utc(value)


class AppointmentUpdate(ApiPatchSchema):
    """Edición parcial (PATCH), permitida sólo sobre citas ``pending`` o ``confirmed``.

    ``patient_id``, ``status``, ``rescheduled_from_id``, la auditoría y el borrado no
    se declaran aquí: enviarlos da 422 (extra forbid).
    """

    doctor_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Médico",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    scheduled_at: Optional[datetime] = Field(
        default=None,
        title="Fecha y hora",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    duration_minutes: Optional[int] = _DURATION_OPT
    reason: Optional[str] = Field(
        default=None,
        min_length=1,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    internal_notes: Optional[str] = Field(
        default=None,
        title="Notas internas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("scheduled_at")
    @classmethod
    def normalize_scheduled_at(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _naive_utc(value) if value is not None else None


class AppointmentConfirm(ApiWriteSchema):
    """Cuerpo de la confirmación: vacío por diseño."""


class AppointmentNoShow(ApiWriteSchema):
    """Cuerpo del marcado de inasistencia: vacío por diseño."""


class AppointmentCancel(ApiWriteSchema):
    """Cuerpo de la cancelación: motivo opcional, no vacío si se envía."""

    reason: Optional[str] = Field(
        default=None,
        min_length=1,
        title="Motivo de cancelación",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class AppointmentReschedule(ApiWriteSchema):
    """Cuerpo de la reprogramación.

    El paciente se conserva (no se acepta ``patient_id``). ``doctor_id``,
    ``scheduled_at``, ``duration_minutes``, ``reason`` e ``internal_notes`` se heredan
    de la cita original cuando no se envían (semántica de PATCH).
    """

    doctor_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Médico",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    scheduled_at: Optional[datetime] = Field(
        default=None,
        title="Fecha y hora",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    duration_minutes: Optional[int] = _DURATION_OPT
    reason: Optional[str] = Field(
        default=None,
        min_length=1,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    internal_notes: Optional[str] = Field(
        default=None,
        title="Notas internas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("scheduled_at")
    @classmethod
    def normalize_scheduled_at(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _naive_utc(value) if value is not None else None


class AppointmentRead(ApiReadSchema):
    """Representación completa de una cita médica."""

    id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    scheduled_at: datetime
    duration_minutes: int
    reason: str
    internal_notes: Optional[str] = None
    status: AppointmentStatus
    rescheduled_from_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class AppointmentListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin notas internas)."""

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    doctor_id: uuid.UUID = Field(title="Médico")
    scheduled_at: datetime = Field(
        title="Programada", json_schema_extra=_SCHEDULED_AT_LIST_FILTER_UI
    )
    duration_minutes: int = Field(
        title="Duración (min)", json_schema_extra={"ui": {"list": True}}
    )
    reason: str = Field(title="Motivo", json_schema_extra={"ui": {"list": True}})
    status: AppointmentStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    rescheduled_from_id: Optional[uuid.UUID] = Field(default=None, title="Reprogramada de")
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
