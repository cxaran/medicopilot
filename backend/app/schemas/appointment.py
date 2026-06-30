import uuid
from datetime import date, datetime, time
from typing import Any, Optional

from pydantic import Field

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
# ``scheduled_date`` (date) es columna de lista; su filtro de RANGO de fecha civil
# (gte/lte) lo publica ``filterable_fields`` desde ``filter_fields`` del recurso
# (operadores por defecto de las columnas date, sin zona horaria: la fecha YA es civil).
_SCHEDULED_DATE_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}

# La cita se agenda por FECHA (obligatoria); la HORA es opcional: muchas veces el médico
# cita "tal día" y el paciente acude dentro del horario de consulta, sin hora concreta.
_DATE_FIELD = Field(
    title="Fecha",
    json_schema_extra={"ui": {"form": True, "widget": "date"}},
)
_DATE_FIELD_OPT = Field(
    default=None,
    title="Fecha",
    json_schema_extra={"ui": {"form": True, "widget": "date"}},
)
_TIME_FIELD_OPT = Field(
    default=None,
    title="Hora (opcional)",
    description="Hora concreta de la cita; omítela si el paciente acude dentro del horario de consulta.",
    json_schema_extra={"ui": {"form": True, "widget": "time"}},
)
# La duración sólo tiene sentido cuando hay hora concreta; opcional en todos los cuerpos.
_DURATION_OPT = Field(
    default=None,
    ge=5,
    le=480,
    title="Duración (min)",
    json_schema_extra={"ui": {"form": True, "widget": "number"}},
)


class AppointmentCreate(ApiWriteSchema):
    """Alta de una cita; siempre nace en ``pending``.

    Sólo ``scheduled_date`` es obligatoria entre los campos de agenda: la cita se
    programa por fecha y la hora puede omitirse. El estado, ``rescheduled_from_id``, la
    auditoría y el soft-delete los gobierna el servidor; no se aceptan.
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
    scheduled_date: date = _DATE_FIELD
    scheduled_time: Optional[time] = _TIME_FIELD_OPT
    duration_minutes: Optional[int] = _DURATION_OPT
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
    scheduled_date: Optional[date] = _DATE_FIELD_OPT
    scheduled_time: Optional[time] = _TIME_FIELD_OPT
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
    ``scheduled_date``, ``scheduled_time``, ``duration_minutes``, ``reason`` e
    ``internal_notes`` se heredan de la cita original cuando no se envían (semántica de
    PATCH).
    """

    doctor_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Médico",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    scheduled_date: Optional[date] = _DATE_FIELD_OPT
    scheduled_time: Optional[time] = _TIME_FIELD_OPT
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


class AppointmentRead(ApiReadSchema):
    """Representación completa de una cita médica."""

    id: uuid.UUID
    patient_id: uuid.UUID
    doctor_id: uuid.UUID
    scheduled_date: date
    scheduled_time: Optional[time] = None
    duration_minutes: Optional[int] = None
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
    scheduled_date: date = Field(
        title="Fecha", json_schema_extra=_SCHEDULED_DATE_LIST_FILTER_UI
    )
    scheduled_time: Optional[time] = Field(
        default=None, title="Hora", json_schema_extra={"ui": {"list": True}}
    )
    duration_minutes: Optional[int] = Field(
        default=None, title="Duración (min)", json_schema_extra={"ui": {"list": True}}
    )
    reason: str = Field(title="Motivo", json_schema_extra={"ui": {"list": True}})
    status: AppointmentStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    rescheduled_from_id: Optional[uuid.UUID] = Field(default=None, title="Reprogramada de")
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
