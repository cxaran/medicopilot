"""agent_persona

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-28 16:00:00.000000

Persona configurable del copiloto por usuario (capa de personalidad del system-prompt,
P4): tono, enfoque de especialidad, idioma/locale y estilo de consulta. Config en claro,
owner-only, singleton por usuario (user_id único). La capa de seguridad clínica es fija y
la posee el código del frontend (no se persiste).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'agent_personas',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False, comment='Usuario dueño de la persona (única por usuario).'),
        sa.Column('tone', sa.String(length=500), nullable=True, comment='Tono y registro deseado de las respuestas (p. ej. breve, formal).'),
        sa.Column('specialty_focus', sa.String(length=500), nullable=True, comment='Enfoque de especialidad del médico (p. ej. pediatría).'),
        sa.Column('language_locale', sa.String(length=100), nullable=True, comment='Preferencia de idioma/locale (p. ej. es-MX).'),
        sa.Column('consultation_style', sa.String(length=1000), nullable=True, comment='Estilo de consulta por defecto (estructura, nivel de detalle).'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False, comment='Fecha de creación de la persona.'),
        sa.Column('created_by', sa.UUID(), nullable=True, comment='Usuario que creó la persona.'),
        sa.Column('updated_at', sa.DateTime(), nullable=True, comment='Última actualización de la persona.'),
        sa.Column('updated_by', sa.UUID(), nullable=True, comment='Usuario que modificó la persona.'),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], name=op.f('fk_agent_personas_created_by_user'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['updated_by'], ['user.id'], name=op.f('fk_agent_personas_updated_by_user'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name=op.f('fk_agent_personas_user_id_user'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_agent_personas')),
        sa.UniqueConstraint('user_id', name='uq_agent_personas_user'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agent_personas')
