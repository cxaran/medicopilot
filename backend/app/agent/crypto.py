"""Cifrado simétrico reversible para secretos de credenciales de proveedor de IA.

FastAPI es la autoridad que guarda las credenciales de proveedor de IA CIFRADAS en
reposo (el navegador no las guarda; el Gateway las arrendará en B4). Aquí solo vive
la primitiva de cifrado: Fernet (AES-128-CBC + HMAC) con una clave DEDICADA
(``settings.ai_credential_key``). El secreto en claro nunca se persiste ni se loguea.

Generar una clave válida (urlsafe base64 de 32 bytes)::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from cryptography.fernet import Fernet

from backend.app.core.settings import settings


def _fernet() -> Fernet:
    key = settings.ai_credential_key
    if key is None or not key.get_secret_value().strip():
        raise RuntimeError(
            "ai_credential_key no está configurada: define AI_CREDENTIAL_KEY (clave Fernet)."
        )
    return Fernet(key.get_secret_value().encode("utf-8"))


def encrypt_secret(plaintext: str) -> str:
    """Cifra ``plaintext`` y devuelve el token Fernet (texto) para guardar en reposo."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    """Descifra un token Fernet y devuelve el secreto en claro (uso efímero)."""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
