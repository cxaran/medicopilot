"""Schemas de las verificaciones de calidad/seguridad clínica (sólo lectura).

La verificación es una ESCRITURA-CERO: recibe un objetivo (consulta, receta o paciente),
ejecuta reglas deterministas sobre los datos existentes y devuelve banderas para REVISIÓN del
médico. No persiste nada ni muta el expediente.
"""

import uuid
from typing import Literal, Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema

TargetType = Literal["consultation", "prescription", "patient"]


class QualityCheckRequest(ApiWriteSchema):
    """Objetivo de la verificación. ``extra=forbid``: no se aceptan campos no declarados.

    - ``consultation``: revisa la nota SOAP (si está en borrador), sus signos vitales, sus
      resultados de laboratorio y los medicamentos de sus recetas.
    - ``prescription``: revisa los medicamentos de esa receta (dosis/frecuencia).
    - ``patient``: revisa los resultados de laboratorio del paciente (valores no físicos).
    """

    target_type: TargetType = Field(
        title="Tipo de objetivo",
        description="Qué se verifica: consultation, prescription o patient.",
    )
    target_id: uuid.UUID = Field(
        title="Id del objetivo",
        description="Id (UUID) de la consulta, receta o paciente a verificar.",
    )


class QualityFlagRead(ApiReadSchema):
    """Una posible incidencia detectada, para que el médico la revise (no es una corrección)."""

    rule_id: str = Field(title="Regla", description="Identificador de la regla que disparó.")
    severity: Literal["info", "warning"] = Field(
        title="Severidad", description="info o warning; ninguna implica acción automática."
    )
    message: str = Field(
        title="Mensaje",
        validation_alias="message_es",
        serialization_alias="message",
        description="Descripción en español del posible problema.",
    )
    source_ref: str = Field(
        title="Origen",
        description="Registro/campo concreto que disparó la bandera (modelo:id.campo).",
    )
    threshold_cited: Optional[str] = Field(
        default=None,
        title="Umbral/criterio citado",
        description="Umbral o criterio usado, para que el médico lo verifique.",
    )


class QualityCheckResponse(ApiReadSchema):
    """Resultado de la verificación: el objetivo evaluado y las banderas encontradas.

    Si ``flags`` está vacío, no se detectaron incidencias con las reglas vigentes (no es una
    garantía de ausencia de problemas: sólo de que estas reglas no marcaron nada).
    """

    target_type: TargetType
    target_id: uuid.UUID
    flags: list[QualityFlagRead]
    flag_count: int = Field(description="Número de banderas devueltas.")
