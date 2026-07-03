"""Schemas de la configuración del sistema (singleton).

Sin secretos en esta fase; cuando lleguen (correo/Resend), los campos secretos
existirán SOLO en el schema de actualización (write-only) y el de lectura expondrá
únicamente metadata segura (configured, huella, fechas). ``app_base_url`` y su
verificación son de SOLO LECTURA aquí: los escribe el flujo de verificación del
backend, no el formulario.
"""

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema


class SystemSettingsUpdate(ApiPatchSchema):
    """Campos EDITABLES de la política del sistema."""

    public_registration_enabled: Optional[bool] = Field(
        default=None,
        title="Registro público",
        description=(
            "Permitir el auto-registro por correo. Sólo tiene efecto si el "
            "despliegue lo permite (candado del entorno)."
        ),
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    institution_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=200,
        title="Nombre de la institución",
        description="Nombre del consultorio para membretes y encabezados.",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )


class SystemSettingsRead(ApiReadSchema):
    """Estado completo y SEGURO de la configuración del sistema."""

    id: uuid.UUID
    public_registration_enabled: bool
    # Política efectiva y candado del despliegue (solo lectura, para que la UI
    # explique por qué el switch puede no tener efecto).
    registration_allowed_by_deployment: bool
    public_registration_effective: bool
    app_base_url: Optional[str] = None
    app_base_url_verified_at: Optional[datetime] = None
    institution_name: Optional[str] = None
    environment: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    updated_by: Optional[uuid.UUID] = None


class SystemSettingsListItem(ApiReadSchema):
    """Versión de listado del singleton (una fila)."""

    id: uuid.UUID
    institution_name: Optional[str] = Field(
        default=None, title="Institución", json_schema_extra={"ui": {"list": True}}
    )
    public_registration_enabled: bool = Field(
        title="Registro público", json_schema_extra={"ui": {"list": True}}
    )
    app_base_url: Optional[str] = Field(
        default=None, title="Dominio", json_schema_extra={"ui": {"list": True}}
    )
    updated_at: Optional[datetime] = Field(
        default=None, title="Actualizado", json_schema_extra={"ui": {"list": True}}
    )
    # Presente para el contrato de orden del query.
    created_at: datetime = Field(title="Creado")


class SetupChecklistItemRead(ApiReadSchema):
    """Ítem del checklist de puesta en marcha (estado derivado)."""

    key: str
    title: str
    status: Literal["complete", "pending", "not_applicable"]
    detail: str


class SetupChecklistRead(ApiReadSchema):
    """Checklist derivado + si el administrador lo descartó."""

    items: list[SetupChecklistItemRead]
    dismissed: bool
    pending_count: int
