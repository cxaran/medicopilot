"""Renglones de medicamento de una receta.

Subrecurso de la receta: hereda su grupo de permisos (no existe
``prescription_items:*``). Leer un renglón exige ``prescriptions:read``;
crearlo, editarlo o eliminarlo exige ``prescriptions:update``.

Sólo se pueden capturar o modificar mientras la receta padre esté en ``draft``. La
``position`` la asigna el servidor de forma consecutiva (se permiten huecos al
eliminar): se toma la fila de la receta con FOR UPDATE antes de calcular el
siguiente valor, evitando colisiones entre altas concurrentes.

Concurrencia: el orden de bloqueo es consulta → receta → renglón, serializándose
sobre la misma fila de consulta que ``consultations.finalize``. Las lecturas no
toman bloqueo.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import Session, select
from sqlalchemy import func

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
from backend.app.models.enums import PrescriptionStatus
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.resources.registry import PRESCRIPTION_ITEMS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.prescription import (
    PrescriptionItemCreate,
    PrescriptionItemListItem,
    PrescriptionItemRead,
    PrescriptionItemUpdate,
)
from backend.app.security.groups.prescriptions import PrescriptionPermissions

router = APIRouter(prefix="/prescription-items", tags=["prescription-items"])

_NOT_FOUND = "Medicamento de receta no encontrado"
_PRESCRIPTION_NOT_FOUND = "Receta no encontrada"
_CONFLICT = "No se pudo guardar el medicamento de receta"
_NOT_DRAFT = "Sólo se pueden capturar o modificar medicamentos en una receta en borrador"


def _lock_consultation(session: Session, consultation_id: UUID) -> Consultation | None:
    return session.exec(
        select(Consultation).where(Consultation.id == consultation_id).with_for_update()
    ).first()


def _lock_prescription(session: Session, prescription_id: UUID) -> Prescription | None:
    return session.exec(
        select(Prescription).where(Prescription.id == prescription_id).with_for_update()
    ).first()


def _lock_writable_prescription(
    session: Session, prescription_id: UUID
) -> Prescription:
    """Carga la receta para mutar renglones: bloqueada en orden consulta → receta.

    Lee primero la receta sin bloqueo para obtener el ``consultation_id`` (inmutable),
    respeta el orden de bloqueo y revalida estados bajo el lock. La receta y su
    consulta deben existir, no estar eliminadas y la receta debe estar en borrador."""
    peek = get_or_404(session, Prescription, prescription_id, _PRESCRIPTION_NOT_FOUND)
    if peek.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _PRESCRIPTION_NOT_FOUND
        )
    consultation = _lock_consultation(session, peek.consultation_id)
    prescription = _lock_prescription(session, prescription_id)
    if (
        prescription is None
        or prescription.deleted_at is not None
        or consultation is None
        or consultation.deleted_at is not None
    ):
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _PRESCRIPTION_NOT_FOUND
        )
    if prescription.status != PrescriptionStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _NOT_DRAFT)
    return prescription


def _load_active_item(
    session: Session, item_id: UUID, *, lock_parents: bool = False
) -> PrescriptionItem:
    """Carga un renglón disponible: ni él ni su receta/consulta padre eliminados (-> 404).

    ``lock_parents`` toma las filas de consulta y receta con FOR UPDATE (orden
    consulta → receta) y exige que la receta siga en borrador; las lecturas no."""
    item = get_or_404(session, PrescriptionItem, item_id, _NOT_FOUND)
    if item.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    peek = session.get(Prescription, item.prescription_id)
    if peek is None or peek.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    if lock_parents:
        consultation = _lock_consultation(session, peek.consultation_id)
        prescription = _lock_prescription(session, item.prescription_id)
    else:
        consultation = session.get(Consultation, peek.consultation_id)
        prescription = peek
    if (
        prescription is None
        or prescription.deleted_at is not None
        or consultation is None
        or consultation.deleted_at is not None
    ):
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    if lock_parents and prescription.status != PrescriptionStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _NOT_DRAFT)
    return item


def _next_position(session: Session, prescription_id: UUID) -> int:
    """Siguiente posición consecutiva (huecos permitidos), bajo el lock de la receta.

    Cuenta también los renglones eliminados para no reutilizar una posición liberada,
    coherente con la unicidad ``(prescription_id, position)``."""
    current_max = session.exec(
        select(func.max(PrescriptionItem.position)).where(
            PrescriptionItem.prescription_id == prescription_id
        )
    ).first()
    return (current_max or 0) + 1


@router.get("", response_model=OffsetPage[PrescriptionItemListItem])
def list_prescription_items(
    session: SessionDep,
    query: Annotated[PRESCRIPTION_ITEMS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PrescriptionPermissions.READ.requiere,
) -> OffsetPage[PrescriptionItemListItem]:
    # Scope base: renglones no eliminados cuya receta padre tampoco lo esté. El caso
    # principal se resuelve con ?prescription_id=<id>.
    stmt = (
        select(PrescriptionItem)
        .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
        .where(
            PrescriptionItem.deleted_at.is_(None), Prescription.deleted_at.is_(None)
        )
    )
    return paginate_resource(PRESCRIPTION_ITEMS, session, query, stmt=stmt)


@router.get("/{item_id}", response_model=PrescriptionItemRead)
def get_prescription_item(
    item_id: UUID,
    session: SessionDep,
    _: PrescriptionPermissions.READ.requiere,
) -> PrescriptionItemRead:
    item = _load_active_item(session, item_id)
    return serialize(PrescriptionItemRead, item)


@router.post(
    "", response_model=PrescriptionItemRead, status_code=status.HTTP_201_CREATED
)
def create_prescription_item(
    payload: PrescriptionItemCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.UPDATE.requiere,
) -> PrescriptionItemRead:
    _lock_writable_prescription(session, payload.prescription_id)
    item = create_entity(
        session,
        PrescriptionItem,
        payload,
        values={
            "position": _next_position(session, payload.prescription_id),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(PrescriptionItemRead, item)


@router.patch("/{item_id}", response_model=PrescriptionItemRead)
def update_prescription_item(
    item_id: UUID,
    payload: PrescriptionItemUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.UPDATE.requiere,
) -> PrescriptionItemRead:
    item = _load_active_item(session, item_id, lock_parents=True)
    item = patch_entity(
        session,
        item,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PrescriptionItemRead, item)


@router.delete("/{item_id}", response_model=PrescriptionItemRead)
def delete_prescription_item(
    item_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PrescriptionPermissions.UPDATE.requiere,
) -> PrescriptionItemRead:
    item = _load_active_item(session, item_id, lock_parents=True)
    item = soft_delete_entity(
        session,
        item,
        actor_id=current_user.id,
        already_deleted_message="El medicamento de receta ya fue eliminado",
    )
    return serialize(PrescriptionItemRead, item)
