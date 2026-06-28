"""Schemas de la consulta de cohorte poblacional (G5 fase 1, sólo lectura).

Una cohorte es un CONTEO agregado más una MUESTRA de pacientes que cumplen
criterios estructurados combinados con AND. No expone PHI más allá de lo que el
RBAC ya permite (``population:read``) y nunca incluye pacientes con baja lógica.

Criterios soportados en la fase 1 (todos opcionales, combinados con AND):

- ``has_diagnosis``: coincidencia por código (exacto, sin distinguir mayúsculas) o
  por texto (subcadena) sobre los diagnósticos de consulta del paciente.
- ``lab_abnormal``: analito con resultado anormal (low/high/critical) dentro de una
  ventana de fechas opcional sobre ``measured_at``.
- ``vital_threshold``: signo vital con comparador y valor umbral.
- ``pregnancy_status``: estado de embarazo/lactancia del paciente.
- ``age_range``: edad mínima y/o máxima (años cumplidos) calculada desde la fecha
  de nacimiento.
- ``appointment_no_show``: tuvo una cita marcada como inasistencia (``no_show``)
  dentro de una ventana de fechas opcional sobre ``scheduled_at``.
"""

from datetime import date
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import Field, model_validator

from backend.app.models.enums import PregnancyStatus
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class VitalMetric(str, Enum):
    """Signo vital comparable en un criterio de umbral (columna de ``vital_signs``)."""

    SYSTOLIC_BP = "systolic_bp"
    DIASTOLIC_BP = "diastolic_bp"
    HEART_RATE_BPM = "heart_rate_bpm"
    RESPIRATORY_RATE_RPM = "respiratory_rate_rpm"
    OXYGEN_SATURATION = "oxygen_saturation"
    TEMPERATURE_C = "temperature_c"
    WEIGHT_KG = "weight_kg"
    HEIGHT_CM = "height_cm"
    CAPILLARY_GLUCOSE = "capillary_glucose"
    PAIN_SCALE = "pain_scale"


class Comparator(str, Enum):
    """Comparador numérico para un umbral de signo vital."""

    GTE = "gte"
    LTE = "lte"
    GT = "gt"
    LT = "lt"
    EQ = "eq"


class HasDiagnosisCriterion(ApiWriteSchema):
    """Coincidencia por código o por texto sobre los diagnósticos de consulta.

    Requiere al menos uno de los dos. Si se indican ambos, se exigen ambos (AND).
    El código se compara de forma exacta sin distinguir mayúsculas; el texto se
    compara como subcadena (ILIKE).
    """

    code: Optional[str] = Field(default=None, max_length=80)
    text: Optional[str] = Field(default=None, min_length=2, max_length=200)

    @model_validator(mode="after")
    def _require_one(self) -> "HasDiagnosisCriterion":
        if not self.code and not self.text:
            raise ValueError("Indique 'code' o 'text' para el criterio de diagnóstico.")
        return self


class LabAbnormalCriterion(ApiWriteSchema):
    """Resultado de laboratorio anormal (low/high/critical) para un analito.

    El analito se compara contra el nombre (subcadena) o el código (exacto). La
    ventana de fechas, opcional, se aplica sobre ``measured_at`` de forma inclusiva.
    """

    analyte: str = Field(min_length=2, max_length=200)
    date_from: Optional[date] = None
    date_to: Optional[date] = None

    @model_validator(mode="after")
    def _check_window(self) -> "LabAbnormalCriterion":
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to no puede ser anterior a date_from.")
        return self


class VitalThresholdCriterion(ApiWriteSchema):
    """Umbral sobre un signo vital: métrica, comparador y valor de referencia."""

    vital: VitalMetric
    comparator: Comparator
    value: float


class AgeRangeCriterion(ApiWriteSchema):
    """Rango de edad (años cumplidos) calculado desde la fecha de nacimiento.

    Requiere al menos uno de ``min_age``/``max_age``. Ambos límites son inclusivos.
    """

    min_age: Optional[int] = Field(default=None, ge=0, le=150)
    max_age: Optional[int] = Field(default=None, ge=0, le=150)

    @model_validator(mode="after")
    def _check_range(self) -> "AgeRangeCriterion":
        if self.min_age is None and self.max_age is None:
            raise ValueError("Indique min_age y/o max_age.")
        if (
            self.min_age is not None
            and self.max_age is not None
            and self.max_age < self.min_age
        ):
            raise ValueError("max_age no puede ser menor que min_age.")
        return self


class AppointmentNoShowCriterion(ApiWriteSchema):
    """Tuvo una cita marcada como inasistencia (``no_show``).

    La ventana de fechas, opcional, se aplica sobre ``scheduled_at`` de forma
    inclusiva.
    """

    date_from: Optional[date] = None
    date_to: Optional[date] = None

    @model_validator(mode="after")
    def _check_window(self) -> "AppointmentNoShowCriterion":
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValueError("date_to no puede ser anterior a date_from.")
        return self


class CohortCriteria(ApiWriteSchema):
    """Criterios componibles (AND) de la consulta de cohorte.

    Sin criterios, la cohorte abarca a todos los pacientes vigentes (no eliminados).
    ``limit``/``offset`` paginan únicamente la muestra; ``count`` siempre es el total.
    """

    has_diagnosis: Optional[HasDiagnosisCriterion] = None
    lab_abnormal: Optional[LabAbnormalCriterion] = None
    vital_threshold: Optional[VitalThresholdCriterion] = None
    pregnancy_status: Optional[PregnancyStatus] = None
    age_range: Optional[AgeRangeCriterion] = None
    appointment_no_show: Optional[AppointmentNoShowCriterion] = None
    limit: int = Field(default=20, ge=1, le=100, description="Tamaño de la muestra.")
    offset: int = Field(default=0, ge=0, description="Desplazamiento de la muestra.")


class CohortPatient(ApiReadSchema):
    """Paciente de la muestra: mínimo identificable, sin PHI adicional."""

    patient_id: UUID
    full_name: str


class CohortResult(ApiReadSchema):
    """Resultado agregado: conteo total más una muestra paginada para revisión médica."""

    count: int
    sample: list[CohortPatient]
