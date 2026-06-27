"""align appointments with scheduling

Reconcilia la tabla baseline ``appointments`` con el módulo de agenda y reintroduce
``consultations.appointment_id``:

- ``scheduled_date``/``scheduled_time`` se sustituyen por ``scheduled_at`` (timestamp).
- ``duration_minutes`` y ``reason`` pasan a obligatorios.
- se eliminan las columnas de cancelación dedicadas (``cancelled_at``,
  ``cancelled_by``, ``cancellation_reason``); el motivo de cancelación vive en
  ``internal_notes`` en esta fase.
- se añaden los CHECK de duración (5..480), motivo no vacío y no auto-referencia de
  ``rescheduled_from_id``.
- se crea la restricción de exclusión GiST que impide traslapes de citas activas del
  mismo médico (requiere ``btree_gist``).
- ``consultations`` recupera ``appointment_id`` (FK nullable + UNIQUE).

Revision ID: 9c1f4d7b2a06
Revises: 7a3c9f2b1e84
Create Date: 2026-06-26 23:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c1f4d7b2a06'
down_revision: Union[str, Sequence[str], None] = '7a3c9f2b1e84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_EXCLUDE = "excl_appointments_doctor_no_overlap"
# Misma definición que el evento DDL del modelo: dos citas activas (pending/confirmed,
# no eliminadas) del mismo médico no pueden solaparse en el tiempo.
_EXCLUDE_DDL = (
    f"ALTER TABLE appointments ADD CONSTRAINT {_EXCLUDE} "
    "EXCLUDE USING gist ("
    "doctor_id WITH =, "
    "tsrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') WITH &&"
    ") WHERE (status IN ('pending', 'confirmed') AND deleted_at IS NULL)"
)


def upgrade() -> None:
    """Upgrade schema."""
    # --- appointments: índices y columnas obsoletas ---
    op.drop_index('ix_appointments_doctor_date_time', table_name='appointments')
    op.drop_index('ix_appointments_scheduled_date', table_name='appointments')
    op.drop_constraint(
        op.f('fk_appointments_cancelled_by_user'), 'appointments', type_='foreignkey'
    )
    op.drop_column('appointments', 'cancellation_reason')
    op.drop_column('appointments', 'cancelled_by')
    op.drop_column('appointments', 'cancelled_at')
    op.drop_column('appointments', 'scheduled_time')
    op.drop_column('appointments', 'scheduled_date')

    # --- appointments: scheduled_at y campos obligatorios ---
    op.add_column(
        'appointments',
        sa.Column(
            'scheduled_at',
            sa.DateTime(),
            nullable=False,
            comment='Fecha y hora programada de la cita.',
        ),
    )
    op.alter_column(
        'appointments',
        'duration_minutes',
        existing_type=sa.Integer(),
        nullable=False,
        comment='Duración estimada de la cita en minutos (entre 5 y 480).',
        existing_comment='Duración estimada de la cita en minutos.',
    )
    op.alter_column(
        'appointments',
        'reason',
        existing_type=sa.Text(),
        nullable=False,
        existing_comment='Motivo de la cita.',
    )
    # Comentarios alineados con el modelo (Alembic sí detecta cambios de comentario).
    op.alter_column(
        'appointments',
        'patient_id',
        existing_type=sa.UUID(),
        existing_nullable=False,
        comment='Paciente con la cita médica (inmutable).',
        existing_comment='Paciente con la cita médica.',
    )
    op.alter_column(
        'appointments',
        'status',
        existing_type=sa.VARCHAR(length=11),
        existing_nullable=False,
        comment='Estado de la cita médica, controlado por acciones explícitas.',
        existing_comment='Estado de la cita médica.',
    )
    op.alter_column(
        'appointments',
        'deleted_at',
        existing_type=sa.DateTime(),
        existing_nullable=True,
        comment='Eliminación lógica, sólo permitida sobre citas pendientes creadas por error.',
        existing_comment='Eliminación lógica, sólo para casos administrativos excepcionales.',
    )
    op.create_index(
        'ix_appointments_scheduled_at', 'appointments', ['scheduled_at'], unique=False
    )

    # --- appointments: CHECK (Alembic no los autodetecta) ---
    op.create_check_constraint(
        op.f('ck_appointments_duration_minutes_range'),
        'appointments',
        'duration_minutes >= 5 AND duration_minutes <= 480',
    )
    op.create_check_constraint(
        op.f('ck_appointments_reason_not_blank'),
        'appointments',
        'length(trim(reason)) > 0',
    )
    op.create_check_constraint(
        op.f('ck_appointments_rescheduled_from_not_self'),
        'appointments',
        'rescheduled_from_id IS NULL OR rescheduled_from_id <> id',
    )

    # --- appointments: agenda sin traslapes (exclusión GiST) ---
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(_EXCLUDE_DDL)

    # --- consultations: reintroducir appointment_id (FK nullable + UNIQUE) ---
    op.add_column(
        'consultations',
        sa.Column(
            'appointment_id',
            sa.UUID(),
            nullable=True,
            comment='Cita de origen, si la consulta deriva de una cita agendada (se asigna sólo al crear).',
        ),
    )
    op.create_foreign_key(
        op.f('fk_consultations_appointment_id_appointments'),
        'consultations',
        'appointments',
        ['appointment_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.create_unique_constraint(
        op.f('uq_consultations_appointment_id'), 'consultations', ['appointment_id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    # --- consultations: quitar appointment_id ---
    op.drop_constraint(
        op.f('uq_consultations_appointment_id'), 'consultations', type_='unique'
    )
    op.drop_constraint(
        op.f('fk_consultations_appointment_id_appointments'),
        'consultations',
        type_='foreignkey',
    )
    op.drop_column('consultations', 'appointment_id')

    # --- appointments: quitar exclusión y CHECK ---
    op.execute(f"ALTER TABLE appointments DROP CONSTRAINT IF EXISTS {_EXCLUDE}")
    op.drop_constraint(
        op.f('ck_appointments_rescheduled_from_not_self'), 'appointments', type_='check'
    )
    op.drop_constraint(
        op.f('ck_appointments_reason_not_blank'), 'appointments', type_='check'
    )
    op.drop_constraint(
        op.f('ck_appointments_duration_minutes_range'), 'appointments', type_='check'
    )
    op.drop_index('ix_appointments_scheduled_at', table_name='appointments')

    # --- appointments: revertir comentarios ---
    op.alter_column(
        'appointments',
        'deleted_at',
        existing_type=sa.DateTime(),
        existing_nullable=True,
        comment='Eliminación lógica, sólo para casos administrativos excepcionales.',
        existing_comment='Eliminación lógica, sólo permitida sobre citas pendientes creadas por error.',
    )
    op.alter_column(
        'appointments',
        'status',
        existing_type=sa.VARCHAR(length=11),
        existing_nullable=False,
        comment='Estado de la cita médica.',
        existing_comment='Estado de la cita médica, controlado por acciones explícitas.',
    )
    op.alter_column(
        'appointments',
        'patient_id',
        existing_type=sa.UUID(),
        existing_nullable=False,
        comment='Paciente con la cita médica.',
        existing_comment='Paciente con la cita médica (inmutable).',
    )

    # --- appointments: revertir campos obligatorios y scheduled_at ---
    op.alter_column(
        'appointments',
        'reason',
        existing_type=sa.Text(),
        nullable=True,
        existing_comment='Motivo de la cita.',
    )
    op.alter_column(
        'appointments',
        'duration_minutes',
        existing_type=sa.Integer(),
        nullable=True,
        comment='Duración estimada de la cita en minutos.',
        existing_comment='Duración estimada de la cita en minutos (entre 5 y 480).',
    )
    op.drop_column('appointments', 'scheduled_at')

    # --- appointments: restaurar columnas baseline ---
    op.add_column(
        'appointments',
        sa.Column(
            'scheduled_date',
            sa.Date(),
            nullable=False,
            comment='Fecha programada de la cita.',
        ),
    )
    op.add_column(
        'appointments',
        sa.Column(
            'scheduled_time',
            sa.Time(),
            nullable=True,
            comment='Hora programada de la cita. Puede omitirse cuando el paciente acudirá dentro del horario de consulta.',
        ),
    )
    op.add_column(
        'appointments',
        sa.Column(
            'cancelled_at',
            sa.DateTime(),
            nullable=True,
            comment='Fecha y hora de cancelación de la cita.',
        ),
    )
    op.add_column(
        'appointments',
        sa.Column(
            'cancelled_by',
            sa.UUID(),
            nullable=True,
            comment='Usuario que canceló la cita.',
        ),
    )
    op.add_column(
        'appointments',
        sa.Column(
            'cancellation_reason',
            sa.Text(),
            nullable=True,
            comment='Motivo de cancelación de la cita.',
        ),
    )
    op.create_foreign_key(
        op.f('fk_appointments_cancelled_by_user'),
        'appointments',
        'user',
        ['cancelled_by'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.create_index(
        'ix_appointments_scheduled_date', 'appointments', ['scheduled_date'], unique=False
    )
    op.create_index(
        'ix_appointments_doctor_date_time',
        'appointments',
        ['doctor_id', 'scheduled_date', 'scheduled_time'],
        unique=False,
    )
