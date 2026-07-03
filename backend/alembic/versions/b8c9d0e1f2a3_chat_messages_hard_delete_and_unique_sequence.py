"""chat: mensajes con borrado físico y orden único por conversación

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-03 05:20:00.000000

Decisión 2026-07-03: el historial del chat NO es expediente — limpiar/reiniciar un hilo elimina
las filas de verdad. Se purgan los mensajes ya eliminados lógicamente y se quitan las columnas
de soft-delete de ``messages``. Además se cierra la carrera del orden del hilo: se RE-SECUENCIAN
los mensajes vigentes por conversación (elimina duplicados/huecos históricos del cálculo MAX+1
sobre vigentes) y se impone la restricción única ``(conversation_id, sequence_index)`` (que
reemplaza al índice compuesto: el índice único ya cubre esas consultas).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1) Purga física de los mensajes ya eliminados lógicamente (el chat no es expediente).
    op.execute(sa.text("DELETE FROM messages WHERE deleted_at IS NOT NULL"))

    # 2) Re-secuenciado determinista por conversación: garantiza unicidad ANTES de imponer la
    #    restricción (el MAX+1 histórico sobre vigentes pudo duplicar índices tras resets
    #    parciales o appends concurrentes). Orden estable: índice previo, luego llegada.
    op.execute(
        sa.text(
            """
            UPDATE messages
            SET sequence_index = renumbered.new_index
            FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY conversation_id
                           ORDER BY sequence_index, created_at, id
                       ) - 1 AS new_index
                FROM messages
            ) AS renumbered
            WHERE messages.id = renumbered.id
              AND messages.sequence_index IS DISTINCT FROM renumbered.new_index
            """
        )
    )

    # 3) Fuera el soft-delete de mensajes (las FK dependientes caen con la columna).
    op.drop_column('messages', 'deleted_by')
    op.drop_column('messages', 'deleted_at')

    # 4) Orden único del hilo: el índice compuesto se reemplaza por la restricción única
    #    (su índice único sirve para las mismas consultas por conversación+orden).
    op.drop_index('ix_messages_conversation_sequence', table_name='messages')
    op.create_unique_constraint(
        'uq_messages_conversation_sequence', 'messages', ['conversation_id', 'sequence_index']
    )


def downgrade() -> None:
    """Downgrade schema (no restaura los mensajes purgados)."""
    op.drop_constraint('uq_messages_conversation_sequence', 'messages', type_='unique')
    op.create_index(
        'ix_messages_conversation_sequence',
        'messages',
        ['conversation_id', 'sequence_index'],
        unique=False,
    )
    op.add_column(
        'messages',
        sa.Column(
            'deleted_at',
            sa.DateTime(),
            nullable=True,
            comment='Fecha de eliminación lógica del mensaje.',
        ),
    )
    op.add_column(
        'messages',
        sa.Column(
            'deleted_by',
            PG_UUID(as_uuid=True),
            nullable=True,
            comment='Usuario que eliminó lógicamente el mensaje.',
        ),
    )
    op.create_foreign_key(
        op.f('fk_messages_deleted_by_user'),
        'messages',
        'user',
        ['deleted_by'],
        ['id'],
        ondelete='RESTRICT',
    )
