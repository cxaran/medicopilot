import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import EmailStr, Field, field_validator

from backend.app.models.enums import PatientStatus, PregnancyStatus, Sex
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones reutilizadas en formulario y filtro de lista (compatibles con la
# proyección futura del frontend).
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "active", "label": "Activo"},
    {"value": "inactive", "label": "Inactivo"},
    {"value": "archived", "label": "Archivado"},
]
_SEX_OPTIONS: list[dict[str, Any]] = [
    {"value": "female", "label": "Femenino"},
    {"value": "male", "label": "Masculino"},
    {"value": "other", "label": "Otro"},
    {"value": "unspecified", "label": "No especificado"},
]
_PREGNANCY_OPTIONS: list[dict[str, Any]] = [
    {"value": "none", "label": "Ninguno"},
    {"value": "pregnant", "label": "Embarazada"},
    {"value": "postpartum", "label": "Posparto"},
    {"value": "lactating", "label": "Lactancia"},
]

# Blobs ``json_schema_extra`` precomputados y tipados ``dict[str, Any]``: pasar un
# dict tipado evita el conflicto de invarianza de pyright con ``JsonValue`` cuando
# el literal anida listas de opciones.
_SEX_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _SEX_OPTIONS}
}
_STATUS_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _STATUS_OPTIONS}
}
_PREGNANCY_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _PREGNANCY_OPTIONS}
}
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


def _normalize_curp(value: Optional[str]) -> Optional[str]:
    """Normaliza CURP: recorta espacios y pasa a mayúsculas; vacío -> None."""
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def _validate_birth_date(value: Optional[date]) -> Optional[date]:
    if value is not None and value > date.today():
        raise ValueError("La fecha de nacimiento no puede ser futura")
    return value


class PatientCreate(ApiWriteSchema):
    """Alta administrativa de un paciente.

    ``record_number`` lo genera la base de datos; no se acepta desde el cliente.
    """

    full_name: str = Field(
        min_length=1,
        max_length=255,
        title="Nombre completo",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    birth_date: date = Field(
        title="Fecha de nacimiento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    sex: Sex = Field(
        title="Sexo",
        json_schema_extra=_SEX_FORM_UI,
    )
    phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    email: Optional[EmailStr] = Field(
        default=None,
        title="Correo electrónico",
        json_schema_extra={"ui": {"form": True, "widget": "email"}},
    )
    address: Optional[str] = Field(
        default=None,
        title="Dirección",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    curp: Optional[str] = Field(
        default=None,
        max_length=18,
        title="CURP",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    occupation: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Ocupación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    marital_status: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Estado civil",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Contacto de emergencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_relationship: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Parentesco del contacto",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono de emergencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    status: PatientStatus = Field(
        default=PatientStatus.ACTIVE,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    pregnancy_status: PregnancyStatus = Field(
        default=PregnancyStatus.NONE,
        title="Embarazo/lactancia",
        json_schema_extra=_PREGNANCY_FORM_UI,
    )
    pregnancy_since: Optional[date] = Field(
        default=None,
        title="Inicio del embarazo/estado",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    estimated_due_date: Optional[date] = Field(
        default=None,
        title="Fecha probable de parto",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )

    @field_validator("curp")
    @classmethod
    def normalize_curp(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_curp(value)

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, value: date) -> date:
        return _validate_birth_date(value)  # type: ignore[return-value]


class PatientUpdate(ApiPatchSchema):
    """Actualización parcial de un paciente (PATCH).

    ``record_number`` es inmutable y la auditoría no es editable desde el cliente.
    """

    full_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Nombre completo",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    birth_date: Optional[date] = Field(
        default=None,
        title="Fecha de nacimiento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    sex: Optional[Sex] = Field(
        default=None,
        title="Sexo",
        json_schema_extra=_SEX_FORM_UI,
    )
    phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    email: Optional[EmailStr] = Field(
        default=None,
        title="Correo electrónico",
        json_schema_extra={"ui": {"form": True, "widget": "email"}},
    )
    address: Optional[str] = Field(
        default=None,
        title="Dirección",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    curp: Optional[str] = Field(
        default=None,
        max_length=18,
        title="CURP",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    occupation: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Ocupación",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    marital_status: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Estado civil",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Contacto de emergencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_relationship: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Parentesco del contacto",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    emergency_contact_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono de emergencia",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    status: Optional[PatientStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )
    pregnancy_status: Optional[PregnancyStatus] = Field(
        default=None,
        title="Embarazo/lactancia",
        json_schema_extra=_PREGNANCY_FORM_UI,
    )
    pregnancy_since: Optional[date] = Field(
        default=None,
        title="Inicio del embarazo/estado",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    estimated_due_date: Optional[date] = Field(
        default=None,
        title="Fecha probable de parto",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )

    @field_validator("curp")
    @classmethod
    def normalize_curp(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_curp(value)

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, value: Optional[date]) -> Optional[date]:
        return _validate_birth_date(value)


class PatientRead(ApiReadSchema):
    """Ficha administrativa completa del paciente."""

    id: uuid.UUID
    record_number: int
    full_name: str
    birth_date: date
    sex: Sex
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    curp: Optional[str] = None
    occupation: Optional[str] = None
    marital_status: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    status: PatientStatus
    pregnancy_status: PregnancyStatus
    pregnancy_since: Optional[date] = None
    estimated_due_date: Optional[date] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PatientListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    record_number: int = Field(title="Expediente", json_schema_extra={"ui": {"list": True}})
    full_name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    birth_date: date = Field(
        title="Nacimiento", json_schema_extra={"ui": {"list": True}}
    )
    sex: Sex = Field(title="Sexo", json_schema_extra={"ui": {"list": True}})
    phone: Optional[str] = Field(
        default=None, title="Teléfono", json_schema_extra={"ui": {"list": True}}
    )
    # ``curp`` se incluye para habilitar la búsqueda libre declarada por el recurso
    # (el motor exige que los campos de búsqueda existan en el schema de listado).
    curp: Optional[str] = Field(default=None, title="CURP")
    status: PatientStatus = Field(title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI)
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
