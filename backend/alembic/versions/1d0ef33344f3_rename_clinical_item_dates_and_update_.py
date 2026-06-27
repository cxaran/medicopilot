"""rename clinical item dates and update severity values

Revision ID: 1d0ef33344f3
Revises: 6dafd4d73445
Create Date: 2026-06-26 21:22:13.325302

Renombra ``started_at``/``ended_at`` a ``started_on``/``ended_on`` en
``patient_clinical_items`` y reemplaza los valores del enum no-nativo
``clinical_severity`` (``mild/moderate/severe/critical`` -> ``low/moderate/high/critical``),
lo que implica recrear su CHECK constraint. Alembic no detecta cambios de contenido
en CHECK de enums no-nativos ni renombres de columna, por eso se escriben a mano.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d0ef33344f3'
down_revision: Union[str, Sequence[str], None] = '6dafd4d73445'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_SEVERITY_CHECK = "ck_patient_clinical_items_clinical_severity"
_NEW_SEVERITY = ("low", "moderate", "high", "critical")
_OLD_SEVERITY = ("mild", "moderate", "severe", "critical")


def _severity_condition(values: tuple[str, ...]) -> str:
    options = ", ".join(f"'{value}'" for value in values)
    return f"severity IN ({options})"


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "patient_clinical_items",
        "started_at",
        new_column_name="started_on",
    )
    op.alter_column(
        "patient_clinical_items",
        "ended_at",
        new_column_name="ended_on",
    )
    # El enum no-nativo materializa un CHECK; cambiar los valores requiere recrearlo.
    op.drop_constraint(op.f(_SEVERITY_CHECK), "patient_clinical_items", type_="check")
    op.create_check_constraint(
        op.f(_SEVERITY_CHECK),
        "patient_clinical_items",
        _severity_condition(_NEW_SEVERITY),
    )
    op.alter_column(
        "patient_clinical_items",
        "severity",
        existing_type=sa.VARCHAR(length=8),
        comment="Severidad baja, moderada, alta o crítica, si aplica.",
        existing_comment="Severidad leve, moderada, grave o crítica, si aplica.",
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "patient_clinical_items",
        "severity",
        existing_type=sa.VARCHAR(length=8),
        comment="Severidad leve, moderada, grave o crítica, si aplica.",
        existing_comment="Severidad baja, moderada, alta o crítica, si aplica.",
        existing_nullable=True,
    )
    op.drop_constraint(op.f(_SEVERITY_CHECK), "patient_clinical_items", type_="check")
    op.create_check_constraint(
        op.f(_SEVERITY_CHECK),
        "patient_clinical_items",
        _severity_condition(_OLD_SEVERITY),
    )
    op.alter_column(
        "patient_clinical_items",
        "ended_on",
        new_column_name="ended_at",
    )
    op.alter_column(
        "patient_clinical_items",
        "started_on",
        new_column_name="started_at",
    )
