"""add referral kinds to clinical_note_kind check

Revision ID: f0710da0bf95
Revises: 2cc000bd2f14
Create Date: 2026-06-28 19:16:58.552102

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f0710da0bf95'
down_revision: Union[str, Sequence[str], None] = '2cc000bd2f14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum NO-NATIVO ``clinical_note_kind`` (se materializa como VARCHAR + CHECK). Agregar VALORES
# a un enum existente NO lo autogenera Alembic, y además el enum no-nativo dimensiona el VARCHAR
# al valor más largo: 'contrarreferencia' (17) excede 'incapacidad' (11). Por eso, a mano:
#   1) se DROP el CHECK, 2) se ENSANCHA la columna a VARCHAR(17), 3) se re-crea el CHECK con los
# nuevos valores. SQL crudo con el nombre literal de la convención (ck_<tabla>_<nombre del enum>)
# para que la NAMING_CONVENTION no lo re-plantille. Patrón análogo al alta de 'audio'.
_CONSTRAINT = "ck_clinical_notes_clinical_note_kind"
_OLD_KINDS = ("nota_soap", "constancia", "incapacidad")
_NEW_KINDS = ("nota_soap", "constancia", "incapacidad", "referencia", "contrarreferencia")


def _migrate(values: tuple[str, ...]) -> None:
    width = max(len(v) for v in values)
    in_list = ", ".join(f"'{v}'" for v in values)
    op.execute(f"ALTER TABLE clinical_notes DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(f"ALTER TABLE clinical_notes ALTER COLUMN kind TYPE VARCHAR({width})")
    op.execute(
        f"ALTER TABLE clinical_notes ADD CONSTRAINT {_CONSTRAINT} "
        f"CHECK (kind IN ({in_list}))"
    )


def upgrade() -> None:
    """Agrega 'referencia' y 'contrarreferencia' al enum clinical_note_kind."""
    _migrate(_NEW_KINDS)


def downgrade() -> None:
    """Restaura el enum a los tres tipos previos (requiere que no haya filtros de los nuevos)."""
    _migrate(_OLD_KINDS)
