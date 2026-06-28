import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, field_validator, model_validator

from backend.app.models.enums import (
    ClinicalEventStatus,
    ClinicalEventType,
    ClinicalSeverity,
)
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.utils.utc_now import utc_now

# ``started_at`` es columna de lista; su filtro de rango de calendario lo publica
# ``filterable_fields`` desde ``field_operators`` del recurso.
_STARTED_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}
_TYPE_FORM_UI: dict[str, Any] = {"ui": {"form": True, "widget": "select"}}


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _reject_future(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    value = _naive_utc(value)
    if value > utc_now():
        raise ValueError("La fecha de inicio no puede ser futura")
    return value


def _validate_event_dates(
    started_at: Optional[datetime], ended_at: Optional[datetime]
) -> None:
    if started_at is not None and ended_at is not None and ended_at < started_at:
        raise ValueError("La fecha de fin no puede ser anterior a la de inicio")


class ClinicalEventCreate(ApiWriteSchema):
    """Registro de un evento clínico en la línea de tiempo del paciente.

    Registrar un evento es una ESCRITURA clínica: el médico aprueba el payload
    exacto (protocolo P1 en el copiloto). La auditoría y el borrado los gobierna el
    servidor; no se aceptan como entrada.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece el evento.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    event_type: ClinicalEventType = Field(
        title="Tipo de evento", json_schema_extra=_TYPE_FORM_UI
    )
    title: str = Field(
        min_length=1,
        max_length=255,
        title="Título",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    started_at: Optional[datetime] = Field(
        default=None,
        title="Inicio",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        title="Fin",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    severity: Optional[ClinicalSeverity] = Field(
        default=None, title="Severidad", json_schema_extra={"ui": {"form": True, "widget": "select"}}
    )
    specialty: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    destination: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Destino",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    status: Optional[ClinicalEventStatus] = Field(
        default=None, title="Estado", json_schema_extra={"ui": {"form": True, "widget": "select"}}
    )

    @field_validator("started_at")
    @classmethod
    def started_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "ClinicalEventCreate":
        _validate_event_dates(self.started_at, self.ended_at)
        return self


class ClinicalEventUpdate(ApiPatchSchema):
    """Edición parcial de un evento (PATCH).

    ``patient_id``, la auditoría y el borrado no se declaran aquí: enviarlos da 422.
    """

    event_type: Optional[ClinicalEventType] = Field(
        default=None, title="Tipo de evento", json_schema_extra=_TYPE_FORM_UI
    )
    title: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Título",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    started_at: Optional[datetime] = Field(
        default=None,
        title="Inicio",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    ended_at: Optional[datetime] = Field(
        default=None,
        title="Fin",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    severity: Optional[ClinicalSeverity] = Field(
        default=None, title="Severidad", json_schema_extra={"ui": {"form": True, "widget": "select"}}
    )
    specialty: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    destination: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Destino",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    status: Optional[ClinicalEventStatus] = Field(
        default=None, title="Estado", json_schema_extra={"ui": {"form": True, "widget": "select"}}
    )

    @field_validator("started_at")
    @classmethod
    def started_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "ClinicalEventUpdate":
        # Solo valida el orden cuando ambos extremos llegan en el mismo PATCH; el CHECK
        # de la BD respalda la combinación parcial contra el valor guardado.
        if self.started_at is not None and self.ended_at is not None:
            _validate_event_dates(self.started_at, self.ended_at)
        return self


class ClinicalEventRead(ApiReadSchema):
    """Representación pública completa de un evento clínico."""

    id: uuid.UUID
    patient_id: uuid.UUID
    event_type: ClinicalEventType
    title: str
    description: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    severity: Optional[ClinicalSeverity] = None
    specialty: Optional[str] = None
    destination: Optional[str] = None
    status: Optional[ClinicalEventStatus] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClinicalEventListItem(ApiReadSchema):
    """Versión de listado de un evento clínico.

    Declara los campos de filtro (``patient_id``, ``event_type``, ``status``,
    ``started_at``) que el motor de query exige presentes en el schema de listado.
    """

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    event_type: ClinicalEventType = Field(
        title="Tipo", json_schema_extra={"ui": {"list": True}}
    )
    title: str = Field(title="Título", json_schema_extra={"ui": {"list": True}})
    started_at: datetime = Field(
        title="Inicio", json_schema_extra=_STARTED_AT_LIST_FILTER_UI
    )
    ended_at: Optional[datetime] = Field(default=None, title="Fin")
    severity: Optional[ClinicalSeverity] = Field(
        default=None, title="Severidad", json_schema_extra={"ui": {"list": True}}
    )
    specialty: Optional[str] = Field(
        default=None, title="Especialidad", json_schema_extra={"ui": {"list": True}}
    )
    destination: Optional[str] = Field(default=None, title="Destino")
    status: Optional[ClinicalEventStatus] = Field(
        default=None, title="Estado", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
