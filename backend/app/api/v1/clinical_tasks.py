"""Tareas clínicas de seguimiento.

CRUD bajo permisos ``clinical_tasks:*``. Una tarea pertenece a un usuario
(``owner_id``; por defecto, el usuario actual) y opcionalmente refiere a un
paciente. La baja es lógica. Los listados excluyen las tareas eliminadas. Crear
una tarea es una ESCRITURA: en el copiloto pasa por el protocolo de aprobación P1.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    create_entity,
    get_active_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.clinical_task import ClinicalTask
from backend.app.models.patient import Patient
from backend.app.resources.registry import CLINICAL_TASKS
from backend.app.schemas.clinical_task import (
    ClinicalTaskCreate,
    ClinicalTaskListItem,
    ClinicalTaskRead,
    ClinicalTaskUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.clinical_tasks import ClinicalTaskPermissions

router = APIRouter(prefix="/clinical-tasks", tags=["clinical-tasks"])

_NOT_FOUND = "Tarea clínica no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar la tarea clínica"


@router.get("", response_model=OffsetPage[ClinicalTaskListItem])
def list_clinical_tasks(
    session: SessionDep,
    query: Annotated[CLINICAL_TASKS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ClinicalTaskPermissions.READ.requiere,
) -> OffsetPage[ClinicalTaskListItem]:
    # Scope base: solo tareas vigentes. Se consultan por responsable (owner_id),
    # paciente, estado/prioridad y rango de vencimiento (due_at) para pendientes/vencidos.
    stmt = select(ClinicalTask).where(ClinicalTask.deleted_at.is_(None))
    return paginate_resource(CLINICAL_TASKS, session, query, stmt=stmt)


@router.get("/{task_id}", response_model=ClinicalTaskRead)
def get_clinical_task(
    task_id: UUID,
    session: SessionDep,
    _: ClinicalTaskPermissions.READ.requiere,
) -> ClinicalTaskRead:
    return serialize(ClinicalTaskRead, get_active_or_404(session, ClinicalTask, task_id, _NOT_FOUND))


@router.post("", response_model=ClinicalTaskRead, status_code=status.HTTP_201_CREATED)
def create_clinical_task(
    payload: ClinicalTaskCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalTaskPermissions.CREATE.requiere,
) -> ClinicalTaskRead:
    if payload.patient_id is not None:
        get_active_or_404(session, Patient, payload.patient_id, _PATIENT_NOT_FOUND)
    # ``owner_id`` por defecto: el usuario actual si no se especifica.
    owner_id = payload.owner_id or current_user.id
    task = create_entity(
        session,
        ClinicalTask,
        payload,
        values={
            "owner_id": owner_id,
            "created_by": current_user.id,
            "updated_by": current_user.id,
        },
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalTaskRead, task)


@router.patch("/{task_id}", response_model=ClinicalTaskRead)
def update_clinical_task(
    task_id: UUID,
    payload: ClinicalTaskUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalTaskPermissions.UPDATE.requiere,
) -> ClinicalTaskRead:
    task = get_active_or_404(session, ClinicalTask, task_id, _NOT_FOUND)
    if payload.patient_id is not None:
        get_active_or_404(session, Patient, payload.patient_id, _PATIENT_NOT_FOUND)
    task = patch_entity(
        session,
        task,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(ClinicalTaskRead, task)


@router.delete("/{task_id}", response_model=ClinicalTaskRead)
def delete_clinical_task(
    task_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalTaskPermissions.DELETE.requiere,
) -> ClinicalTaskRead:
    task = get_active_or_404(session, ClinicalTask, task_id, _NOT_FOUND)
    task = soft_delete_entity(
        session,
        task,
        actor_id=current_user.id,
        already_deleted_message="La tarea clínica ya fue eliminada",
    )
    return serialize(ClinicalTaskRead, task)
