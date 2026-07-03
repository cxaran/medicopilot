"""Cifrado simétrico de SECRETOS de configuración en reposo (Fernet).

Módulo neutral (no acoplado a un dominio): lo usan el correo configurable y —en la
consolidación futura de la clave maestra única APP_ENCRYPTION_KEY— también respaldos
y credenciales de IA. Hoy la clave es BACKUP_TOKEN_ENCRYPTION_KEY (la Fernet ya
exigida por respaldos) para no sumar otra variable de entorno antes de esa
consolidación. La clave vive SOLO en el entorno: nunca en la base de datos que cifra.
"""

from typing import Optional

from backend.app.core.settings import settings


class SecretCipherError(Exception):
    """La clave de cifrado no está configurada o el material no descifra."""

    def __init__(self, code: str, summary: str) -> None:
        super().__init__(summary)
        self.code = code
        self.summary = summary


def _fernet():
    from cryptography.fernet import Fernet

    key = settings.backup_token_encryption_key
    if key is None:
        raise SecretCipherError(
            "encryption_key_missing",
            "Configura BACKUP_TOKEN_ENCRYPTION_KEY para guardar secretos cifrados.",
        )
    try:
        return Fernet(key.get_secret_value().encode("utf-8"))
    except Exception as error:
        raise SecretCipherError(
            "encryption_key_invalid",
            "La clave de cifrado no es una clave Fernet válida.",
        ) from error


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> Optional[str]:
    """Descifra o devuelve ``None`` si el material no corresponde a la clave."""
    from cryptography.fernet import InvalidToken

    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, SecretCipherError):
        return None
