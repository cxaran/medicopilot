"""Catálogo de plantillas de medicamentos frecuentes por médico.

CRUD bajo permisos de administración (``medication_templates:*``). La baja es
lógica (``deleted_at``/``deleted_by``, convención del dominio clínico), no física,
y los listados/detalles excluyen las plantillas eliminadas.

El ``status`` (active/inactive) es estado operativo del catálogo, editable en
create/update; es independiente de la baja lógica (``deleted_at``).
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
from backend.app.models.medication_template import MedicationTemplate
from backend.app.resources.registry import MEDICATION_TEMPLATES
from backend.app.schemas.medication_template import (
    MedicationTemplateCreate,
    MedicationTemplateListItem,
    MedicationTemplateRead,
    MedicationTemplateUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.medication_templates import (
    MedicationTemplatePermissions,
)

router = APIRouter(prefix="/medication-templates", tags=["medication_templates"])

_NOT_FOUND = "Plantilla de medicamento no encontrada"
_DOCTOR_NOT_FOUND = "Médico no encontrado"
_CONFLICT = "Ya existe una plantilla con ese medicamento y presentación para el médico"


def _get_active_template(session: Session, template_id: UUID) -> MedicationTemplate:
    """Obtiene una plantilla no eliminada; una con baja lógica responde 404."""
    template = get_or_404(session, MedicationTemplate, template_id, _NOT_FOUND)
    if template.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return template


def _ensure_doctor_exists(session: Session, doctor_id: UUID) -> Doctor:
    """El médico propietario debe existir y no estar eliminado (404 genérico)."""
    doctor = get_or_404(session, Doctor, doctor_id, _DOCTOR_NOT_FOUND)
    if doctor.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _DOCTOR_NOT_FOUND)
    return doctor


@router.get("", response_model=OffsetPage[MedicationTemplateListItem])
def list_medication_templates(
    session: SessionDep,
    query: Annotated[MEDICATION_TEMPLATES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: MedicationTemplatePermissions.READ.requiere,
) -> OffsetPage[MedicationTemplateListItem]:
    # Scope base: sólo plantillas vigentes (excluye las eliminadas lógicamente).
    stmt = select(MedicationTemplate).where(MedicationTemplate.deleted_at.is_(None))
    return paginate_resource(MEDICATION_TEMPLATES, session, query, stmt=stmt)


@router.get("/{template_id}", response_model=MedicationTemplateRead)
def get_medication_template(
    template_id: UUID,
    session: SessionDep,
    _: MedicationTemplatePermissions.READ.requiere,
) -> MedicationTemplateRead:
    return serialize(MedicationTemplateRead, _get_active_template(session, template_id))


@router.post(
    "", response_model=MedicationTemplateRead, status_code=status.HTTP_201_CREATED
)
def create_medication_template(
    payload: MedicationTemplateCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicationTemplatePermissions.CREATE.requiere,
) -> MedicationTemplateRead:
    _ensure_doctor_exists(session, payload.doctor_id)
    template = create_entity(
        session,
        MedicationTemplate,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(MedicationTemplateRead, template)


@router.patch("/{template_id}", response_model=MedicationTemplateRead)
def update_medication_template(
    template_id: UUID,
    payload: MedicationTemplateUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicationTemplatePermissions.UPDATE.requiere,
) -> MedicationTemplateRead:
    template = _get_active_template(session, template_id)
    template = patch_entity(
        session,
        template,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(MedicationTemplateRead, template)


@router.delete("/{template_id}", response_model=MedicationTemplateRead)
def delete_medication_template(
    template_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicationTemplatePermissions.DELETE.requiere,
) -> MedicationTemplateRead:
    template = _get_active_template(session, template_id)
    template = soft_delete_entity(
        session,
        template,
        actor_id=current_user.id,
        already_deleted_message="La plantilla ya fue eliminada",
    )
    return serialize(MedicationTemplateRead, template)
