"""align consultations with clinical note rules

Revision ID: b8d7a1e61ef3
Revises: c73fd842385b
Create Date: 2026-06-26 21:58:13.496618

Alinea ``consultations`` con la nota clínica de esta fase: retira ``appointment_id``
(su FK y unique) porque las citas vendrán como módulo propio, hace obligatorio
``reason_for_visit``, reduce el enum ``consultation_status`` a ``draft/finalized``
(recreando su CHECK) y agrega los CHECK de coherencia de finalización y de orden de
fechas. Alembic no detecta cambios de contenido en CHECK de enums no-nativos ni
``CheckConstraint`` declarados, por eso se escriben a mano.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d7a1e61ef3'
down_revision: Union[str, Sequence[str], None] = 'c73fd842385b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_STATUS_CHECK = "ck_consultations_consultation_status"
_FINALIZATION_CHECK = "ck_consultations_finalization_state"
_NEXT_APPOINTMENT_CHECK = "ck_consultations_next_appointment_after_consulted"

_STATUS_NEW = "status IN ('draft', 'finalized')"
_STATUS_OLD = "status IN ('draft', 'finalized', 'cancelled')"
_FINALIZATION_CONDITION = (
    "(status = 'draft' AND finalized_by_doctor_id IS NULL AND finalized_at IS NULL)"
    " OR (status = 'finalized' AND finalized_by_doctor_id IS NOT NULL"
    " AND finalized_at IS NOT NULL"
    " AND finalized_by_doctor_id = attending_doctor_id)"
)
_NEXT_APPOINTMENT_CONDITION = (
    "next_appointment_at IS NULL OR next_appointment_at >= consulted_at"
)


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "consultations",
        "reason_for_visit",
        existing_type=sa.TEXT(),
        nullable=False,
        existing_comment="Motivo de consulta.",
    )
    op.alter_column(
        "consultations",
        "status",
        existing_type=sa.VARCHAR(length=9),
        comment="Estado de la consulta: borrador o finalizada.",
        existing_comment="Estado de la consulta: borrador, finalizada o cancelada.",
        existing_nullable=False,
    )
    op.drop_constraint(op.f("uq_consultations_appointment_id"), "consultations", type_="unique")
    op.drop_constraint(
        op.f("fk_consultations_appointment_id_appointments"),
        "consultations",
        type_="foreignkey",
    )
    op.drop_column("consultations", "appointment_id")

    # El enum no-nativo materializa un CHECK; reducir sus valores requiere recrearlo.
    op.drop_constraint(op.f(_STATUS_CHECK), "consultations", type_="check")
    op.create_check_constraint(op.f(_STATUS_CHECK), "consultations", _STATUS_NEW)
    # Coherencia estado/finalización y orden de fechas (no autodetectables).
    op.create_check_constraint(
        op.f(_FINALIZATION_CHECK), "consultations", _FINALIZATION_CONDITION
    )
    op.create_check_constraint(
        op.f(_NEXT_APPOINTMENT_CHECK), "consultations", _NEXT_APPOINTMENT_CONDITION
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f(_NEXT_APPOINTMENT_CHECK), "consultations", type_="check")
    op.drop_constraint(op.f(_FINALIZATION_CHECK), "consultations", type_="check")
    op.drop_constraint(op.f(_STATUS_CHECK), "consultations", type_="check")
    op.create_check_constraint(op.f(_STATUS_CHECK), "consultations", _STATUS_OLD)

    op.add_column(
        "consultations",
        sa.Column(
            "appointment_id",
            sa.UUID(),
            autoincrement=False,
            nullable=True,
            comment="Cita de origen, si la consulta deriva de una cita agendada.",
        ),
    )
    op.create_foreign_key(
        op.f("fk_consultations_appointment_id_appointments"),
        "consultations",
        "appointments",
        ["appointment_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        op.f("uq_consultations_appointment_id"),
        "consultations",
        ["appointment_id"],
        postgresql_nulls_not_distinct=False,
    )
    op.alter_column(
        "consultations",
        "status",
        existing_type=sa.VARCHAR(length=9),
        comment="Estado de la consulta: borrador, finalizada o cancelada.",
        existing_comment="Estado de la consulta: borrador o finalizada.",
        existing_nullable=False,
    )
    op.alter_column(
        "consultations",
        "reason_for_visit",
        existing_type=sa.TEXT(),
        nullable=True,
        existing_comment="Motivo de consulta.",
    )
