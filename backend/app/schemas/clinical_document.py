"""Schemas HTTP de archivos clínicos (clinical_documents).

Regla de oro de esta vertical: el contenido binario (``file_content``) **jamás** viaja
en JSON (listados, detalle, respuestas de carga/actualización, capabilities ni logs).
Estos schemas exponen únicamente metadata segura; el binario se entrega solo por el
endpoint dedicado de descarga, con cabeceras controladas por backend.
"""

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import Field

from backend.app.models.enums import ClinicalDocumentStatus, ClinicalDocumentType
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Opciones de tipo y estado, reutilizadas en formulario (metadata) y filtros de lista.
_TYPE_OPTIONS: list[dict[str, Any]] = [
    {"value": "laboratory", "label": "Laboratorio"},
    {"value": "study", "label": "Estudio"},
    {"value": "image", "label": "Imagen"},
    {"value": "pdf", "label": "PDF"},
    {"value": "external_prescription", "label": "Receta externa"},
    {"value": "clinical_photography", "label": "Fotografía clínica"},
    {"value": "consent", "label": "Consentimiento"},
    {"value": "reference", "label": "Referencia"},
    {"value": "audio", "label": "Audio"},
    {"value": "other", "label": "Otro"},
]
_STATUS_OPTIONS: list[dict[str, Any]] = [
    {"value": "active", "label": "Activo"},
    {"value": "archived", "label": "Archivado"},
    {"value": "deleted", "label": "Eliminado"},
]

# Blobs ``json_schema_extra`` precomputados (evitan el conflicto de invarianza de pyright
# con ``JsonValue`` al anidar listas de opciones).
_TYPE_FORM_UI: dict[str, Any] = {
    "ui": {"form": True, "widget": "select", "options": _TYPE_OPTIONS}
}
_TYPE_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Tipo",
            "widget": "select",
            "options": _TYPE_OPTIONS,
        },
    }
}
_STATUS_LIST_FILTER_UI: dict[str, Any] = {
    "ui": {
        "list": True,
        "filter": {
            "operator": "eq",
            "label": "Estado",
            "widget": "select",
            "options": _STATUS_OPTIONS,
        },
    }
}


class ClinicalDocumentRead(ApiReadSchema):
    """Representación pública completa de un documento clínico: solo metadata segura.

    No incluye ``file_content`` ni ninguna forma del binario. ``sha256`` se publica como
    huella de integridad; no es un control de autorización.
    """

    id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: Optional[uuid.UUID] = None
    document_type: ClinicalDocumentType
    status: ClinicalDocumentStatus
    original_filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    document_date: Optional[date] = None
    description: Optional[str] = None
    uploaded_at: datetime
    uploaded_by: Optional[uuid.UUID] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[uuid.UUID] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[uuid.UUID] = None


class ClinicalDocumentUploadResponse(ClinicalDocumentRead):
    """Respuesta de la carga (POST multipart). Misma metadata segura que la lectura;
    nombre distinto para dejar explícito en el contrato que es el resultado de un
    upload (nunca devuelve el binario)."""


class ClinicalDocumentContentRead(ApiReadSchema):
    """Contenido EXTRAÍBLE de un documento para que el agente lo interprete (F-MEDIOS fase 1).

    No incluye el binario crudo ni interpreta valores clínicos. ``content_kind`` indica cómo
    consumirlo: ``image`` (interpretar por visión vía ``download_url``), ``text`` (texto del
    PDF en ``text``; ``null`` si el PDF no tiene capa de texto extraíble) o ``unsupported``.
    ``notes`` guía al agente (incl. no inventar valores ilegibles).
    """

    document_id: uuid.UUID
    patient_id: uuid.UUID
    consultation_id: Optional[uuid.UUID] = None
    document_type: ClinicalDocumentType
    mime_type: str
    content_kind: Literal["image", "text", "unsupported"]
    download_url: str
    text: Optional[str] = None
    text_truncated: bool = False
    notes: Optional[str] = None


