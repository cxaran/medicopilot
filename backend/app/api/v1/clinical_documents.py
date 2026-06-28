"""Documentos clínicos: archivos binarios del expediente del paciente.

La metadata y el binario están deliberadamente separados: todas las rutas JSON
exponen solo metadata segura; el contenido binario se entrega únicamente por el
endpoint dedicado ``/download`` con cabeceras controladas por backend (attachment,
no-store, nosniff). La carga es ``multipart/form-data`` (no JSON genérico).

Las reglas de integridad y de ciclo de vida viven en el servicio de dominio
(``services/clinical_documents.py``); el router solo orquesta autorización, carga del
archivo y serialización. Cada endpoint tiene su guard de permiso real: una capability
visible nunca reemplaza al guard.
"""

from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from sqlmodel import select

from backend.app.api.resource_actions import paginate_resource, serialize
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.models.clinical_document import ClinicalDocument
from backend.app.models.enums import ClinicalDocumentType
from backend.app.models.patient import Patient
from backend.app.resources.registry import CLINICAL_DOCUMENTS
from backend.app.schemas.clinical_document import (
    ClinicalDocumentContentRead,
    ClinicalDocumentListItem,
    ClinicalDocumentMetadataUpdate,
    ClinicalDocumentRead,
    ClinicalDocumentUploadResponse,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.clinical_documents import ClinicalDocumentPermissions
from backend.app.services import clinical_documents as service
from backend.app.services.document_content import build_document_content

router = APIRouter(prefix="/clinical-documents", tags=["clinical-documents"])


@router.get("", response_model=OffsetPage[ClinicalDocumentListItem])
def list_clinical_documents(
    session: SessionDep,
    query: Annotated[CLINICAL_DOCUMENTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ClinicalDocumentPermissions.READ.requiere,
) -> OffsetPage[ClinicalDocumentListItem]:
    # Scope base: documentos no eliminados cuyo paciente tampoco lo esté. El caso
    # principal se resuelve con ?patient_id=<id> o ?consultation_id=<id>.
    stmt = (
        select(ClinicalDocument)
        .join(Patient, Patient.id == ClinicalDocument.patient_id)
        .where(ClinicalDocument.deleted_at.is_(None), Patient.deleted_at.is_(None))
    )
    return paginate_resource(CLINICAL_DOCUMENTS, session, query, stmt=stmt)


@router.get("/{document_id}", response_model=ClinicalDocumentRead)
def get_clinical_document(
    document_id: UUID,
    session: SessionDep,
    _: ClinicalDocumentPermissions.READ.requiere,
) -> ClinicalDocumentRead:
    document = service.load_visible(session, document_id)
    return serialize(ClinicalDocumentRead, document)


@router.get("/{document_id}/content", response_model=ClinicalDocumentContentRead)
def get_clinical_document_content(
    document_id: UUID,
    session: SessionDep,
    _: ClinicalDocumentPermissions.READ.requiere,
) -> ClinicalDocumentContentRead:
    """Contenido EXTRAÍBLE del documento para que el agente lo interprete (F-MEDIOS fase 1).

    Mismo RBAC y visibilidad que la lectura del documento (eliminado lógico → 404). Para
    imágenes devuelve la referencia de visión (``download_url``); para PDFs, el texto. El
    servidor NO interpreta valores clínicos: solo superficie el contenido."""
    document = service.load_visible(session, document_id)
    content = build_document_content(document)
    return ClinicalDocumentContentRead(
        document_id=document.id,
        patient_id=document.patient_id,
        consultation_id=document.consultation_id,
        document_type=document.document_type,
        mime_type=document.mime_type,
        content_kind=content.content_kind,
        download_url=content.download_url,
        text=content.text,
        text_truncated=content.text_truncated,
        notes=content.notes,
    )


@router.post(
    "",
    response_model=ClinicalDocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_clinical_document(
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalDocumentPermissions.CREATE.requiere,
    patient_id: Annotated[UUID, Form()],
    document_type: Annotated[ClinicalDocumentType, Form()],
    file: Annotated[UploadFile, File()],
    consultation_id: Annotated[Optional[UUID], Form()] = None,
    document_date: Annotated[Optional[date], Form()] = None,
    description: Annotated[Optional[str], Form()] = None,
) -> ClinicalDocumentUploadResponse:
    # Lectura acotada: como máximo ``max_size`` + 1 byte; si excede, el servicio
    # responde 413 sin haber materializado un binario sin límite.
    max_size = settings.clinical_document_max_size_bytes
    content = await file.read(max_size + 1)
    document = service.create_clinical_document(
        session,
        patient_id=patient_id,
        consultation_id=consultation_id,
        document_type=document_type,
        document_date=document_date,
        description=description,
        filename=file.filename or "",
        content=content,
        declared_mime=file.content_type or "",
        actor_id=current_user.id,
    )
    return serialize(ClinicalDocumentUploadResponse, document)


@router.patch("/{document_id}", response_model=ClinicalDocumentRead)
def update_clinical_document(
    document_id: UUID,
    payload: ClinicalDocumentMetadataUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalDocumentPermissions.UPDATE.requiere,
) -> ClinicalDocumentRead:
    document = service.load_visible(session, document_id)
    document = service.update_metadata(
        session, document, payload, actor_id=current_user.id
    )
    return serialize(ClinicalDocumentRead, document)


@router.get("/{document_id}/download")
def download_clinical_document(
    document_id: UUID,
    session: SessionDep,
    _: ClinicalDocumentPermissions.DOWNLOAD.requiere,
) -> Response:
    # Descarga segura: el documento eliminado responde 404 (load_visible); el MIME y la
    # disposición los controla el backend. Nombre ya saneado (ASCII) en la carga.
    document = service.load_visible(session, document_id)
    headers = {
        "Content-Disposition": f'attachment; filename="{document.original_filename}"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": str(document.size_bytes),
    }
    return Response(
        content=document.file_content,
        media_type=document.mime_type,
        headers=headers,
    )


@router.post("/{document_id}/archive", response_model=ClinicalDocumentRead)
def archive_clinical_document(
    document_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalDocumentPermissions.ARCHIVE.requiere,
) -> ClinicalDocumentRead:
    document = service.load_visible(session, document_id)
    document = service.archive(session, document, actor_id=current_user.id)
    return serialize(ClinicalDocumentRead, document)


@router.post("/{document_id}/restore", response_model=ClinicalDocumentRead)
def restore_clinical_document(
    document_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalDocumentPermissions.RESTORE.requiere,
) -> ClinicalDocumentRead:
    # Restaurar opera sobre un documento eliminado: se carga sin filtrar por estado.
    document = service.load_any(session, document_id)
    document = service.restore(session, document, actor_id=current_user.id)
    return serialize(ClinicalDocumentRead, document)


@router.delete("/{document_id}", response_model=ClinicalDocumentRead)
def delete_clinical_document(
    document_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ClinicalDocumentPermissions.DELETE.requiere,
) -> ClinicalDocumentRead:
    document = service.load_visible(session, document_id)
    document = service.soft_delete(session, document, actor_id=current_user.id)
    return serialize(ClinicalDocumentRead, document)
