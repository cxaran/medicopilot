from datetime import datetime
from typing import Optional

from pydantic import Field, field_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema


class AgentPersonaUpdate(ApiPatchSchema):
    """Actualización (upsert) de la persona del copiloto del usuario autenticado.

    Todos los campos son opcionales: se aplican solo los enviados. Es config NO
    secreta (tono/especialidad/idioma/estilo); la capa de seguridad clínica es fija
    y NO se declara aquí (la posee el código).
    """

    tone: Optional[str] = Field(default=None, max_length=500, title="Tono")
    specialty_focus: Optional[str] = Field(default=None, max_length=500, title="Enfoque de especialidad")
    language_locale: Optional[str] = Field(default=None, max_length=100, title="Idioma / locale")
    consultation_style: Optional[str] = Field(default=None, max_length=1000, title="Estilo de consulta")


    preferred_provider: Optional[str] = Field(
        default=None,
        max_length=40,
        title="Proveedor preferido",
        description="Tu proveedor de IA por defecto (tus credenciales, tu costo).",
    )
    preferred_model: Optional[str] = Field(
        default=None,
        max_length=160,
        title="Modelo preferido",
    )

    @field_validator("preferred_provider")
    @classmethod
    def _validate_preferred_provider(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        from backend.app.models.enums import AiProvider

        if value not in {provider.value for provider in AiProvider}:
            raise ValueError("Proveedor de IA desconocido.")
        return value


class AgentPersonaRead(ApiReadSchema):
    """Persona del copiloto para su dueño (config en claro, owner-only)."""

    tone: Optional[str] = None
    specialty_focus: Optional[str] = None
    language_locale: Optional[str] = None
    consultation_style: Optional[str] = None
    preferred_provider: Optional[str] = None
    preferred_model: Optional[str] = None
    updated_at: Optional[datetime] = None
