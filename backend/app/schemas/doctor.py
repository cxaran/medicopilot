import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import EmailStr, Field

from backend.app.models.enums import RecordStatus
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones del estado operativo del médico, reutilizadas en formulario y filtro de lista.
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "active", "label": "Activo"},
    {"value": "inactive", "label": "Inactivo"},
    {"value": "suspended", "label": "Suspendido"},
]

# Blobs ``json_schema_extra`` precomputados y tipados ``dict[str, Any]`` (evitan el
# conflicto de invarianza de pyright con ``JsonValue`` al anidar listas de opciones).
_STATUS_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _STATUS_OPTIONS}
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


class DoctorCreate(ApiWriteSchema):
    """Creación administrativa de un perfil médico."""

    user_id: uuid.UUID = Field(
        title="Usuario",
        description="Usuario al que pertenece este perfil médico (uno por usuario).",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_name: str = Field(
        min_length=1,
        max_length=255,
        title="Nombre profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_title: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Título profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_license_number: str = Field(
        min_length=1,
        max_length=80,
        title="Cédula profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    specialty: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    specialty_license_number: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Cédula de especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_email: Optional[EmailStr] = Field(
        default=None,
        title="Correo profesional",
        json_schema_extra={"ui": {"form": True, "widget": "email"}},
    )
    clinic_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Consultorio o clínica",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    office_address: Optional[str] = Field(
        default=None,
        title="Dirección del consultorio",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    office_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono del consultorio",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    prescription_footer: Optional[str] = Field(
        default=None,
        title="Pie de receta",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    status: RecordStatus = Field(
        default=RecordStatus.ACTIVE,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class DoctorUpdate(ApiPatchSchema):
    """Actualización parcial de un perfil médico (PATCH).

    ``user_id`` es inmutable tras la creación: el vínculo con el usuario no se
    reasigna desde aquí.
    """

    professional_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        title="Nombre profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_title: Optional[str] = Field(
        default=None,
        max_length=120,
        title="Título profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_license_number: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=80,
        title="Cédula profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    specialty: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    specialty_license_number: Optional[str] = Field(
        default=None,
        max_length=80,
        title="Cédula de especialidad",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono profesional",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    professional_email: Optional[EmailStr] = Field(
        default=None,
        title="Correo profesional",
        json_schema_extra={"ui": {"form": True, "widget": "email"}},
    )
    clinic_name: Optional[str] = Field(
        default=None,
        max_length=255,
        title="Consultorio o clínica",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    office_address: Optional[str] = Field(
        default=None,
        title="Dirección del consultorio",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    office_phone: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Teléfono del consultorio",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    prescription_footer: Optional[str] = Field(
        default=None,
        title="Pie de receta",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    status: Optional[RecordStatus] = Field(
        default=None,
        title="Estado",
        json_schema_extra=_STATUS_FORM_UI,
    )


class DoctorRead(ApiReadSchema):
    """Representación completa de un perfil médico."""

    id: uuid.UUID
    user_id: uuid.UUID
    professional_name: str
    professional_title: Optional[str] = None
    professional_license_number: str
    specialty: Optional[str] = None
    specialty_license_number: Optional[str] = None
    professional_phone: Optional[str] = None
    professional_email: Optional[str] = None
    clinic_name: Optional[str] = None
    office_address: Optional[str] = None
    office_phone: Optional[str] = None
    prescription_footer: Optional[str] = None
    status: RecordStatus
    created_at: datetime
    updated_at: Optional[datetime] = None


class DoctorListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``."""

    id: uuid.UUID
    professional_name: str = Field(
        title="Nombre profesional", json_schema_extra={"ui": {"list": True}}
    )
    professional_license_number: str = Field(
        title="Cédula", json_schema_extra={"ui": {"list": True}}
    )
    specialty: Optional[str] = Field(
        default=None, title="Especialidad", json_schema_extra={"ui": {"list": True}}
    )
    status: RecordStatus = Field(
        title="Estado",
        json_schema_extra=_STATUS_LIST_FILTER_UI,
    )
    created_at: datetime = Field(title="Creado", json_schema_extra={"ui": {"list": True}})
