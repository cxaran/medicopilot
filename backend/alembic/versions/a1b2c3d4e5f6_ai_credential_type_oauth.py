"""ai_provider_credential: tipo de credencial (api_key | oauth)

Revision ID: a1b2c3d4e5f6
Revises: 719e7bc0e584
Create Date: 2026-06-28 00:00:00.000000

Añade la columna ``credential_type`` para soportar credenciales OAuth
(ChatGPT Plus/Codex) junto a las de API key. El perfil OAuth cifrado se sigue
guardando en ``secret_encrypted``; esta columna solo discrimina su tratamiento.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '719e7bc0e584'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'ai_provider_credentials',
        sa.Column(
            'credential_type',
            sa.Enum(
                'api_key',
                'oauth',
                name='ai_credential_type',
                native_enum=False,
                create_constraint=False,
            ),
            server_default='api_key',
            nullable=False,
            comment='Tipo de credencial: api_key (secreto estático) u oauth (perfil cifrado).',
        ),
    )
    # El CHECK de un enum no nativo no lo crea ``add_column`` por sí solo; se añade
    # explícitamente con el nombre que dicta la NAMING_CONVENTION del modelo.
    op.create_check_constraint(
        op.f('ck_ai_provider_credentials_ai_credential_type'),
        'ai_provider_credentials',
        "credential_type IN ('api_key', 'oauth')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f('ck_ai_provider_credentials_ai_credential_type'),
        'ai_provider_credentials',
        type_='check',
    )
    op.drop_column('ai_provider_credentials', 'credential_type')
