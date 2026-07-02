"""add backup explorer artifact fields

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-02 23:30:00.000000

Campos ADITIVOS en backup_runs para el artefacto de EXPLORACIÓN (SQLite legible
construido del mismo snapshot que el dump restaurable). El status principal del
respaldo no cambia de significado; explorer_status es independiente.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('backup_runs', sa.Column('explorer_status', sa.Enum('not_requested', 'building', 'ready', 'failed', name='backup_explorer_status', native_enum=False, create_constraint=True), nullable=True, comment='Estado del artefacto de exploración: not_requested, building, ready o failed.'))
    op.add_column('backup_runs', sa.Column('explorer_file_name', sa.String(length=255), nullable=True, comment='Nombre del SQLite de exploración subido ({prefix}-{ts}-{run}.explorer.sqlite[.age]).'))
    op.add_column('backup_runs', sa.Column('explorer_file_size_bytes', sa.BigInteger(), nullable=True, comment='Tamaño del artefacto de exploración subido, en bytes.'))
    op.add_column('backup_runs', sa.Column('explorer_ciphertext_sha256', sa.String(length=64), nullable=True, comment='SHA-256 (hex) del artefacto de exploración subido.'))
    op.add_column('backup_runs', sa.Column('explorer_drive_file_id', sa.String(length=128), nullable=True, comment='Id del artefacto de exploración en Google Drive.'))
    op.add_column('backup_runs', sa.Column('explorer_policy_version', sa.Integer(), nullable=True, comment='Versión de la política de exportación con la que se construyó el explorer.'))
    op.add_column('backup_runs', sa.Column('explorer_created_at', sa.DateTime(), nullable=True, comment='Momento (UTC) en que el artefacto de exploración quedó listo.'))
    op.add_column('backup_runs', sa.Column('explorer_error_code', sa.String(length=96), nullable=True, comment='Código del error del explorer (clasificado, sin texto crudo).'))
    op.add_column('backup_runs', sa.Column('explorer_error_summary', sa.String(length=255), nullable=True, comment='Resumen SEGURO del error del explorer (sin datos clínicos ni secretos).'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('backup_runs', 'explorer_error_summary')
    op.drop_column('backup_runs', 'explorer_error_code')
    op.drop_column('backup_runs', 'explorer_created_at')
    op.drop_column('backup_runs', 'explorer_policy_version')
    op.drop_column('backup_runs', 'explorer_drive_file_id')
    op.drop_column('backup_runs', 'explorer_ciphertext_sha256')
    op.drop_column('backup_runs', 'explorer_file_size_bytes')
    op.drop_column('backup_runs', 'explorer_file_name')
    op.drop_column('backup_runs', 'explorer_status')
