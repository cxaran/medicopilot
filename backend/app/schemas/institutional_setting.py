"""Schemas de configuración institucional (G5 fase 3).

El ``value`` es un objeto JSON cuya forma esperada depende de la ``category``; la
validación fina por categoría vive en la capa de servicio (p. ej. la resolución del
umbral de signos vitales). Aquí sólo se exige que sea un objeto JSON.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import Field, field_validator

from backend.app.models.enums import SettingCategory
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


def _ensure_object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("value debe ser un objeto JSON.")
    return value


class InstitutionalSettingCreate(ApiWriteSchema):
    """Alta de una configuración institucional."""

    key: str = Field(min_length=1, max_length=120)
    category: SettingCategory
    value: dict[str, Any] = Field(description="Valor JSON; su forma depende de la categoría.")
    description: str = Field(min_length=1, max_length=2000)

    @field_validator("value")
    @classmethod
    def _value_is_object(cls, value: Any) -> dict[str, Any]:
        return _ensure_object(value)


class InstitutionalSettingUpdate(ApiPatchSchema):
    """Actualización parcial de una configuración institucional."""

    key: Optional[str] = Field(default=None, min_length=1, max_length=120)
    category: Optional[SettingCategory] = None
    value: Optional[dict[str, Any]] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=2000)

    @field_validator("value")
    @classmethod
    def _value_is_object(cls, value: Any) -> Any:
        if value is None:
            return value
        return _ensure_object(value)


class InstitutionalSettingRead(ApiReadSchema):
    """Representación pública de una configuración institucional."""

    id: uuid.UUID
    key: str
    category: SettingCategory
    value: dict[str, Any]
    description: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class InstitutionalSettingListItem(ApiReadSchema):
    """Versión para listados (declara todos los campos filtrables/buscables)."""

    id: uuid.UUID
    key: str
    category: SettingCategory
    value: dict[str, Any]
    description: str
    created_at: datetime
    updated_at: Optional[datetime] = None
