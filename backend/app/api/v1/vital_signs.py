"""Signos vitales medidos durante una consulta médica.

La consulta padre gobierna la mutabilidad: mientras esté en ``draft`` cualquier
usuario con permiso puede crear, editar o eliminar mediciones; al finalizar la
consulta quedan clínicamente selladas (sólo lectura). No hay endpoint de
finalización propio: el sellado se hereda del estado de la consulta.

El paciente y el médico se derivan de la consulta. El IMC (``bmi``) se calcula en
la lectura, no se persiste ni se acepta como entrada.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.enums import ConsultationStatus
from backend.app.models.vital_sign import VitalSign
from backend.app.resources.registry import VITAL_SIGNS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.vital_sign import (
    VitalSignCreate,
    VitalSignListItem,
    VitalSignRead,
    VitalSignUpdate,
)
from backend.app.security.groups.vital_signs import VitalSignPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/vital-signs", tags=["vital-signs"])

_NOT_FOUND = "Signo vital no encontrado"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONFLICT = "No se pudo guardar el signo vital"
_SEALED = "La consulta está finalizada: los signos vitales quedaron sellados"


def _get_writable_consultation(session: Session, consultation_id: UUID) -> Consultation:
    """Consulta destino de una creación: debe existir, no estar eliminada ni finalizada."""
    consultation = get_or_404(
        session, Consultation, consultation_id, _CONSULTATION_NOT_FOUND
    )
    if consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)
    return consultation


def _load_active_vital_sign(
    session: Session, vital_sign_id: UUID
) -> tuple[VitalSign, Consultation]:
    """Carga una medición disponible: ni ella ni su consulta padre eliminadas (-> 404)."""
    vital_sign = get_or_404(session, VitalSign, vital_sign_id, _NOT_FOUND)
    if vital_sign.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    consultation = get_or_404(
        session, Consultation, vital_sign.consultation_id, _NOT_FOUND
    )
    if consultation.deleted_at is not None:
        # La consulta padre eliminada hace que sus signos no estén disponibles.
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return vital_sign, consultation


def _require_editable_parent(consultation: Consultation) -> None:
    if consultation.status != ConsultationStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _SEALED)


@router.get("", response_model=OffsetPage[VitalSignListItem])
def list_vital_signs(
    session: SessionDep,
    query: Annotated[VITAL_SIGNS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: VitalSignPermissions.READ.requiere,
) -> OffsetPage[VitalSignListItem]:
    # Scope base: mediciones no eliminadas cuya consulta padre tampoco lo esté. El
    # caso principal se resuelve con ?consultation_id=<id>.
    stmt = (
        select(VitalSign)
        .join(Consultation, Consultation.id == VitalSign.consultation_id)
        .where(VitalSign.deleted_at.is_(None), Consultation.deleted_at.is_(None))
    )
    return paginate_resource(VITAL_SIGNS, session, query, stmt=stmt)


@router.get("/{vital_sign_id}", response_model=VitalSignRead)
def get_vital_sign(
    vital_sign_id: UUID,
    session: SessionDep,
    _: VitalSignPermissions.READ.requiere,
) -> VitalSignRead:
    vital_sign, _consultation = _load_active_vital_sign(session, vital_sign_id)
    return serialize(VitalSignRead, vital_sign)


@router.post("", response_model=VitalSignRead, status_code=status.HTTP_201_CREATED)
def create_vital_sign(
    payload: VitalSignCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: VitalSignPermissions.CREATE.requiere,
) -> VitalSignRead:
    _get_writable_consultation(session, payload.consultation_id)
    vital_sign = create_entity(
        session,
        VitalSign,
        payload,
        values={
            "measured_at": payload.measured_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(VitalSignRead, vital_sign)


@router.patch("/{vital_sign_id}", response_model=VitalSignRead)
def update_vital_sign(
    vital_sign_id: UUID,
    payload: VitalSignUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: VitalSignPermissions.UPDATE.requiere,
) -> VitalSignRead:
    vital_sign, consultation = _load_active_vital_sign(session, vital_sign_id)
    _require_editable_parent(consultation)
    vital_sign = patch_entity(
        session,
        vital_sign,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(VitalSignRead, vital_sign)


@router.delete("/{vital_sign_id}", response_model=VitalSignRead)
def delete_vital_sign(
    vital_sign_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: VitalSignPermissions.DELETE.requiere,
) -> VitalSignRead:
    vital_sign, consultation = _load_active_vital_sign(session, vital_sign_id)
    _require_editable_parent(consultation)
    vital_sign = soft_delete_entity(
        session,
        vital_sign,
        actor_id=current_user.id,
        already_deleted_message="El signo vital ya fue eliminado",
    )
    return serialize(VitalSignRead, vital_sign)
