"""Historia clínica narrativa y versionada del paciente.

Personal autorizado captura y edita borradores (``draft``); sólo un médico activo
vinculado al usuario autenticado puede volver vigente (``current``) una versión vía
el endpoint explícito ``/finalize``. Las versiones ``current`` y ``superseded`` son
inmutables. La baja lógica (``deleted_at``/``deleted_by``) sólo aplica a borradores.

Este recurso coexiste con ``patient_clinical_items`` y NO duplica la fuente de
verdad estructurada de alergias, enfermedades crónicas, medicamentos actuales ni
alertas clínicas: aquí esos datos sólo pueden aparecer como narrativa contextual.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
    touch_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.doctor import Doctor
from backend.app.models.enums import MedicalHistoryVersionStatus, RecordStatus
from backend.app.models.medical_history import MedicalHistoryVersion
from backend.app.models.patient import Patient
from backend.app.resources.registry import MEDICAL_HISTORY_VERSIONS
from backend.app.schemas.medical_history_version import (
    MedicalHistoryVersionCreate,
    MedicalHistoryVersionFinalize,
    MedicalHistoryVersionListItem,
    MedicalHistoryVersionRead,
    MedicalHistoryVersionUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.medical_history_versions import (
    MedicalHistoryVersionPermissions,
)
from backend.app.utils.utc_now import utc_now

router = APIRouter(
    prefix="/medical-history-versions", tags=["medical-history-versions"]
)

_NOT_FOUND = "Versión de historia clínica no encontrada"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "No se pudo guardar la versión de historia clínica"
_NOT_DRAFT = "Sólo se puede modificar o eliminar una versión en borrador"

# Campos narrativos que el cliente puede capturar; el resto los gobierna el servidor.
_NARRATIVE_FIELDS = (
    "family_history",
    "pathological_history",
    "non_pathological_history",
    "previous_surgeries",
    "hospitalizations",
    "relevant_habits",
    "gyneco_obstetric_history",
    "clinical_observations",
)


def _get_active_version(session: Session, version_id: UUID) -> MedicalHistoryVersion:
    """Obtiene una versión no eliminada; una con baja lógica responde 404."""
    version = get_or_404(session, MedicalHistoryVersion, version_id, _NOT_FOUND)
    if version.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return version


def _require_draft(version: MedicalHistoryVersion) -> None:
    """Edición, borrado y finalización sólo proceden sobre borradores."""
    if version.status != MedicalHistoryVersionStatus.DRAFT:
        api_error(status.HTTP_409_CONFLICT, "resource_state_conflict", _NOT_DRAFT)


def _lock_active_patient(session: Session, patient_id: UUID) -> Patient:
    """Bloquea (FOR UPDATE) y valida el paciente: serializa el versionado por paciente."""
    patient = session.exec(
        select(Patient).where(Patient.id == patient_id).with_for_update()
    ).first()
    if patient is None or patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)
    return patient


def _current_version(
    session: Session, patient_id: UUID, *, lock: bool = False
) -> MedicalHistoryVersion | None:
    stmt = select(MedicalHistoryVersion).where(
        MedicalHistoryVersion.patient_id == patient_id,
        MedicalHistoryVersion.status == MedicalHistoryVersionStatus.CURRENT,
        MedicalHistoryVersion.deleted_at.is_(None),
    )
    if lock:
        stmt = stmt.with_for_update()
    return session.exec(stmt).first()


def _active_draft_exists(session: Session, patient_id: UUID) -> bool:
    draft = session.exec(
        select(MedicalHistoryVersion.id).where(
            MedicalHistoryVersion.patient_id == patient_id,
            MedicalHistoryVersion.status == MedicalHistoryVersionStatus.DRAFT,
            MedicalHistoryVersion.deleted_at.is_(None),
        )
    ).first()
    return draft is not None


def _next_version_number(session: Session, patient_id: UUID) -> int:
    """Siguiente número consecutivo. Se llama con la fila del paciente bloqueada."""
    current_max = session.exec(
        select(func.max(MedicalHistoryVersion.version_number)).where(
            MedicalHistoryVersion.patient_id == patient_id
        )
    ).first()
    return (current_max or 0) + 1


@router.get("", response_model=OffsetPage[MedicalHistoryVersionListItem])
def list_medical_history_versions(
    session: SessionDep,
    query: Annotated[MEDICAL_HISTORY_VERSIONS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: MedicalHistoryVersionPermissions.READ.requiere,
) -> OffsetPage[MedicalHistoryVersionListItem]:
    # Scope base: sólo versiones vigentes en el sentido de no eliminadas. La versión
    # actual del paciente se obtiene con ?patient_id=<id>&status=current.
    stmt = select(MedicalHistoryVersion).where(
        MedicalHistoryVersion.deleted_at.is_(None)
    )
    return paginate_resource(MEDICAL_HISTORY_VERSIONS, session, query, stmt=stmt)


@router.get("/{history_version_id}", response_model=MedicalHistoryVersionRead)
def get_medical_history_version(
    history_version_id: UUID,
    session: SessionDep,
    _: MedicalHistoryVersionPermissions.READ.requiere,
) -> MedicalHistoryVersionRead:
    return serialize(
        MedicalHistoryVersionRead, _get_active_version(session, history_version_id)
    )


@router.post(
    "", response_model=MedicalHistoryVersionRead, status_code=status.HTTP_201_CREATED
)
def create_medical_history_version(
    payload: MedicalHistoryVersionCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicalHistoryVersionPermissions.CREATE.requiere,
) -> MedicalHistoryVersionRead:
    # Bloquea la fila del paciente: serializa la asignación de version_number y la
    # regla de un solo borrador activo frente a solicitudes concurrentes.
    _lock_active_patient(session, payload.patient_id)
    if _active_draft_exists(session, payload.patient_id):
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "Ya existe un borrador de historia clínica para este paciente",
        )

    current = _current_version(session, payload.patient_id)
    sent = payload.model_dump(exclude_unset=True)
    if current is not None:
        # Nace de la versión vigente: copia su narrativa y aplica encima sólo lo
        # enviado explícitamente por el cliente.
        narrative = {field: getattr(current, field) for field in _NARRATIVE_FIELDS}
        narrative.update(
            {field: sent[field] for field in _NARRATIVE_FIELDS if field in sent}
        )
        based_on_id = current.id
    else:
        narrative = {field: sent.get(field) for field in _NARRATIVE_FIELDS}
        based_on_id = None

    version = MedicalHistoryVersion(
        patient_id=payload.patient_id,
        version_number=_next_version_number(session, payload.patient_id),
        status=MedicalHistoryVersionStatus.DRAFT,
        based_on_version_id=based_on_id,
        created_by=current_user.id,
        updated_by=current_user.id,
        **narrative,
    )
    session.add(version)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(version)
    return serialize(MedicalHistoryVersionRead, version)


@router.patch("/{history_version_id}", response_model=MedicalHistoryVersionRead)
def update_medical_history_version(
    history_version_id: UUID,
    payload: MedicalHistoryVersionUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicalHistoryVersionPermissions.UPDATE.requiere,
) -> MedicalHistoryVersionRead:
    version = _get_active_version(session, history_version_id)
    _require_draft(version)
    version = patch_entity(
        session,
        version,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(MedicalHistoryVersionRead, version)


@router.delete("/{history_version_id}", response_model=MedicalHistoryVersionRead)
def delete_medical_history_version(
    history_version_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicalHistoryVersionPermissions.DELETE.requiere,
) -> MedicalHistoryVersionRead:
    version = _get_active_version(session, history_version_id)
    _require_draft(version)
    version = soft_delete_entity(
        session,
        version,
        actor_id=current_user.id,
        already_deleted_message="La versión de historia clínica ya fue eliminada",
    )
    return serialize(MedicalHistoryVersionRead, version)


@router.post(
    "/{history_version_id}/finalize", response_model=MedicalHistoryVersionRead
)
def finalize_medical_history_version(
    history_version_id: UUID,
    payload: MedicalHistoryVersionFinalize,
    session: SessionDep,
    current_user: CurrentUser,
    _: MedicalHistoryVersionPermissions.FINALIZE.requiere,
) -> MedicalHistoryVersionRead:
    version = _get_active_version(session, history_version_id)
    _require_draft(version)

    # El paciente debe seguir vigente; también bloquea su fila para serializar la
    # finalización y evitar dos versiones vigentes simultáneas.
    patient = session.exec(
        select(Patient).where(Patient.id == version.patient_id).with_for_update()
    ).first()
    if patient is None or patient.deleted_at is not None:
        api_error(
            status.HTTP_409_CONFLICT,
            "resource_state_conflict",
            "No se puede finalizar: el paciente fue eliminado",
        )

    # El médico se deriva del usuario autenticado: no se acepta doctor_id. Además del
    # permiso de finalize, exige un perfil de médico vigente y activo.
    doctor = session.exec(
        select(Doctor).where(
            Doctor.user_id == current_user.id, Doctor.deleted_at.is_(None)
        )
    ).first()
    if doctor is None or doctor.status != RecordStatus.ACTIVE:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "doctor_profile_required",
            "Se requiere un perfil de médico activo para finalizar la historia clínica",
        )

    previous_current = _current_version(session, version.patient_id, lock=True)
    if previous_current is not None and previous_current.id != version.id:
        # Demota antes de promover: el índice parcial único impide dos versiones
        # vigentes; el flush garantiza el orden superseded -> current.
        previous_current.status = MedicalHistoryVersionStatus.SUPERSEDED
        touch_entity(previous_current, current_user.id)
        session.flush()

    version.status = MedicalHistoryVersionStatus.CURRENT
    version.reviewed_by_doctor_id = doctor.id
    version.reviewed_at = utc_now()
    touch_entity(version, current_user.id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(version)
    return serialize(MedicalHistoryVersionRead, version)
