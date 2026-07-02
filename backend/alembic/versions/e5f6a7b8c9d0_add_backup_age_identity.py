"""add backup age identity ciphertext

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-02 22:30:00.000000

Guarda (cifrada con Fernet) la identidad PRIVADA de age cuando el par lo genera el
propio sistema, para poder reenviarla por correo al administrador y que la clave que
abre los respaldos nunca se pierda. Si el administrador pega un recipient externo,
esta columna queda nula (el sistema no conoce esa privada).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'backup_settings',
        sa.Column(
            'age_identity_ciphertext',
            sa.Text(),
            nullable=True,
            comment='Identidad PRIVADA de age CIFRADA (Fernet), sólo si el par lo generó el sistema. Nunca se proyecta a la API; se reenvía por correo al administrador.',
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('backup_settings', 'age_identity_ciphertext')
