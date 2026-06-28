import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from backend.app.models.enums import AgentMemoryKind
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


class AgentMemoryCreate(ApiWriteSchema):
    """Alta de una memoria del agente del usuario autenticado.

    ``content`` es el contenido EN CLARO (entrada): se cifra antes de guardar. La
    auditoría y el soft-delete los gobierna el servidor.
    """

    title: str = Field(min_length=1, max_length=200, title="Título")
    content: str = Field(min_length=1, title="Contenido", description="Contenido de la memoria (puede ser clínico sensible).")
    kind: AgentMemoryKind = Field(default=AgentMemoryKind.NOTA, title="Tipo")
    patient_id: Optional[uuid.UUID] = Field(default=None, title="Paciente relacionado")
    consultation_id: Optional[uuid.UUID] = Field(default=None, title="Consulta relacionada")


class AgentMemoryUpdate(ApiPatchSchema):
    """Actualización parcial de una memoria (owner-only).

    Solo se aplican los campos enviados. ``content`` (si viene) reemplaza y recifra el
    contenido. ``user_id`` es inmutable (no se declara).
    """

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    content: Optional[str] = Field(default=None, min_length=1)
    kind: Optional[AgentMemoryKind] = Field(default=None)
    patient_id: Optional[uuid.UUID] = Field(default=None)
    consultation_id: Optional[uuid.UUID] = Field(default=None)


class AgentMemoryRead(ApiReadSchema):
    """Representación de una memoria para su DUEÑO: incluye el ``content`` descifrado.

    A diferencia de las API keys, es la propia memoria del usuario, así que el dueño sí
    recibe el contenido en claro. NUNCA se devuelve a otro usuario (las rutas son
    owner-only y filtran por dueño).
    """

    id: uuid.UUID
    title: str
    content: str
    kind: AgentMemoryKind
    patient_id: Optional[uuid.UUID] = None
    consultation_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
