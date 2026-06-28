import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import Field, field_validator

from backend.app.models.enums import StudyOrderStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.utils.utc_now import utc_now

_ORDERED_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}
_STATUS_FORM_UI: dict[str, Any] = {"ui": {"form": True, "widget": "select"}}


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _reject_future(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    value = _naive_utc(value)
    if value > utc_now():
        raise ValueError("La fecha de la orden no puede ser futura")
    return value


class StudyOrderCreate(ApiWriteSchema):
    """Solicitud de una orden de estudio para un paciente.

    Crear una orden es una ESCRITURA clínica: el médico aprueba el payload exacto
    (protocolo P1 en el copiloto). La auditoría y el borrado los gobierna el
    servidor; no se aceptan como entrada.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    ordered_by: uuid.UUID = Field(
        title="Médico que ordena",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    study_name: str = Field(
        min_length=1,
        max_length=255,
        title="Estudio",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (LOINC)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    reason: Optional[str] = Field(
        default=None,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    ordered_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de la orden",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    status: StudyOrderStatus = Field(
        default=StudyOrderStatus.PENDING,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    result_lab_result_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Resultado vinculado",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )

    @field_validator("ordered_at")
    @classmethod
    def ordered_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)


class StudyOrderUpdate(ApiPatchSchema):
    """Edición parcial de una orden (PATCH).

    ``patient_id`` y ``ordered_by`` no se declaran aquí: enviarlos da 422.
    """

    study_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Estudio",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    code: Optional[str] = Field(
        default=None,
        max_length=64,
        title="Código (LOINC)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    reason: Optional[str] = Field(
        default=None,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    ordered_at: Optional[datetime] = Field(
        default=None,
        title="Fecha de la orden",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    status: Optional[StudyOrderStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    result_lab_result_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Resultado vinculado",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )

    @field_validator("ordered_at")
    @classmethod
    def ordered_at_not_future(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _reject_future(value)


class StudyOrderRead(ApiReadSchema):
    """Representación pública completa de una orden de estudio."""

    id: uuid.UUID
    patient_id: uuid.UUID
    ordered_by: uuid.UUID
    study_name: str
    code: Optional[str] = None
    reason: Optional[str] = None
    ordered_at: datetime
    status: StudyOrderStatus
    result_lab_result_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class StudyOrderListItem(ApiReadSchema):
    """Versión de listado de una orden de estudio.

    Declara los campos de filtro (``patient_id``, ``ordered_by``, ``status``,
    ``ordered_at``) que el motor de query exige presentes en el schema de listado.
    """

    id: uuid.UUID
    patient_id: uuid.UUID = Field(title="Paciente")
    ordered_by: uuid.UUID = Field(title="Médico")
    study_name: str = Field(title="Estudio", json_schema_extra={"ui": {"list": True}})
    code: Optional[str] = Field(default=None, title="Código")
    status: StudyOrderStatus = Field(title="Estado", json_schema_extra={"ui": {"list": True}})
    ordered_at: datetime = Field(
        title="Ordenado", json_schema_extra=_ORDERED_AT_LIST_FILTER_UI
    )
    result_lab_result_id: Optional[uuid.UUID] = Field(default=None, title="Resultado")
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
