"""agent_memory

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-28 12:00:00.000000

Memorias persistentes del agente ligadas al usuario médico, con el contenido
cifrado en reposo (Fernet) y relación opcional a paciente/consulta.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'agent_memories',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False, comment='Usuario dueño de la memoria.'),
        sa.Column('title', sa.String(length=200), nullable=False, comment='Clave corta o título legible de la memoria.'),
        sa.Column('content_encrypted', sa.Text(), nullable=False, comment='Contenido de la memoria cifrado con Fernet (NUNCA el claro).'),
        sa.Column(
            'kind',
            sa.Enum('nota', 'preferencia', 'hecho_clinico', 'recordatorio', name='agent_memory_kind', native_enum=False, create_constraint=True),
            server_default='nota',
            nullable=False,
            comment='Tipo de memoria: nota, preferencia, hecho_clinico o recordatorio.',
        ),
        sa.Column('patient_id', sa.UUID(), nullable=True, comment='Paciente al que se relaciona la memoria, si aplica.'),
        sa.Column('consultation_id', sa.UUID(), nullable=True, comment='Consulta a la que se relaciona la memoria, si aplica.'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False, comment='Fecha de creación de la memoria.'),
        sa.Column('created_by', sa.UUID(), nullable=True, comment='Usuario que creó la memoria.'),
        sa.Column('updated_at', sa.DateTime(), nullable=True, comment='Última actualización de la memoria.'),
        sa.Column('updated_by', sa.UUID(), nullable=True, comment='Usuario que modificó la memoria.'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True, comment='Fecha de eliminación lógica de la memoria.'),
        sa.Column('deleted_by', sa.UUID(), nullable=True, comment='Usuario que eliminó lógicamente la memoria.'),
        sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], name=op.f('fk_agent_memories_consultation_id_consultations'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], name=op.f('fk_agent_memories_created_by_user'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['deleted_by'], ['user.id'], name=op.f('fk_agent_memories_deleted_by_user'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name=op.f('fk_agent_memories_patient_id_patients'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['updated_by'], ['user.id'], name=op.f('fk_agent_memories_updated_by_user'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name=op.f('fk_agent_memories_user_id_user'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_agent_memories')),
    )
    op.create_index('ix_agent_memories_consultation', 'agent_memories', ['consultation_id'], unique=False)
    op.create_index('ix_agent_memories_kind', 'agent_memories', ['kind'], unique=False)
    op.create_index('ix_agent_memories_patient', 'agent_memories', ['patient_id'], unique=False)
    op.create_index('ix_agent_memories_user', 'agent_memories', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_agent_memories_user', table_name='agent_memories')
    op.drop_index('ix_agent_memories_patient', table_name='agent_memories')
    op.drop_index('ix_agent_memories_kind', table_name='agent_memories')
    op.drop_index('ix_agent_memories_consultation', table_name='agent_memories')
    op.drop_table('agent_memories')
