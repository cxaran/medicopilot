"""Credenciales de proveedor de IA del usuario autenticado (owner-only).

NO es un recurso RBAC global (no se registra en RESOURCE_REGISTRY): cada credencial
pertenece a un usuario y solo su dueño puede verla/editarla/borrarla. El secreto en
claro solo se acepta como entrada (create/update), se cifra antes de guardar y nunca
se devuelve ni se loguea.
"""

import uuid

from fastapi import APIRouter, status
from sqlmodel import select

from backend.app.agent.crypto import encrypt_secret
from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    serialize,
    soft_delete_entity,
    update_entity_values,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.ai_provider_credential import AiProviderCredential
from backend.app.schemas.ai_provider_credential import (
    AiProviderCredentialCreate,
    AiProviderCredentialRead,
    AiProviderCredentialUpdate,
)
from backend.app.schemas.auth import MessageResponse

router = APIRouter(prefix="/users/me/ai-providers", tags=["ai-providers"])


def _get_owned(
    session: SessionDep,
    credential_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> AiProviderCredential:
    """Devuelve la credencial vigente del dueño o 404 (no revela credenciales ajenas)."""
    credential = session.get(AiProviderCredential, credential_id)
    if (
        credential is None
        or credential.deleted_at is not None
        or credential.user_id != owner_id
    ):
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", "Credencial no encontrada")
    return credential


@router.get("", response_model=list[AiProviderCredentialRead])
def list_credentials(
    session: SessionDep,
    current_user: CurrentUser,
) -> list[AiProviderCredentialRead]:
    stmt = (
        select(AiProviderCredential)
        .where(
            AiProviderCredential.user_id == current_user.id,
            AiProviderCredential.deleted_at.is_(None),
        )
        .order_by(AiProviderCredential.created_at)
    )
    rows = session.exec(stmt).all()
    return [serialize(AiProviderCredentialRead, row) for row in rows]


@router.post("", response_model=AiProviderCredentialRead, status_code=status.HTTP_201_CREATED)
def create_credential(
    payload: AiProviderCredentialCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AiProviderCredentialRead:
    credential = AiProviderCredential(
        user_id=current_user.id,
        provider=payload.provider,
        label=payload.label,
        secret_encrypted=encrypt_secret(payload.secret),
        default_model=payload.default_model,
        created_by=current_user.id,
    )
    session.add(credential)
    commit_or_conflict(session, "No se pudo guardar la credencial")
    session.refresh(credential)
    return serialize(AiProviderCredentialRead, credential)


@router.patch("/{credential_id}", response_model=AiProviderCredentialRead)
def update_credential(
    credential_id: uuid.UUID,
    payload: AiProviderCredentialUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> AiProviderCredentialRead:
    credential = _get_owned(session, credential_id, current_user.id)

    data = payload.model_dump(exclude_unset=True)
    # El secreto se recifra si viene; nunca se guarda en claro.
    if "secret" in data:
        secret = data.pop("secret")
        if secret is not None:
            data["secret_encrypted"] = encrypt_secret(secret)

    update_entity_values(
        session,
        credential,
        data,
        actor_id=current_user.id,
        conflict_message="No se pudo actualizar la credencial",
    )
    return serialize(AiProviderCredentialRead, credential)


@router.delete("/{credential_id}", response_model=MessageResponse)
def delete_credential(
    credential_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> MessageResponse:
    credential = _get_owned(session, credential_id, current_user.id)
    soft_delete_entity(
        session,
        credential,
        actor_id=current_user.id,
        already_deleted_message="La credencial ya estaba eliminada",
    )
    return MessageResponse(message="Credencial eliminada correctamente")