class ClinicalDocumentTranscriptRead(ApiReadSchema):
    """Transcripción de un documento de AUDIO para que el agente la use (F-MEDIOS fase 2).

    La transcripción es un BORRADOR NO CONFIABLE que el médico revisa. ``available`` indica
    si hubo un proveedor STT configurado y respondió; si es ``false``, ``transcript`` es
    ``null`` y ``notes`` explica el motivo (p. ej. "no disponible"). El servidor devuelve
    EXACTAMENTE lo que el proveedor entrega: no inventa ni "mejora" texto. ``provider``
    etiqueta la procedencia (incl. el stub de prueba).
    """

    document_id: uuid.UUID
    patient_id: uuid.UUID
    document_type: ClinicalDocumentType
    mime_type: str
    available: bool
    transcript: Optional[str] = None
    provider: Optional[str] = None
    notes: Optional[str] = None


class ClinicalDocumentListItem(ApiReadSchema):
    """Versión de listado compatible con ``ResourceQuery``: metadata segura, sin binario."""

    id: uuid.UUID
    patient_id: uuid.UUID = Field(
        title="Paciente", json_schema_extra={"ui": {"list": True}}
    )
    consultation_id: Optional[uuid.UUID] = Field(
        default=None, title="Consulta", json_schema_extra={"ui": {"list": True}}
    )
    document_type: ClinicalDocumentType = Field(
        title="Tipo", json_schema_extra=_TYPE_LIST_FILTER_UI
    )
    status: ClinicalDocumentStatus = Field(
        title="Estado", json_schema_extra=_STATUS_LIST_FILTER_UI
    )
    original_filename: str = Field(
        title="Archivo", json_schema_extra={"ui": {"list": True}}
    )
    mime_type: str = Field(
        title="Tipo MIME", json_schema_extra={"ui": {"list": True}}
    )
    size_bytes: int = Field(
        title="Tamaño (bytes)", json_schema_extra={"ui": {"list": True}}
    )
    document_date: Optional[date] = Field(
        default=None, title="Fecha del documento", json_schema_extra={"ui": {"list": True}}
    )
    uploaded_at: datetime = Field(
        title="Cargado", json_schema_extra={"ui": {"list": True}}
    )


class ClinicalDocumentCreateForm(ApiWriteSchema):
    """Contrato **declarativo** del formulario de metadata de la carga (capabilities).

    No se usa para parsear la petición —la carga es ``multipart/form-data`` y el router la
    recibe con ``Form()``/``File()``—; existe para que la proyección publique los campos de
    metadata del formulario de creación. El archivo se describe aparte (``file_field``) y la
    metadata gobernada por servidor (hash, tamaño, MIME, estado, auditoría) no aparece aquí.
    """

    patient_id: uuid.UUID = Field(
        title="Paciente",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    consultation_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Consulta",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    document_type: ClinicalDocumentType = Field(
        title="Tipo", json_schema_extra=_TYPE_FORM_UI
    )
    document_date: Optional[date] = Field(
        default=None,
        title="Fecha del documento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    description: Optional[str] = Field(
        default=None,
        max_length=2000,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class ClinicalDocumentMetadataUpdate(ApiPatchSchema):
    """Actualización parcial de **metadata** (PATCH). No reemplaza el archivo.

    En v1 solo se editan ``document_type``, ``document_date`` y ``description``. El
    binario, el nombre original, el hash, el tamaño, el MIME, el estado y la auditoría
    los gobierna el servidor; enviarlos da 422 (extra forbid). Sustituir el archivo se
    hace cargando un documento nuevo, no sobrescribiendo bytes.
    """

    document_type: Optional[ClinicalDocumentType] = Field(
        default=None, title="Tipo", json_schema_extra=_TYPE_FORM_UI
    )
    document_date: Optional[date] = Field(
        default=None,
        title="Fecha del documento",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    description: Optional[str] = Field(
        default=None,
        max_length=2000,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
