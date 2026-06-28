"""Transcripción de audio de consulta (F-MEDIOS fase 2).

El reconocimiento de voz (STT) NO es pura-python: se resuelve contra un PROVEEDOR
CONFIGURABLE y SWAPPABLE, igual que el proxy de PubMed (G3/B13). El contrato es mínimo y
se invoca con HTTP/JSON hecho a mano (sin SDK de nube):

    POST <stt_provider_url>  (cuerpo = binario de audio, Content-Type = MIME del audio)
    -> 200 JSON {"text": "<transcripción>"}

Reglas de honestidad y procedencia:
- Si NO hay proveedor configurado (``stt_provider_url`` vacío), la transcripción es
  "no disponible": ``available=False`` y ``transcript=None``. NUNCA se fabrica un texto.
- El servidor devuelve EXACTAMENTE lo que el proveedor entrega; no inventa ni "mejora".
- Para pruebas/QA existe un STUB local tras el MISMO contrato, seleccionado por config con
  el esquema sentinela ``stub://``: devuelve un texto FIJO de PRUEBA (no es STT real). Un
  proveedor real lo reemplaza cambiando SOLO ``stt_provider_url``.
"""

from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx

from backend.app.core.settings import settings
from backend.app.models.clinical_document import ClinicalDocument
from backend.app.models.enums import ClinicalDocumentType

# Texto FIJO del stub de pruebas (claramente PRUEBA, no STT real).
STUB_TRANSCRIPT = (
    "Paciente refiere cefalea de tres días, sin fiebre. Antecedente de hipertensión. "
    "Se revisa presión arterial y se ajusta tratamiento. (Transcripción de PRUEBA)"
)

_UNAVAILABLE_NO_PROVIDER = (
    "Transcripción no disponible: no hay proveedor de voz a texto configurado. "
    "No se inventa una transcripción."
)
_UNAVAILABLE_PROVIDER_ERROR = (
    "Transcripción no disponible: el proveedor de voz a texto no respondió correctamente. "
    "No se inventa una transcripción."
)
_NOT_AUDIO = "El documento no es de audio; no se puede transcribir."


@dataclass(frozen=True)
class TranscriptResult:
    """Resultado de transcribir un documento de audio (borrador no confiable)."""

    available: bool
    transcript: Optional[str]
    provider: Optional[str]
    notes: Optional[str]


def _is_audio(document: ClinicalDocument) -> bool:
    mime = (document.mime_type or "").lower()
    return mime.startswith("audio/") or document.document_type == ClinicalDocumentType.AUDIO


def _call_provider(url: str, content: bytes, mime: str) -> TranscriptResult:
    """Invoca el proveedor STT real (HTTP/JSON a mano). Nunca lanza; ante error, no disponible."""
    headers = {"Content-Type": mime or "application/octet-stream"}
    api_key = settings.stt_api_key
    if api_key is not None and api_key.get_secret_value().strip():
        headers["Authorization"] = f"Bearer {api_key.get_secret_value()}"
    provider = urlparse(url).netloc or "stt"
    try:
        response = httpx.post(
            url,
            content=content,
            headers=headers,
            timeout=httpx.Timeout(settings.stt_timeout_seconds),
        )
        if response.status_code >= 400:
            return TranscriptResult(False, None, provider, _UNAVAILABLE_PROVIDER_ERROR)
        data = response.json()
        text = data.get("text") if isinstance(data, dict) else None
    except (httpx.HTTPError, ValueError):
        # No se incluye el detalle de la excepción para no arriesgar fugas (URL/credencial).
        return TranscriptResult(False, None, provider, _UNAVAILABLE_PROVIDER_ERROR)
    if not isinstance(text, str) or not text.strip():
        return TranscriptResult(False, None, provider, _UNAVAILABLE_PROVIDER_ERROR)
    return TranscriptResult(True, text, provider, None)


def transcribe_document(document: ClinicalDocument) -> TranscriptResult:
    """Transcribe un documento de audio usando el proveedor STT configurado.

    No interpreta clínicamente ni fabrica: si no hay proveedor o el documento no es audio,
    devuelve no disponible. La transcripción es un BORRADOR que el médico revisa."""
    if not _is_audio(document):
        return TranscriptResult(False, None, None, _NOT_AUDIO)

    url = (settings.stt_provider_url or "").strip()
    if not url:
        return TranscriptResult(False, None, None, _UNAVAILABLE_NO_PROVIDER)

    if url.startswith("stub://"):
        return TranscriptResult(
            available=True,
            transcript=STUB_TRANSCRIPT,
            provider="stub-local (PRUEBA)",
            notes=(
                "Transcripción de PRUEBA (proveedor stub); no es voz a texto real. "
                "Revísala como borrador no confiable."
            ),
        )

    return _call_provider(url, document.file_content, (document.mime_type or "").lower())
