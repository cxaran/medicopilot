"""backup settings: credenciales de Google Drive y flag del explorador en DB

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-03 15:00:00.000000

Slice dominio+Google: las credenciales del cliente OAuth de Drive pasan a la fila de
configuración (client_id en claro, client_secret CIFRADO write-only) con las
variables de entorno como fallback/override de despliegue; y el flag del artefacto
de exploración se vuelve política editable (importando UNA vez el valor vigente de
BACKUP_EXPLORER_ENABLED del entorno).
"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _env_explorer_enabled() -> bool:
    raw = os.environ.get("BACKUP_EXPLORER_ENABLED", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def upgrade() -> None:
    """Upgrade schema."""
    explorer_default = 'true' if _env_explorer_enabled() else 'false'
    op.add_column('backup_settings', sa.Column('google_drive_client_id', sa.String(length=255), nullable=True, comment='Client ID del OAuth de Google (editable en la UI; el entorno actúa como fallback).'))
    op.add_column('backup_settings', sa.Column('google_drive_client_secret_ciphertext', sa.Text(), nullable=True, comment='Client secret del OAuth de Google CIFRADO (Fernet). Nunca se proyecta a la API.'))
    op.add_column('backup_settings', sa.Column('explorer_enabled', sa.Boolean(), nullable=False, server_default=explorer_default, comment='Genera el artefacto de exploración (SQLite legible) junto a cada respaldo.'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('backup_settings', 'explorer_enabled')
    op.drop_column('backup_settings', 'google_drive_client_secret_ciphertext')
    op.drop_column('backup_settings', 'google_drive_client_id')
