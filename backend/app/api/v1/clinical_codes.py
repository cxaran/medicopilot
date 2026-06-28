"""Códigos clínicos de apoyo: CRUD bajo ``clinical_codes:*`` (G5 fase 4).

Catálogo pragmático CIE-10/LOINC/ATC para asistir la codificación. El listado admite
``?system=...&q=...`` (búsqueda por código o término); un término desconocido no coincide
y devuelve vacío — nunca se inventa un código. La baja es lógica; los listados/detalles
excluyen los eliminados.
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
from backend.app.models.clinical_code import ClinicalCode
from backend.app.resources.registry import CLINICAL_CODES
from backend.app.schemas.clinical_code import (
    ClinicalCodeCreate,
    ClinicalCodeListItem,
    ClinicalCodeRead,
    ClinicalCodeUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.clinical_codes import ClinicalCodePermissions

router = APIRouter(prefix="/clinical-codes", tags=["clinical_codes"])

_NOT_FOUND = "Código clínico no encontrado"
_CONFLICT = "Ya existe un código con ese sistema y código"


def _get_active_code(session: Session, code_id: UUID) -> ClinicalCode:
    code = get_or_404(session, ClinicalCode, code_id, _NOT_FOUND)
    if code.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return code


@router.get("", response_model=OffsetPage[ClinicalCodeListItem])
def list_clinical_codes(
    session: SessionDep,
    query: Annotated[CLINICAL_CODES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ClinicalCodePermissions.READ.requiere,
) -> OffsetPage[ClinicalCodeListItem]:
    stmt = select(ClinicalCode).where(ClinicalCode.deleted_at.is_(None))
    return paginate_resource(CLINICAL_CODES, session, query, stmt=stmt)


@router.get("/{code_id}", response_model=ClinicalCodeRead)
def get_clinical_code(
    code_id: UUID,
    session: SessionDep,
    _: ClinicalCodePermissions.READ.requiere,
) -> ClinicalCodeRead:
    return serialize(ClinicalCodeRead, _get_active_code(session, code_id))


@router.post("", response_model=ClinicalCodeRead, status_code=status.HTTP_201_CREATED)
def create_clinical_code(
    payload: ClinicalCodeCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalCodePermissions.CREATE.requiere,
) -> ClinicalCodeRead:
    code = create_entity(
        session,
        ClinicalCode,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalCodeRead, code)


@router.patch("/{code_id}", response_model=ClinicalCodeRead)
def update_clinical_code(
    code_id: UUID,
    payload: ClinicalCodeUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalCodePermissions.UPDATE.requiere,
) -> ClinicalCodeRead:
    code = _get_active_code(session, code_id)
    code = patch_entity(
        session,
        code,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalCodeRead, code)


@router.delete("/{code_id}", response_model=ClinicalCodeRead)
def delete_clinical_code(
    code_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalCodePermissions.DELETE.requiere,
) -> ClinicalCodeRead:
    code = _get_active_code(session, code_id)
    code = soft_delete_entity(
        session,
        code,
        actor_id=current_user.id,
        already_deleted_message="El código ya fue eliminado",
    )
    return serialize(ClinicalCodeRead, code)
