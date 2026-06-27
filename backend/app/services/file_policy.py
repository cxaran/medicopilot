"""Política de validación y saneamiento de archivos subidos.

Funciones puras (sin BD) para que la regla de archivos sea verificable de forma
aislada. Lanzan el envelope de error estándar del proyecto (``api_error``) con los
códigos HTTP acordados para la vertical de documentos clínicos.
"""

import hashlib
import re
from dataclasses import dataclass

from fastapi import status

from backend.app.api.resource_actions import api_error

# Caracteres permitidos en un nombre de archivo público; el resto se reemplaza. No se
# usa el nombre como ruta: primero se reduce al basename.
_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._ \-()]+")
_MULTI_UNDERSCORE = re.compile(r"_{2,}")

# Firmas de bytes mínimas (defensa en profundidad): si el MIME declarado tiene firma
# conocida y el contenido no la cumple, se rechaza. Para MIME sin firma conocida se
# acepta el declarado (ya validado contra la allowlist). No es detección exhaustiva.
_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
}

_MAX_FILENAME_LENGTH = 255


@dataclass(frozen=True)
class ValidatedFile:
    """Resultado de validar un archivo: metadata gobernada por servidor."""

    mime_type: str
    size_bytes: int
    sha256: str


def sanitize_filename(raw: str) -> str:
    """Reduce a basename seguro: sin componentes de ruta, sin caracteres peligrosos,
    máximo 255 caracteres. Nunca devuelve cadena vacía."""
    name = (raw or "").replace("\\", "/")
    name = name.rsplit("/", 1)[-1]
    name = name.strip().strip(".")
    name = _UNSAFE_CHARS.sub("_", name)
    name = _MULTI_UNDERSCORE.sub("_", name).strip("_ ")
    if not name:
        name = "documento"
    return name[:_MAX_FILENAME_LENGTH]


def validate_filename(raw: str) -> str:
    sanitized = sanitize_filename(raw)
    if len(raw or "") > _MAX_FILENAME_LENGTH:
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_file",
            "El nombre del archivo excede la longitud permitida.",
        )
    return sanitized


def validate_upload_content(
    content: bytes,
    declared_mime: str,
    *,
    allowed_mimes: frozenset[str],
    max_size_bytes: int,
) -> ValidatedFile:
    """Valida tamaño, MIME y firma; calcula tamaño y SHA-256 sobre los bytes reales.

    No revela detalles internos de la validación más allá de un mensaje seguro.
    """
    size = len(content)
    if size == 0:
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_file",
            "El archivo está vacío.",
        )
    if size > max_size_bytes:
        api_error(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "file_too_large",
            "El archivo excede el tamaño máximo permitido.",
        )

    mime = (declared_mime or "").strip().lower()
    if mime not in allowed_mimes:
        api_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "unsupported_media_type",
            "El tipo de archivo no está permitido.",
        )

    signatures = _MAGIC_SIGNATURES.get(mime)
    if signatures is not None and not any(content.startswith(sig) for sig in signatures):
        api_error(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "unsupported_media_type",
            "El contenido del archivo no coincide con el tipo declarado.",
        )

    return ValidatedFile(
        mime_type=mime,
        size_bytes=size,
        sha256=hashlib.sha256(content).hexdigest(),
    )
