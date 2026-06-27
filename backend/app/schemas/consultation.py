import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, field_validator, model_validator

from backend.app.models.enums import ConsultationStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.utils.utc_now import utc_now

# Opciones del ciclo de vida clínico, reutilizadas en el filtro de lista (compatible
# con la proyección futura del frontend).
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "draft", "label": "Borrador"},
    {"value": "finalized", "label": "Finalizada"},
]

# Blob ``json_schema_extra`` precomputado y tipado ``dict[str, Any]`` (evita el
# conflicto de invarianza de pyright con ``JsonValue`` al anidar listas de opciones).
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
_CONSULTED_AT_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {"operator": "range", "label": "Atención", "widget": "datetime"},
    }
}


def _naive_utc(value: datetime) -> datetime:
    """Normaliza a UTC sin tzinfo, coherente con las columnas ``DateTime`` del dominio."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _reject_future(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    value = _naive_utc(value)
    if value > utc_now():
        raise ValueError("La fecha de atención no puede ser futura")
    return value


def _validate_appointment_order(
    consulted_at: Optional[datetime], next_appointment_at: Optional[datetime]
) -> None:
    if (
        consulted_at is not None
        and next_appointment_at is not None
        and next_appointment_at < consulted_at
    ):
        raise ValueError("La próxima cita no puede ser anterior a la atención")


class ConsultationCreate(ApiWriteSchema):
    """Alta de una consulta en borrador.

    El estado, los datos de finalización, la auditoría y el soft-delete los gobierna
    el servidor. ``consulted_at`` es opcional: si no llega, el servidor usa ``now()``.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente atendido (inmutable tras la creación).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    attending_doctor_id: uuid.UUID = Field(
        title="Médico tratante",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    appointment_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Cita de origen",
        description=(
            "Cita pending/confirmed que origina la consulta; se vincula sólo al crear"
            " y la marca como atendida. El paciente y el médico deben coincidir."
        ),
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    consulted_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de atención",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    reason_for_visit: str = Field(
        min_length=1,
        title="Motivo de consulta",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    current_illness: Optional[str] = Field(
        default=None,
        title="Padecimiento actual",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    interrogation: Optional[str] = Field(
        default=None,
        title="Interrogatorio",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    physical_examination: Optional[str] = Field(
        default=None,
        title="Exploración física",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    clinical_assessment: Optional[str] = Field(
        default=None,
        title="Valoración clínica",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    treatment: Optional[str] = Field(
        default=None,
        title="Tratamiento",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    prognosis: Optional[str] = Field(
        default=None,
        title="Pronóstico",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    follow_up_plan: Optional[str] = Field(
        default=None,
        title="Plan de seguimiento",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    next_appointment_at: Optional[datetime] = Field(
        default=None,
        title="Próxima cita sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("consulted_at")
    @classmethod
    def consulted_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @field_validator("next_appointment_at")
    @classmethod
    def normalize_next_appointment(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _naive_utc(value) if value is not None else None

    @model_validator(mode="after")
    def validate_appointment_order(self) -> "ConsultationCreate":
        _validate_appointment_order(self.consulted_at, self.next_appointment_at)
        return self


class ConsultationUpdate(ApiPatchSchema):
    """Edición parcial de un borrador (PATCH).

    ``patient_id``, ``status``, los datos de finalización, la auditoría y el borrado
    no se declaran aquí: enviarlos da 422 (extra forbid).
    """

    attending_doctor_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Médico tratante",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    consulted_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de atención",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    reason_for_visit: Optional[str] = Field(
        default=None,
        min_length=1,
        title="Motivo de consulta",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    current_illness: Optional[str] = Field(
        default=None,
        title="Padecimiento actual",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    interrogation: Optional[str] = Field(
        default=None,
        title="Interrogatorio",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    physical_examination: Optional[str] = Field(
        default=None,
        title="Exploración física",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    clinical_assessment: Optional[str] = Field(
        default=None,
        title="Valoración clínica",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    treatment: Optional[str] = Field(
        default=None,
        title="Tratamiento",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Indicaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    prognosis: Optional[str] = Field(
        default=None,
        title="Pronóstico",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    follow_up_plan: Optional[str] = Field(
        default=None,
        title="Plan de seguimiento",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    next_appointment_at: Optional[datetime] = Field(
        default=None,
        title="Próxima cita sugerida",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("consulted_at")
    @classmethod
    def consulted_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @field_validator("next_appointment_at")
    @classmethod
    def normalize_next_appointment(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _naive_utc(value) if value is not None else None

    @model_validator(mode="after")
    def validate_appointment_order(self) -> "ConsultationUpdate":
        # Sólo valida el orden cuando ambos extremos llegan en el mismo PATCH; la
        # combinación parcial contra el valor guardado la respalda el CHECK de la BD.
        _validate_appointment_order(self.consulted_at, self.next_appointment_at)
        return self


class ConsultationFinalize(ApiWriteSchema):
    """Cuerpo de la finalización: vacío por diseño.

    El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
    ``status``, ``finalized_by_doctor_id`` ni ``finalized_at``. ``extra="forbid"``
    rechaza cualquiera.
    """


class ConsultationRead(ApiReadSchema):
    """Representación completa de una consulta médica."""

    id: uuid.UUID
    patient_id: uuid.UUID
    attending_doctor_id: uuid.UUID
    appointment_id: Optional[uuid.UUID] = None
    consulted_at: datetime
    reason_for_visit: str
    current_illness: Optional[str] = None
    interrogation: Optional[str] = None
    physical_examination: Optional[str] = None
    clinical_assessment: Optional[str] = None
    treatment: Optional[str] = None
    instructions: Optional[str] = None
    prognosis: Optional[str] = None
    follow_up_plan: Optional[str] = None
    next_appointment_at: Optional[datetime] = None
    observations: Optional[str] = None
    status: ConsultationStatus
    finalized_by_doctor_id: Optional[uuid.UUID] = None
    finalized_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConsultationListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin el cuerpo narrativo)."""

    id: uuid.UUID
    # ``patient_id`` y ``attending_doctor_id`` habilitan los filtros exactos del
    # recurso (el motor exige que los campos de filtro existan en el schema de listado).
    patient_id: uuid.UUID = Field(title="Paciente")
    attending_doctor_id: uuid.UUID = Field(title="Médico tratante")
    consulted_at: datetime = Field(
        title="Atención", json_schema_extra=_CONSULTED_AT_LIST_FILTER_UI
    )
    reason_for_visit: str = Field(
        title="Motivo", json_schema_extra={"ui": {"list": True}}
    )
    status: ConsultationStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    finalized_by_doctor_id: Optional[uuid.UUID] = Field(
        default=None, title="Finalizada por"
    )
    finalized_at: Optional[datetime] = Field(
        default=None, title="Finalizada", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
