"""Schemas de la búsqueda/emparejamiento de pacientes.

La tarjeta de selección expone SÓLO campos seguros para reconocer al paciente (nombre, año de
nacimiento, edad, sexo, teléfono enmascarado), NUNCA el expediente completo (sin CURP, correo,
dirección ni fecha de nacimiento exacta).
"""

import uuid
from typing import Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema


class PatientSearchCandidate(ApiReadSchema):
    """Candidato de coincidencia con campos seguros para una tarjeta de selección."""

    id: uuid.UUID = Field(title="Id del paciente")
    full_name: str = Field(title="Nombre")
    birth_year: int = Field(title="Año de nacimiento")
    age: int = Field(title="Edad")
    sex: str = Field(title="Sexo")
    phone_masked: Optional[str] = Field(
        default=None,
        title="Teléfono (enmascarado)",
        description="Sólo se revelan los últimos dígitos; el resto va enmascarado.",
    )
    score: int = Field(title="Puntaje de coincidencia")
    tier: str = Field(
        title="Nivel de confianza", description="exacto | fuerte | posible"
    )
    reasons: list[str] = Field(
        default_factory=list, title="Por qué coincide", description="Señales que coincidieron."
    )


class PatientSearchResponse(ApiReadSchema):
    """Resultado de la búsqueda: candidatos ordenados por confianza.

    ``has_strong_match`` resume si hay al menos una coincidencia exacta/fuerte: el flujo de alta
    lo usa para advertir de un posible DUPLICADO antes de crear un expediente nuevo.
    """

    count: int = Field(title="Número de candidatos devueltos")
    has_strong_match: bool = Field(
        title="¿Hay coincidencia fuerte?",
        description="Verdadero si algún candidato es de nivel exacto o fuerte (posible duplicado).",
    )
    candidates: list[PatientSearchCandidate] = Field(
        default_factory=list, title="Candidatos"
    )
