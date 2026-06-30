"""appointment: fecha obligatoria, hora opcional

Revierte la alineación de ``9c1f4d7b2a06`` (que había fusionado fecha+hora en un único
``scheduled_at`` timestamp obligatorio) para reflejar el dominio real: una cita se agenda
por FECHA (obligatoria) y la HORA es opcional — muchas veces el médico cita "tal día" y el
paciente acude dentro del horario de consulta, sin hora concreta.

- ``scheduled_at`` (timestamp NOT NULL) -> ``scheduled_date`` (date NOT NULL) +
  ``scheduled_time`` (time NULL). Las filas existentes conservan su día y su hora
  (backfill ``scheduled_at::date`` / ``scheduled_at::time``).
- ``duration_minutes`` pasa a NULLABLE (sólo aplica cuando hay hora concreta); su CHECK se
  reescribe para admitir NULL.
- La restricción de exclusión GiST de no-traslape se rehace para aplicar SÓLO a citas CON
  hora concreta (``scheduled_time``/``duration_minutes`` no nulos): dos citas sin hora el
  mismo día son normales. El instante se compone como ``scheduled_date + scheduled_time``.
- Índices: ``ix_appointments_scheduled_at`` -> ``ix_appointments_scheduled_date`` +
  ``ix_appointments_doctor_date``.

Revision ID: a2f3c1d4e5b6
Revises: 91a7375c266c
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2f3c1d4e5b6"
down_revision: Union[str, Sequence[str], None] = "91a7375c266c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_EXCLUDE = "excl_appointments_doctor_no_overlap"

# Exclusión NUEVA: sólo citas activas CON hora concreta (y duración) del mismo médico no
# pueden solaparse. El instante se compone como date + time (= timestamp en PostgreSQL).
_EXCLUDE_DDL_NEW = (
    f"ALTER TABLE appointments ADD CONSTRAINT {_EXCLUDE} "
    "EXCLUDE USING gist ("
    "doctor_id WITH =, "
    "tsrange("
    "(scheduled_date + scheduled_time), "
    "(scheduled_date + scheduled_time) + make_interval(mins => duration_minutes), "
    "'[)') WITH &&"
    ") WHERE ("
    "status IN ('pending', 'confirmed') AND deleted_at IS NULL "
    "AND scheduled_time IS NOT NULL AND duration_minutes IS NOT NULL"
    ")"
)

# Exclusión ANTERIOR (la de 9c1f4d7b2a06), basada en ``scheduled_at``.
_EXCLUDE_DDL_OLD = (
    f"ALTER TABLE appointments ADD CONSTRAINT {_EXCLUDE} "
    "EXCLUDE USING gist ("
    "doctor_id WITH =, "
    "tsrange(scheduled_at, scheduled_at + make_interval(mins => duration_minutes), '[)') WITH &&"
    ") WHERE (status IN ('pending', 'confirmed') AND deleted_at IS NULL)"
)

_DURATION_CHECK = "ck_appointments_duration_minutes_range"


def upgrade() -> None:
    """Upgrade schema."""
    # --- quitar exclusión y dependencias del antiguo scheduled_at ---
    op.execute(f"ALTER TABLE appointments DROP CONSTRAINT IF EXISTS {_EXCLUDE}")
    op.drop_index("ix_appointments_scheduled_at", table_name="appointments")

    # --- nuevas columnas de fecha/hora (con backfill desde scheduled_at) ---
    op.add_column(
        "appointments",
        sa.Column(
            "scheduled_date",
            sa.Date(),
            nullable=True,  # temporal: se backfillea y luego se vuelve NOT NULL
            comment="Fecha programada de la cita (obligatoria).",
        ),
    )
    op.add_column(
        "appointments",
        sa.Column(
            "scheduled_time",
            sa.Time(),
            nullable=True,
            comment=(
                "Hora programada de la cita. Puede omitirse cuando el paciente acudirá "
                "dentro del horario de consulta sin una hora concreta."
            ),
        ),
    )
    # Las filas existentes conservan su día y su hora.
    op.execute(
        "UPDATE appointments SET "
        "scheduled_date = scheduled_at::date, "
        "scheduled_time = scheduled_at::time"
    )
    op.alter_column("appointments", "scheduled_date", existing_type=sa.Date(), nullable=False)

    # --- duración: pasa a NULLABLE y su CHECK admite NULL ---
    op.drop_constraint(op.f(_DURATION_CHECK), "appointments", type_="check")
    op.alter_column(
        "appointments",
        "duration_minutes",
        existing_type=sa.Integer(),
        nullable=True,
        comment=(
            "Duración estimada de la cita en minutos (entre 5 y 480). Sólo aplica cuando "
            "hay hora concreta; nula para citas sin hora."
        ),
        existing_comment="Duración estimada de la cita en minutos (entre 5 y 480).",
    )
    op.create_check_constraint(
        op.f(_DURATION_CHECK),
        "appointments",
        "duration_minutes IS NULL OR (duration_minutes >= 5 AND duration_minutes <= 480)",
    )

    # --- quitar scheduled_at e índices/exclusión nueva ---
    op.drop_column("appointments", "scheduled_at")
    op.create_index(
        "ix_appointments_scheduled_date", "appointments", ["scheduled_date"], unique=False
    )
    op.create_index(
        "ix_appointments_doctor_date", "appointments", ["doctor_id", "scheduled_date"], unique=False
    )
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(_EXCLUDE_DDL_NEW)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(f"ALTER TABLE appointments DROP CONSTRAINT IF EXISTS {_EXCLUDE}")
    op.drop_index("ix_appointments_doctor_date", table_name="appointments")
    op.drop_index("ix_appointments_scheduled_date", table_name="appointments")

    # --- restaurar scheduled_at (backfill desde date + time; medianoche si no había hora) ---
    op.add_column(
        "appointments",
        sa.Column(
            "scheduled_at",
            sa.DateTime(),
            nullable=True,
            comment="Fecha y hora programada de la cita.",
        ),
    )
    op.execute(
        "UPDATE appointments SET "
        "scheduled_at = (scheduled_date + COALESCE(scheduled_time, '00:00'::time))"
    )
    op.alter_column("appointments", "scheduled_at", existing_type=sa.DateTime(), nullable=False)
    op.create_index(
        "ix_appointments_scheduled_at", "appointments", ["scheduled_at"], unique=False
    )

    # --- duración: vuelve a NOT NULL (las nulas se rellenan a 30 min por defecto) ---
    op.execute("UPDATE appointments SET duration_minutes = 30 WHERE duration_minutes IS NULL")
    op.drop_constraint(op.f(_DURATION_CHECK), "appointments", type_="check")
    op.alter_column(
        "appointments",
        "duration_minutes",
        existing_type=sa.Integer(),
        nullable=False,
        comment="Duración estimada de la cita en minutos (entre 5 y 480).",
        existing_comment=(
            "Duración estimada de la cita en minutos (entre 5 y 480). Sólo aplica cuando "
            "hay hora concreta; nula para citas sin hora."
        ),
    )
    op.create_check_constraint(
        op.f(_DURATION_CHECK),
        "appointments",
        "duration_minutes >= 5 AND duration_minutes <= 480",
    )

    # --- quitar columnas de fecha/hora y restaurar la exclusión anterior ---
    op.drop_column("appointments", "scheduled_time")
    op.drop_column("appointments", "scheduled_date")
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(_EXCLUDE_DDL_OLD)
