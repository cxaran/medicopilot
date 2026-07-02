"""Escalas clínicas validadas: listar y computar bajo ``clinical_scales:read``.

EPIC ESCALAS fase 1. Cómputo determinista y SIN ESTADO (no persiste; eso es fase 2). Las
escalas son lógica clínica fija definida en código (``backend.app.clinical_scales``). Toda
salida es APOYO A LA DECISIÓN que el médico confirma; no es un diagnóstico.

Validación estricta: si falta o es inválido un insumo, se responde 422 nombrando el campo.
El copiloto debe PREGUNTAR el dato faltante; nunca asume un valor por defecto ni produce
puntajes parciales.
"""

from fastapi import APIRouter, status

from backend.app.api.resource_actions import api_error
from backend.app.clinical_scales import (
    ScaleValidationError,
    compute_scale,
    get_scale,
    list_scales,
)
from backend.app.schemas.clinical_scale import (
    ScaleComputeRequest,
    ScaleComputeResponse,
    ScaleDefinitionRead,
    ScaleInputSpecRead,
)
from backend.app.security.groups.clinical_scales import ClinicalScalePermissions

router = APIRouter(prefix="/clinical-scales", tags=["clinical_scales"])

_NOT_FOUND = "Escala clínica no encontrada"


@router.get("", response_model=list[ScaleDefinitionRead])
def list_clinical_scales(
    _: ClinicalScalePermissions.READ.requiere,
) -> list[ScaleDefinitionRead]:
    """Lista las escalas registradas con sus insumos requeridos y fuente citada."""
    return [
        ScaleDefinitionRead(
            id=scale.id,
            name=scale.name,
            description=scale.description,
            source=scale.source,
            inputs=[
                ScaleInputSpecRead(
                    key=spec.key,
                    label=spec.label,
                    type=spec.type,
                    description=spec.description,
                    allowed_values=list(spec.allowed_values) if spec.allowed_values else None,
                    min=spec.min,
                    max=spec.max,
                )
                for spec in scale.inputs
            ],
        )
        for scale in list_scales()
    ]


@router.post("/{scale_id}/compute", response_model=ScaleComputeResponse)
def compute_clinical_scale(
    scale_id: str,
    payload: ScaleComputeRequest,
    _: ClinicalScalePermissions.READ.requiere,
) -> ScaleComputeResponse:
    """Computa el puntaje de una escala. 422 (nombrando campos) si faltan/invalidan insumos."""
    scale = get_scale(scale_id)
    if scale is None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)

    try:
        result = compute_scale(scale, payload.inputs)
    except ScaleValidationError as exc:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "scale_inputs_invalid",
            "Insumos de la escala faltantes o inválidos.",
            errors=exc.errors,
        )

    return ScaleComputeResponse(
        scale_id=scale.id,
        score=result.score,
        interpretation_label=result.interpretation_label,
        interpretation_detail=result.interpretation_detail,
        sources=result.sources,
    )
