"""Resultados de escalas clínicas persistidos: CRUD bajo ``scale_results:*`` (ESCALAS fase 2).

Persistir un resultado de escala es una ESCRITURA clínica: en el copiloto pasa por el
protocolo de aprobación P1 (el médico aprueba el borrador). El servidor NO confía en un
puntaje provisto por el cliente: RE-COMPUTA desde ``scale_id`` + ``inputs`` con el motor
determinista de la fase 1 (``clinical_scales``) y guarda el valor autoritativo. Si faltan o
son inválidos los insumos, responde 422 nombrando el campo (igual que la fase 1). La baja es
lógica; los listados/detalles excluyen los eliminados.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_active_or_404,
    paginate_resource,
    serialize,
    soft_delete_entity,
    update_entity_values,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.clinical_scales import (
    ScaleComputeResult,
    ScaleValidationError,
    compute_scale,
    get_scale,
)
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.patient import Patient
from backend.app.models.scale_result import ScaleResult
from backend.app.resources.registry import SCALE_RESULTS
from backend.app.schemas.error import ErrorItem
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.scale_result import (
    ScaleResultCreate,
    ScaleResultListItem,
    ScaleResultRead,
    ScaleResultUpdate,
)
from backend.app.security.groups.scale_results import ScaleResultPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/scale-results", tags=["scale-results"])

_NOT_FOUND = "Resultado de escala no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar el resultado de la escala"
_INVALID = "Insumos de la escala faltantes o inválidos."


def _recompute(scale_id: str, raw_inputs: dict) -> ScaleComputeResult:
    """Recalcula la escala desde el motor determinista (fuente de verdad del puntaje).

    Escala desconocida -> 422 nombrando ``scale_id``; insumos faltantes/ inválidos -> 422
    nombrando cada campo. Nunca se confía en un puntaje provisto por el cliente.
    """
    scale = get_scale(scale_id)
    if scale is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "scale_inputs_invalid",
            _INVALID,
            errors=[ErrorItem(field="scale_id", message=f"Escala desconocida: {scale_id}.")],
        )
    try:
        return compute_scale(scale, raw_inputs)
    except ScaleValidationError as exc:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "scale_inputs_invalid",
            _INVALID,
            errors=exc.errors,
        )


@router.get("", response_model=OffsetPage[ScaleResultListItem])
def list_scale_results(
    session: SessionDep,
    query: Annotated[SCALE_RESULTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ScaleResultPermissions.READ.requiere,
) -> OffsetPage[ScaleResultListItem]:
    # Scope base: solo resultados vigentes. El caso principal: ?patient_id=<id> + scale_id.
    stmt = select(ScaleResult).where(ScaleResult.deleted_at.is_(None))
    return paginate_resource(SCALE_RESULTS, session, query, stmt=stmt)


@router.get("/{result_id}", response_model=ScaleResultRead)
def get_scale_result(
    result_id: UUID,
    session: SessionDep,
    _: ScaleResultPermissions.READ.requiere,
) -> ScaleResultRead:
    return serialize(ScaleResultRead, get_active_or_404(session, ScaleResult, result_id, _NOT_FOUND))


@router.post("", response_model=ScaleResultRead, status_code=status.HTTP_201_CREATED)
def create_scale_result(
    payload: ScaleResultCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ScaleResultPermissions.CREATE.requiere,
) -> ScaleResultRead:
    get_active_or_404(session, Patient, payload.patient_id, _PATIENT_NOT_FOUND)
    if payload.consultation_id is not None:
        get_active_or_404(session, Consultation, payload.consultation_id, _CONSULTATION_NOT_FOUND)

    # Re-cómputo autoritativo: el puntaje guardado SIEMPRE proviene del motor determinista.
    result = _recompute(payload.scale_id, payload.inputs)

    entity = create_entity(
        session,
        ScaleResult,
        payload,
        values={
            "score": result.score,
            "interpretation_label": result.interpretation_label,
            "source": " | ".join(result.sources),
            "computed_at": utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(ScaleResultRead, entity)


@router.patch("/{result_id}", response_model=ScaleResultRead)
def update_scale_result(
    result_id: UUID,
    payload: ScaleResultUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ScaleResultPermissions.UPDATE.requiere,
) -> ScaleResultRead:
    entity = get_active_or_404(session, ScaleResult, result_id, _NOT_FOUND)
    data = payload.model_dump(exclude_unset=True)

    if "consultation_id" in data and data["consultation_id"] is not None:
        get_active_or_404(session, Consultation, data["consultation_id"], _CONSULTATION_NOT_FOUND)

    values: dict = {}
    if "consultation_id" in data:
        values["consultation_id"] = data["consultation_id"]
    # Si llegan nuevos insumos, se RECOMPUTA desde la escala guardada (no se confía en
    # ningún puntaje externo). La identidad de la escala no cambia en una edición.
    if data.get("inputs") is not None:
        result = _recompute(entity.scale_id, data["inputs"])
        values.update(
            {
                "inputs": data["inputs"],
                "score": result.score,
                "interpretation_label": result.interpretation_label,
                "source": " | ".join(result.sources),
                "computed_at": utc_now(),
            }
        )

    entity = update_entity_values(
        session,
        entity,
        values,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ScaleResultRead, entity)


@router.delete("/{result_id}", response_model=ScaleResultRead)
def delete_scale_result(
    result_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ScaleResultPermissions.DELETE.requiere,
) -> ScaleResultRead:
    entity = get_active_or_404(session, ScaleResult, result_id, _NOT_FOUND)
    entity = soft_delete_entity(
        session,
        entity,
        actor_id=current_user.id,
        already_deleted_message="El resultado de la escala ya fue eliminado",
    )
    return serialize(ScaleResultRead, entity)
