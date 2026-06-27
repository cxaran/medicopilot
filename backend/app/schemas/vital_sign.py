import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, computed_field, field_validator, model_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.utils.utc_now import utc_now

# ``measured_at`` es columna de lista; su filtro de rango de calendario (on/before/
# after/between) lo publica ``filterable_fields`` desde ``field_operators`` del recurso,
# no el bloque ``ui.filter`` legacy (que sólo admite un operador único).
_MEASURED_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}


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
        raise ValueError("La fecha de medición no puede ser futura")
    return value


def _validate_blood_pressure(
    systolic: Optional[int], diastolic: Optional[int]
) -> None:
    """Ambas presiones o ninguna; si ambas existen, sistólica >= diastólica."""
    if (systolic is None) != (diastolic is None):
        raise ValueError(
            "La presión sistólica y diastólica deben registrarse juntas"
        )
    if systolic is not None and diastolic is not None and systolic < diastolic:
        raise ValueError(
            "La presión sistólica no puede ser menor que la diastólica"
        )


def _compute_bmi(
    weight_kg: Optional[float], height_cm: Optional[float]
) -> Optional[float]:
    """IMC derivado; nulo si falta peso o talla. No se persiste."""
    if weight_kg is None or height_cm is None or height_cm == 0:
        return None
    height_m = height_cm / 100
    return round(weight_kg / (height_m * height_m), 2)


class VitalSignCreate(ApiWriteSchema):
    """Registro de una medición de signos vitales en una consulta.

    El paciente y el médico se derivan de la consulta. ``bmi``, el estado, la
    auditoría y el borrado los gobierna el servidor o se calculan; no se aceptan.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta",
        description="Consulta a la que pertenece la medición (inmutable).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    measured_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de medición",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    weight_kg: Optional[float] = Field(
        default=None, gt=0, title="Peso (kg)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    height_cm: Optional[float] = Field(
        default=None, gt=0, title="Talla (cm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    temperature_c: Optional[float] = Field(
        default=None, gt=0, title="Temperatura (°C)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    systolic_bp: Optional[int] = Field(
        default=None, title="Presión sistólica",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    diastolic_bp: Optional[int] = Field(
        default=None, title="Presión diastólica",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    heart_rate_bpm: Optional[int] = Field(
        default=None, gt=0, title="Frecuencia cardiaca (lpm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    respiratory_rate_rpm: Optional[int] = Field(
        default=None, gt=0, title="Frecuencia respiratoria (rpm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    oxygen_saturation: Optional[float] = Field(
        default=None, ge=0, le=100, title="Saturación de oxígeno (%)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    capillary_glucose: Optional[float] = Field(
        default=None, ge=0, title="Glucosa capilar (mg/dL)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    pain_scale: Optional[int] = Field(
        default=None, ge=0, le=10, title="Escala de dolor (0-10)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("measured_at")
    @classmethod
    def measured_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_blood_pressure(self) -> "VitalSignCreate":
        _validate_blood_pressure(self.systolic_bp, self.diastolic_bp)
        return self


class VitalSignUpdate(ApiPatchSchema):
    """Edición parcial de una medición (PATCH), sólo si la consulta es draft.

    ``consultation_id``, ``bmi``, la auditoría y el borrado no se declaran aquí:
    enviarlos da 422 (extra forbid).
    """

    measured_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de medición",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    weight_kg: Optional[float] = Field(
        default=None, gt=0, title="Peso (kg)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    height_cm: Optional[float] = Field(
        default=None, gt=0, title="Talla (cm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    temperature_c: Optional[float] = Field(
        default=None, gt=0, title="Temperatura (°C)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    systolic_bp: Optional[int] = Field(
        default=None, title="Presión sistólica",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    diastolic_bp: Optional[int] = Field(
        default=None, title="Presión diastólica",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    heart_rate_bpm: Optional[int] = Field(
        default=None, gt=0, title="Frecuencia cardiaca (lpm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    respiratory_rate_rpm: Optional[int] = Field(
        default=None, gt=0, title="Frecuencia respiratoria (rpm)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    oxygen_saturation: Optional[float] = Field(
        default=None, ge=0, le=100, title="Saturación de oxígeno (%)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    capillary_glucose: Optional[float] = Field(
        default=None, ge=0, title="Glucosa capilar (mg/dL)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    pain_scale: Optional[int] = Field(
        default=None, ge=0, le=10, title="Escala de dolor (0-10)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    observations: Optional[str] = Field(
        default=None,
        title="Observaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @field_validator("measured_at")
    @classmethod
    def measured_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_blood_pressure(self) -> "VitalSignUpdate":
        # Sólo valida el par cuando ambos extremos llegan en el mismo PATCH; la
        # combinación parcial contra el valor guardado la respalda el CHECK de la BD.
        if self.systolic_bp is not None or self.diastolic_bp is not None:
            _validate_blood_pressure(self.systolic_bp, self.diastolic_bp)
        return self


class VitalSignRead(ApiReadSchema):
    """Representación completa de una medición, con ``bmi`` derivado (read-only)."""

    id: uuid.UUID
    consultation_id: uuid.UUID
    measured_at: datetime
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    temperature_c: Optional[float] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    heart_rate_bpm: Optional[int] = None
    respiratory_rate_rpm: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    capillary_glucose: Optional[float] = None
    pain_scale: Optional[int] = None
    observations: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def bmi(self) -> Optional[float]:
        return _compute_bmi(self.weight_kg, self.height_cm)


class VitalSignListItem(ApiReadSchema):
    """Versión de listado (sin ``observations``), con ``bmi`` derivado."""

    id: uuid.UUID
    # ``consultation_id`` habilita el filtro exacto del recurso (el motor exige que
    # los campos de filtro existan en el schema de listado).
    consultation_id: uuid.UUID = Field(title="Consulta")
    measured_at: datetime = Field(
        title="Medición", json_schema_extra=_MEASURED_AT_LIST_FILTER_UI
    )
    weight_kg: Optional[float] = Field(
        default=None, title="Peso (kg)", json_schema_extra={"ui": {"list": True}}
    )
    height_cm: Optional[float] = Field(
        default=None, title="Talla (cm)", json_schema_extra={"ui": {"list": True}}
    )
    temperature_c: Optional[float] = Field(
        default=None, title="Temperatura (°C)", json_schema_extra={"ui": {"list": True}}
    )
    systolic_bp: Optional[int] = Field(
        default=None, title="Sistólica", json_schema_extra={"ui": {"list": True}}
    )
    diastolic_bp: Optional[int] = Field(
        default=None, title="Diastólica", json_schema_extra={"ui": {"list": True}}
    )
    heart_rate_bpm: Optional[int] = Field(
        default=None, title="FC (lpm)", json_schema_extra={"ui": {"list": True}}
    )
    respiratory_rate_rpm: Optional[int] = Field(
        default=None, title="FR (rpm)", json_schema_extra={"ui": {"list": True}}
    )
    oxygen_saturation: Optional[float] = Field(
        default=None, title="SpO₂ (%)", json_schema_extra={"ui": {"list": True}}
    )
    capillary_glucose: Optional[float] = Field(
        default=None, title="Glucosa", json_schema_extra={"ui": {"list": True}}
    )
    pain_scale: Optional[int] = Field(
        default=None, title="Dolor", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def bmi(self) -> Optional[float]:
        return _compute_bmi(self.weight_kg, self.height_cm)
