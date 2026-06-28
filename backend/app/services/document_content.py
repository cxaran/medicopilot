"""Extracción de CONTENIDO de documentos clínicos para que el AGENTE lo interprete.

F-MEDIOS fase 1. El servidor solo SUPERFICIE el contenido del documento; NO interpreta
valores clínicos (extraer analito/valor/unidad es trabajo del agente vía visión o texto):

- Imágenes: devuelve la referencia de descarga (``download_url``) que el agente ya usa
  como entrada de VISIÓN; no se extrae texto.
- PDFs: extrae la capa de TEXTO con pypdf (pura-python, sin OCR). Un PDF sin capa de texto
  (típicamente escaneado) se marca como no extraíble; el OCR queda para la fase 2.

No lee ni interpreta clínicamente; solo lee bytes ya almacenados y, para PDFs, su texto.
"""

from dataclasses import dataclass
from io import BytesIO
from typing import Literal, Optional

from backend.app.models.clinical_document import ClinicalDocument

# Tope defensivo del texto devuelto (los reportes de laboratorio son pequeños; evita
# materializar payloads enormes si llega un PDF atípicamente grande).
MAX_TEXT_CHARS = 200_000

ContentKind = Literal["image", "text", "unsupported"]


@dataclass(frozen=True)
class DocumentContent:
    """Contenido extraíble de un documento, listo para que el agente lo interprete."""

    content_kind: ContentKind
    download_url: str
    text: Optional[str]
    text_truncated: bool
    notes: Optional[str]


def _download_url(document: ClinicalDocument) -> str:
    return f"/api/v1/clinical-documents/{document.id}/download"


def _extract_pdf_text(content: bytes) -> str:
    """Texto concatenado de la capa de texto del PDF; cadena vacía si no hay/parsea mal."""
    # Import perezoso: solo se necesita para PDFs y mantiene el resto del módulo liviano.
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError

    try:
        reader = PdfReader(BytesIO(content))
        parts = [page.extract_text() or "" for page in reader.pages]
    except (PyPdfError, ValueError, OSError):
        return ""
    return "\n".join(part for part in parts if part).strip()


def build_document_content(document: ClinicalDocument) -> DocumentContent:
    """Construye el contenido extraíble según el tipo MIME del documento.

    No interpreta valores clínicos: para imágenes entrega la referencia de visión; para
    PDFs entrega el texto crudo (o lo marca como no extraíble si no hay capa de texto)."""
    mime = (document.mime_type or "").lower()
    download_url = _download_url(document)

    if mime.startswith("image/"):
        return DocumentContent(
            content_kind="image",
            download_url=download_url,
            text=None,
            text_truncated=False,
            notes=(
                "Documento de imagen: interprétalo con visión a partir de download_url. "
                "Lee cada analito con su valor y unidad; si algo es ilegible, dilo y NO lo adivines."
            ),
        )

    if mime == "application/pdf":
        text = _extract_pdf_text(document.file_content)
        if not text:
            return DocumentContent(
                content_kind="text",
                download_url=download_url,
                text=None,
                text_truncated=False,
                notes=(
                    "PDF sin capa de texto extraíble (probablemente escaneado). El OCR queda "
                    "para la fase 2 de F-MEDIOS. NO inventes valores: indica que no es legible."
                ),
            )
        truncated = len(text) > MAX_TEXT_CHARS
        return DocumentContent(
            content_kind="text",
            download_url=download_url,
            text=text[:MAX_TEXT_CHARS] if truncated else text,
            text_truncated=truncated,
            notes=(
                "Texto extraído del PDF. Interpreta los analitos con su valor y unidad; si "
                "algún dato es ambiguo o ilegible, dilo y NO lo adivines."
            ),
        )

    return DocumentContent(
        content_kind="unsupported",
        download_url=download_url,
        text=None,
        text_truncated=False,
        notes="Tipo de documento sin extracción de contenido soportada en esta fase.",
    )
