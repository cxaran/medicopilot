import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import ClinicalTaskPriority, ClinicalTaskStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

_DUE_AT_LIST_FILTER_UI: dict[str, Any] = {"ui": {"list": True}}
_PRIORITY_FORM_UI: dict[str, Any] = {"ui": {"form": True, "widget": "select"}}
_STATUS_FORM_UI: dict[str, Any] = {"ui": {"form": True, "widget": "select"}}


class ClinicalTaskCreate(ApiWriteSchema):
    """Creación de una tarea clínica de seguimiento.

    ``owner_id`` es opcional: si se omite, el servidor asigna al usuario actual como
    dueño. Crear una tarea es una ESCRITURA: en el copiloto pasa por el protocolo de
    aprobación P1. La auditoría y el borrado los gobierna el servidor.
    """

    owner_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Responsable",
        description="Usuario dueño de la tarea; por defecto, el usuario actual.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    patient_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Paciente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
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
    due_at: Optional[datetime] = Field(
        default=None,
        title="Vencimiento",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    priority: ClinicalTaskPriority = Field(
        default=ClinicalTaskPriority.MEDIUM,
        title="Prioridad",
        json_schema_extra=_PRIORITY_FORM_UI,
    )
    status: ClinicalTaskStatus = Field(
        default=ClinicalTaskStatus.OPEN,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class ClinicalTaskUpdate(ApiPatchSchema):
    """Edición parcial de una tarea (PATCH). ``owner_id`` no es editable aquí."""

    patient_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Paciente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
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
    due_at: Optional[datetime] = Field(
        default=None,
        title="Vencimiento",
        json_schema_extra={"ui": {"form": True, "widget": "datetime"}},
    )
    priority: Optional[ClinicalTaskPriority] = Field(
        default=None,
        title="Prioridad",
        json_schema_extra=_PRIORITY_FORM_UI,
    )
    status: Optional[ClinicalTaskStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class ClinicalTaskRead(ApiReadSchema):
    """Representación pública completa de una tarea clínica."""

    id: uuid.UUID
    owner_id: uuid.UUID
    patient_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    due_at: Optional[datetime] = None
    priority: ClinicalTaskPriority
    status: ClinicalTaskStatus
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClinicalTaskListItem(ApiReadSchema):
    """Versión de listado de una tarea clínica.

    Declara los campos de filtro (``owner_id``, ``patient_id``, ``status``,
    ``priority``, ``due_at``) que el motor de query exige presentes en el listado.
    """

    id: uuid.UUID
    owner_id: uuid.UUID = Field(title="Responsable")
    patient_id: Optional[uuid.UUID] = Field(default=None, title="Paciente")
    title: str = Field(title="Título", json_schema_extra={"ui": {"list": True}})
    due_at: Optional[datetime] = Field(
        default=None, title="Vencimiento", json_schema_extra=_DUE_AT_LIST_FILTER_UI
    )
    priority: ClinicalTaskPriority = Field(
        title="Prioridad", json_schema_extra={"ui": {"list": True}}
    )
    status: ClinicalTaskStatus = Field(title="Estado", json_schema_extra={"ui": {"list": True}})
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
