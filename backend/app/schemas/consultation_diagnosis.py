import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field, model_validator

from backend.app.models.enums import ConsultationDiagnosisKind
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del tipo de diagnóstico, reutilizadas en el filtro de lista (compatible
# con la proyección futura del frontend).
_KIND_OPTIONS: list[dict[str, Any]] = [
    {"value": "primary", "label": "Principal"},
    {"value": "secondary", "label": "Secundario"},
    {"value": "suspected", "label": "Presuntivo"},
]

# Blobs ``json_schema_extra`` precomputados y tipados ``dict[str, Any]`` (evitan el
# conflicto de invarianza de pyright con ``JsonValue`` al anidar listas de opciones).
_KIND_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _KIND_OPTIONS}
}
_KIND_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Tipo",
            "widget": "select",
            "options": _KIND_OPTIONS,
        },
    }
}


def _validate_coding_pair(code: Optional[str], coding_system: Optional[str]) -> None:
    """``coding_system`` y ``code`` van juntos o ambos nulos."""
    if (code is None) != (coding_system is None):
        raise ValueError(
            "El sistema de codificación y el código deben registrarse juntos"
        )


class ConsultationDiagnosisCreate(ApiWriteSchema):
    """Alta de un diagnóstico o impresión diagnóstica en una consulta.

    El paciente y el médico se derivan de la consulta. El estado, la auditoría y el
    borrado los gobierna el servidor; no se aceptan.
    """

    consultation_id: uuid.UUID = Field(
        title="Consulta",
        description="Consulta a la que pertenece el diagnóstico (inmutable).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    diagnosis_kind: ConsultationDiagnosisKind = Field(
        title="Tipo", json_schema_extra=_KIND_FORM_UI
    )
    diagnosis_text: str = Field(
        min_length=1,
        title="Diagnóstico",
        description="Texto del diagnóstico o impresión diagnóstica.",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    coding_system: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Sistema de codificación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    code: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Código",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    clinical_code_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Código clínico (catálogo)",
        description="Código clínico validado del catálogo (CIE-10), si se eligió uno.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @model_validator(mode="after")
    def validate_coding_pair(self) -> "ConsultationDiagnosisCreate":
        _validate_coding_pair(self.code, self.coding_system)
        return self


class ConsultationDiagnosisUpdate(ApiPatchSchema):
    """Edición parcial de un diagnóstico (PATCH), sólo si la consulta es draft.

    ``consultation_id``, la auditoría y el borrado no se declaran aquí: enviarlos da
    422 (extra forbid).
    """

    diagnosis_kind: Optional[ConsultationDiagnosisKind] = Field(
        default=None, title="Tipo", json_schema_extra=_KIND_FORM_UI
    )
    diagnosis_text: Optional[str] = Field(
        default=None,
        min_length=1,
        title="Diagnóstico",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    coding_system: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Sistema de codificación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    code: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Código",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    clinical_code_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Código clínico (catálogo)",
        description="Código clínico validado del catálogo (CIE-10), si se eligió uno.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    notes: Optional[str] = Field(
        default=None,
        title="Notas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )

    @model_validator(mode="after")
    def validate_coding_pair(self) -> "ConsultationDiagnosisUpdate":
        # Sólo valida el par cuando ambos llegan en el mismo PATCH; la combinación
        # parcial contra el valor guardado la respalda el CHECK de la base de datos.
        fields_set = self.model_fields_set
        if "code" in fields_set and "coding_system" in fields_set:
            _validate_coding_pair(self.code, self.coding_system)
        return self


class ConsultationDiagnosisRead(ApiReadSchema):
    """Representación completa de un diagnóstico de consulta."""

    id: uuid.UUID
    consultation_id: uuid.UUID
    diagnosis_kind: ConsultationDiagnosisKind
    diagnosis_text: str
    coding_system: Optional[str] = None
    code: Optional[str] = None
    clinical_code_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ConsultationDiagnosisListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery`` (sin ``notes``)."""

    id: uuid.UUID
    # ``consultation_id`` habilita el filtro exacto del recurso (el motor exige que
    # los campos de filtro existan en el schema de listado).
    consultation_id: uuid.UUID = Field(title="Consulta")
    diagnosis_kind: ConsultationDiagnosisKind = Field(
        title="Tipo", json_schema_extra=_KIND_LIST_FILTER_UI
    )
    diagnosis_text: str = Field(
        title="Diagnóstico", json_schema_extra={"ui": {"list": True}}
    )
    coding_system: Optional[str] = Field(
        default=None, title="Sistema", json_schema_extra={"ui": {"list": True}}
    )
    code: Optional[str] = Field(
        default=None, title="Código", json_schema_extra={"ui": {"list": True}}
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
    updated_at: Optional[datetime] = Field(default=None, title="Actualizado")
