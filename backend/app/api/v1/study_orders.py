"""Órdenes de estudio/laboratorio del paciente.

CRUD bajo permisos ``study_orders:*``. Una orden pertenece al paciente y la emite
un médico; al resolverse puede enlazar el ``LabResult`` estructurado. La baja es
lógica. Los listados excluyen las órdenes eliminadas. Crear/editar una orden es una
ESCRITURA clínica: en el copiloto pasa por el protocolo de aprobación P1.
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
from backend.app.models.doctor import Doctor
from backend.app.models.patient import Patient
from backend.app.models.study_order import StudyOrder
from backend.app.resources.registry import STUDY_ORDERS
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.study_order import (
    StudyOrderCreate,
    StudyOrderListItem,
    StudyOrderRead,
    StudyOrderUpdate,
)
from backend.app.security.groups.study_orders import StudyOrderPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/study-orders", tags=["study-orders"])

_NOT_FOUND = "Orden de estudio no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_DOCTOR_NOT_FOUND = "Médico no encontrado"
_CONFLICT = "No se pudo guardar la orden de estudio"


def _get_active_order(session: Session, order_id: UUID) -> StudyOrder:
    order = get_or_404(session, StudyOrder, order_id, _NOT_FOUND)
    if order.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return order


def _ensure_active_patient(session: Session, patient_id: UUID) -> None:
    patient = get_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)


def _ensure_active_doctor(session: Session, doctor_id: UUID) -> None:
    doctor = get_or_404(session, Doctor, doctor_id, _DOCTOR_NOT_FOUND)
    if doctor.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _DOCTOR_NOT_FOUND)


@router.get("", response_model=OffsetPage[StudyOrderListItem])
def list_study_orders(
    session: SessionDep,
    query: Annotated[STUDY_ORDERS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: StudyOrderPermissions.READ.requiere,
) -> OffsetPage[StudyOrderListItem]:
    stmt = select(StudyOrder).where(StudyOrder.deleted_at.is_(None))
    return paginate_resource(STUDY_ORDERS, session, query, stmt=stmt)


@router.get("/{order_id}", response_model=StudyOrderRead)
def get_study_order(
    order_id: UUID,
    session: SessionDep,
    _: StudyOrderPermissions.READ.requiere,
) -> StudyOrderRead:
    return serialize(StudyOrderRead, _get_active_order(session, order_id))


@router.post("", response_model=StudyOrderRead, status_code=status.HTTP_201_CREATED)
def create_study_order(
    payload: StudyOrderCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: StudyOrderPermissions.CREATE.requiere,
) -> StudyOrderRead:
    _ensure_active_patient(session, payload.patient_id)
    _ensure_active_doctor(session, payload.ordered_by)
    order = create_entity(
        session,
        StudyOrder,
        payload,
        values={
            "ordered_at": payload.ordered_at or utc_now(),
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(StudyOrderRead, order)


@router.patch("/{order_id}", response_model=StudyOrderRead)
def update_study_order(
    order_id: UUID,
    payload: StudyOrderUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: StudyOrderPermissions.UPDATE.requiere,
) -> StudyOrderRead:
    order = _get_active_order(session, order_id)
    order = patch_entity(
        session,
        order,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(StudyOrderRead, order)


@router.delete("/{order_id}", response_model=StudyOrderRead)
def delete_study_order(
    order_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: StudyOrderPermissions.DELETE.requiere,
) -> StudyOrderRead:
    order = _get_active_order(session, order_id)
    order = soft_delete_entity(
        session,
        order,
        actor_id=current_user.id,
        already_deleted_message="La orden de estudio ya fue eliminada",
    )
    return serialize(StudyOrderRead, order)
