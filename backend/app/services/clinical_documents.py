"""Servicio de dominio de documentos clínicos.

Centraliza las reglas de integridad y de ciclo de vida (no dispersas en el router):
validación de paciente/consulta, validación del archivo, cálculo de metadata gobernada
por servidor (tamaño, SHA-256), y transiciones de estado (archivar/restaurar/eliminar
lógicamente) con sus precondiciones. Las transiciones inválidas responden un 409 estable
``clinical_document_state_invalid`` sin revelar el estado interno.
"""

import uuid
from datetime import date
from typing import Optional

from fastapi import status
from sqlmodel import Session

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    touch_entity,
)
from backend.app.core.settings import settings
from backend.app.models.clinical_document import ClinicalDocument
from backend.app.models.consultation import Consultation
from backend.app.models.enums import ClinicalDocumentStatus, ClinicalDocumentType
from backend.app.models.patient import Patient
from backend.app.schemas.clinical_document import ClinicalDocumentMetadataUpdate
from backend.app.services.file_policy import validate_filename, validate_upload_content
from backend.app.utils.utc_now import utc_now

_NOT_FOUND = "Documento clínico no encontrado"
_PATIENT_NOT_FOUND = "Paciente no encontrado"
_CONSULTATION_NOT_FOUND = "Consulta no encontrada"
_CONSULTATION_MISMATCH = "La consulta no pertenece al paciente indicado."
_CONFLICT = "No se pudo guardar el documento clínico"
# Mensaje único y seguro para cualquier transición inválida: no revela el estado actual
# ni reglas internas (la capability declara las condiciones; el backend es la autoridad).
_STATE_INVALID = "Esta acción no está disponible en el estado actual."


def _state_invalid() -> None:
    api_error(status.HTTP_409_CONFLICT, "clinical_document_state_invalid", _STATE_INVALID)


def load_visible(session: Session, document_id: uuid.UUID) -> ClinicalDocument:
    """Documento disponible para lectura/descarga/edición: existente y no eliminado.

    Un documento eliminado lógicamente (``deleted_at``) responde 404 (no visible), sin
    distinguir de uno inexistente."""
    document = get_or_404(session, ClinicalDocument, document_id, _NOT_FOUND)
    if document.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return document


def load_any(session: Session, document_id: uuid.UUID) -> ClinicalDocument:
    """Documento existente sin filtrar por estado (para restaurar uno eliminado)."""
    return get_or_404(session, ClinicalDocument, document_id, _NOT_FOUND)


def _assert_patient_visible(session: Session, patient_id: uuid.UUID) -> Patient:
    patient = session.get(Patient, patient_id)
    if patient is None or patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _PATIENT_NOT_FOUND)
    return patient


def _assert_consultation_consistent(
    session: Session, consultation_id: uuid.UUID, patient_id: uuid.UUID
) -> None:
    consultation = session.get(Consultation, consultation_id)
    if consultation is None or consultation.deleted_at is not None:
        api_error(
            status.HTTP_404_NOT_FOUND, "resource_not_found", _CONSULTATION_NOT_FOUND
        )
    # La FK permite cualquier consulta; el servicio impide cruzar pacientes.
    if consultation.patient_id != patient_id:
        api_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "validation_error",
            _CONSULTATION_MISMATCH,
        )


def create_clinical_document(
    session: Session,
    *,
    patient_id: uuid.UUID,
    consultation_id: Optional[uuid.UUID],
    document_type: ClinicalDocumentType,
    document_date: Optional[date],
    description: Optional[str],
    filename: str,
    content: bytes,
    declared_mime: str,
    actor_id: uuid.UUID,
) -> ClinicalDocument:
    """Crea un documento clínico. El binario, tamaño, hash, estado y auditoría los
    gobierna el servidor; solo entran paciente/consulta/tipo/fecha/descripción y el
    archivo recibido."""
    _assert_patient_visible(session, patient_id)
    if consultation_id is not None:
        _assert_consultation_consistent(session, consultation_id, patient_id)

    safe_name = validate_filename(filename)
    validated = validate_upload_content(
        content,
        declared_mime,
        allowed_mimes=settings.clinical_document_allowed_mimes,
        max_size_bytes=settings.clinical_document_max_size_bytes,
    )

    document = ClinicalDocument(
        patient_id=patient_id,
        consultation_id=consultation_id,
        document_type=document_type,
        status=ClinicalDocumentStatus.ACTIVE,
        original_filename=safe_name,
        file_content=content,
        mime_type=validated.mime_type,
        size_bytes=validated.size_bytes,
        sha256=validated.sha256,
        document_date=document_date,
        description=description,
        uploaded_by=actor_id,
        updated_by=actor_id,
    )
    session.add(document)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(document)
    return document


def update_metadata(
    session: Session,
    document: ClinicalDocument,
    payload: ClinicalDocumentMetadataUpdate,
    *,
    actor_id: uuid.UUID,
) -> ClinicalDocument:
    """Edita solo metadata autorizada. No reemplaza el binario, hash ni nombre."""
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(document, field, value)
    touch_entity(document, actor_id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(document)
    return document


def archive(
    session: Session, document: ClinicalDocument, *, actor_id: uuid.UUID
) -> ClinicalDocument:
    """Archiva un documento activo (sigue siendo descargable)."""
    if document.status != ClinicalDocumentStatus.ACTIVE:
        _state_invalid()
    document.status = ClinicalDocumentStatus.ARCHIVED
    touch_entity(document, actor_id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(document)
    return document


def restore(
    session: Session, document: ClinicalDocument, *, actor_id: uuid.UUID
) -> ClinicalDocument:
    """Restaura un documento eliminado lógicamente, devolviéndolo a activo."""
    if document.status != ClinicalDocumentStatus.DELETED or document.deleted_at is None:
        _state_invalid()
    document.status = ClinicalDocumentStatus.ACTIVE
    document.deleted_at = None
    document.deleted_by = None
    touch_entity(document, actor_id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(document)
    return document


def soft_delete(
    session: Session, document: ClinicalDocument, *, actor_id: uuid.UUID
) -> ClinicalDocument:
    """Baja lógica: marca estado eliminado + ``deleted_at``/``deleted_by``. Nunca borra
    la fila ni el binario físicamente."""
    if document.status == ClinicalDocumentStatus.DELETED or document.deleted_at is not None:
        _state_invalid()
    document.status = ClinicalDocumentStatus.DELETED
    document.deleted_at = utc_now()
    document.deleted_by = actor_id
    touch_entity(document, actor_id)
    commit_or_conflict(session, _CONFLICT)
    session.refresh(document)
    return document
