import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from backend.app.models.enums import MedicalHistoryVersionStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del ciclo de vida clínico, reutilizadas en el filtro de lista (compatible
# con la proyección futura del frontend).
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "draft", "label": "Borrador"},
    {"value": "current", "label": "Vigente"},
    {"value": "superseded", "label": "Sustituida"},
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


class MedicalHistoryVersionCreate(ApiWriteSchema):
    """Alta de un borrador de historia clínica.

    Sólo se aceptan ``patient_id`` y los campos narrativos. El servidor asigna
    ``version_number``, ``status`` y ``based_on_version_id``; cuando ya existe una
    versión vigente, su contenido se copia y estos campos se aplican encima.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        description="Paciente al que pertenece la historia clínica (inmutable).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    family_history: Optional[str] = Field(
        default=None,
        title="Antecedentes heredofamiliares",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    pathological_history: Optional[str] = Field(
        default=None,
        title="Antecedentes personales patológicos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    non_pathological_history: Optional[str] = Field(
        default=None,
        title="Antecedentes personales no patológicos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    previous_surgeries: Optional[str] = Field(
        default=None,
        title="Cirugías previas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    hospitalizations: Optional[str] = Field(
        default=None,
        title="Hospitalizaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    relevant_habits: Optional[str] = Field(
        default=None,
        title="Hábitos relevantes",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    gyneco_obstetric_history: Optional[str] = Field(
        default=None,
        title="Antecedentes gineco-obstétricos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    clinical_observations: Optional[str] = Field(
        default=None,
        title="Observaciones clínicas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class MedicalHistoryVersionUpdate(ApiPatchSchema):
    """Edición parcial de un borrador (PATCH).

    Sólo procede mientras la versión sea ``draft``. ``patient_id``,
    ``version_number``, ``status``, ``based_on_version_id``, los datos de revisión,
    la auditoría y el borrado no se declaran aquí: enviarlos da 422 (extra forbid).
    """

    family_history: Optional[str] = Field(
        default=None,
        title="Antecedentes heredofamiliares",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    pathological_history: Optional[str] = Field(
        default=None,
        title="Antecedentes personales patológicos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    non_pathological_history: Optional[str] = Field(
        default=None,
        title="Antecedentes personales no patológicos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    previous_surgeries: Optional[str] = Field(
        default=None,
        title="Cirugías previas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    hospitalizations: Optional[str] = Field(
        default=None,
        title="Hospitalizaciones",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    relevant_habits: Optional[str] = Field(
        default=None,
        title="Hábitos relevantes",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    gyneco_obstetric_history: Optional[str] = Field(
        default=None,
        title="Antecedentes gineco-obstétricos",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    clinical_observations: Optional[str] = Field(
        default=None,
        title="Observaciones clínicas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class MedicalHistoryVersionFinalize(ApiWriteSchema):
    """Cuerpo de la finalización: vacío por diseño.

    El médico se deriva del usuario autenticado; el cliente no envía ``doctor_id``,
    ``status``, auditoría ni campos clínicos. ``extra="forbid"`` rechaza cualquiera.
    """


class MedicalHistoryVersionRead(ApiReadSchema):
    """Representación completa de una versión de historia clínica."""

    id: uuid.UUID
    patient_id: uuid.UUID
    version_number: int
    status: MedicalHistoryVersionStatus
    based_on_version_id: Optional[uuid.UUID] = None
    family_history: Optional[str] = None
    pathological_history: Optional[str] = None
    non_pathological_history: Optional[str] = None
    previous_surgeries: Optional[str] = None
    hospitalizations: Optional[str] = None
    relevant_habits: Optional[str] = None
    gyneco_obstetric_history: Optional[str] = None
    clinical_observations: Optional[str] = None
    reviewed_by_doctor_id: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class MedicalHistoryVersionListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin campos narrativos)."""

    id: uuid.UUID
    # ``patient_id`` habilita el filtro exacto declarado por el recurso (el motor
    # exige que los campos de filtro existan en el schema de listado).
    patient_id: uuid.UUID = Field(title="Paciente")
    version_number: int = Field(
        title="Versión", json_schema_extra={"ui": {"list": True}}
    )
    status: MedicalHistoryVersionStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    based_on_version_id: Optional[uuid.UUID] = Field(default=None, title="Basada en")
    reviewed_by_doctor_id: Optional[uuid.UUID] = Field(
        default=None, title="Revisada por"
    )
    reviewed_at: Optional[datetime] = Field(
        default=None, title="Revisada", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creada", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizada")
