import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, field_validator, model_validator

from backend.app.models.enums import LabResultAbnormalFlag
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.utils.utc_now import utc_now

# ``measured_at`` es columna de lista; su filtro de rango de calendario (on/before/
# after/between) lo publica ``filterable_fields`` desde ``field_operators`` del recurso,
# no el bloque ``ui.filter`` legacy.
_MEASURED_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}
_ABNORMAL_FLAG_FORM_UI: dict[str, Any] = {"ui": {"form": True, "widget": "select"}}


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


def _validate_value_present(
    value_numeric: Optional[float], value_text: Optional[str]
) -> None:
    """Un resultado debe traer al menos un valor (numérico o cualitativo)."""
    if value_numeric is None and (value_text is None or value_text == ""):
        raise ValueError(
            "Debe registrar un valor numérico o un valor cualitativo"
        )


def _validate_reference_range(
    low: Optional[float], high: Optional[float]
) -> None:
    if low is not None and high is not None and low > high:
        raise ValueError(
            "El límite inferior del rango no puede ser mayor que el superior"
        )


class LabResultCreate(ApiWriteSchema):
    """Registro de un resultado de laboratorio/observación estructurado.

    Registrar un resultado es una ESCRITURA clínica: el médico aprueba el payload
    exacto (protocolo P1 en el copiloto). La auditoría, la revisión y el borrado
    los gobierna el servidor; no se aceptan como entrada.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece el resultado.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    consultation_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Consulta",
        description="Consulta asociada, si aplica.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    clinical_document_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Documento de origen",
        description="Archivo clínico del que se extrajo el resultado, si aplica.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    analyte_name: str = Field(
        min_length=1,
        max_length=255,
        title="Analito o prueba",
        description="Nombre del analito o prueba (p. ej. 'HbA1c').",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    analyte_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (LOINC)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    value_numeric: Optional[float] = Field(
        default=None,
        title="Valor numérico",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    value_text: Optional[str] = Field(
        default=None,
        max_length=2000,
        title="Valor cualitativo",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    unit: Optional[str] = Field(
        default=None,
        max_length=50,
        title="Unidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    reference_range_low: Optional[float] = Field(
        default=None,
        title="Rango de referencia (mín.)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    reference_range_high: Optional[float] = Field(
        default=None,
        title="Rango de referencia (máx.)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    abnormal_flag: LabResultAbnormalFlag = Field(
        default=LabResultAbnormalFlag.UNKNOWN,
        title="Marca de anormalidad",
        json_schema_extra=_ABNORMAL_FLAG_FORM_UI,
    )
    measured_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de medición",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    source_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Laboratorio / fuente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    method: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Método",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )

    @field_validator("measured_at")
    @classmethod
    def measured_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_payload(self) -> "LabResultCreate":
        _validate_value_present(self.value_numeric, self.value_text)
        _validate_reference_range(self.reference_range_low, self.reference_range_high)
        return self


class LabResultUpdate(ApiPatchSchema):
    """Edición parcial de un resultado (PATCH).

    ``patient_id``, la auditoría, la revisión y el borrado no se declaran aquí:
    enviarlos da 422 (extra forbid).
    """

    consultation_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Consulta",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    clinical_document_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Documento de origen",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    analyte_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Analito o prueba",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    analyte_code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (LOINC)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    value_numeric: Optional[float] = Field(
        default=None,
        title="Valor numérico",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    value_text: Optional[str] = Field(
        default=None,
        max_length=2000,
        title="Valor cualitativo",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    unit: Optional[str] = Field(
        default=None,
        max_length=50,
        title="Unidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    reference_range_low: Optional[float] = Field(
        default=None,
        title="Rango de referencia (mín.)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    reference_range_high: Optional[float] = Field(
        default=None,
        title="Rango de referencia (máx.)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    abnormal_flag: Optional[LabResultAbnormalFlag] = Field(
        default=None,
        title="Marca de anormalidad",
        json_schema_extra=_ABNORMAL_FLAG_FORM_UI,
    )
    measured_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de medición",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    source_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Laboratorio / fuente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    method: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Método",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )

    @field_validator("measured_at")
    @classmethod
    def measured_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)

    @model_validator(mode="after")
    def validate_reference_range(self) -> "LabResultUpdate":
        # Solo valida el rango cuando ambos extremos llegan en el mismo PATCH; el
        # CHECK de la BD respalda la combinación parcial contra el valor guardado.
        if self.reference_range_low is not None and self.reference_range_high is not None:
            _validate_reference_range(self.reference_range_low, self.reference_range_high)
        return self


class LabResultRead(ApiReadSchema):
    """Representación pública completa de un resultado de laboratorio."""

    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: Optional[uuid.UUID] = None
    clinical_document_id: Optional[uuid.UUID] = None
    analyte_name: str
    analyte_code: Optional[str] = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    unit: Optional[str] = None
    reference_range_low: Optional[float] = None
    reference_range_high: Optional[float] = None
    abnormal_flag: LabResultAbnormalFlag
    measured_at: datetime
    source_name: Optional[str] = None
    method: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class LabResultListItem(ApiReadSchema):
    """Versión de listado de un resultado de laboratorio.

    Declara los campos de filtro (``patient_id``, ``consultation_id``,
    ``analyte_name``, ``abnormal_flag``, ``measured_at``) que el motor de query
    exige presentes en el schema de listado.
    """

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    consultation_id: Optional[uuid.UUID] = Field(default=None, title="Consulta")
    analyte_name: str = Field(
        title="Analito", json_schema_extra={"ui": {"list": True}}
    )
    analyte_code: Optional[str] = Field(default=None, title="Código")
    value_numeric: Optional[float] = Field(
        default=None, title="Valor", json_schema_extra={"ui": {"list": True}}
    )
    value_text: Optional[str] = Field(
        default=None, title="Valor (texto)", json_schema_extra={"ui": {"list": True}}
    )
    unit: Optional[str] = Field(
        default=None, title="Unidad", json_schema_extra={"ui": {"list": True}}
    )
    reference_range_low: Optional[float] = Field(default=None, title="Ref. mín.")
    reference_range_high: Optional[float] = Field(default=None, title="Ref. máx.")
    abnormal_flag: LabResultAbnormalFlag = Field(
        title="Anormalidad", json_schema_extra={"ui": {"list": True}}
    )
    measured_at: datetime = Field(
        title="Medición", json_schema_extra=_MEASURED_AT_LIST_FILTER_UI
    )
    source_name: Optional[str] = Field(
        default=None, title="Fuente", json_schema_extra={"ui": {"list": True}}
    )
    reviewed_at: Optional[datetime] = Field(default=None, title="Revisado")
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
