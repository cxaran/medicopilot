"""allow audio clinical document type

Revision ID: 717157aec8bc
Revises: 8d959cf82c8e
Create Date: 2026-06-28 17:48:03.580032

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '717157aec8bc'
down_revision: Union[str, Sequence[str], None] = '8d959cf82c8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# El tipo de documento es un enum NO-NATIVO (VARCHAR + CHECK). Añadir el valor 'audio'
# (F-MEDIOS fase 2) requiere recrear el CHECK; Alembic no autogenera este cambio. Aditivo:
# no toca filas existentes (todas usan valores ya permitidos).
_CONSTRAINT = "ck_clinical_documents_clinical_document_type"
_TABLE = "clinical_documents"
_VALUES_WITH_AUDIO = (
    "laboratory", "study", "image", "pdf", "external_prescription",
    "clinical_photography", "consent", "reference", "audio", "other",
)
_VALUES_WITHOUT_AUDIO = tuple(v for v in _VALUES_WITH_AUDIO if v != "audio")


def _in_clause(values: tuple[str, ...]) -> str:
    joined = ", ".join(f"'{v}'" for v in values)
    return f"document_type IN ({joined})"


def _recreate_check(values: tuple[str, ...]) -> None:
    # SQL crudo a propósito: ``op.drop_constraint``/``create_check_constraint`` re-aplican la
    # NAMING_CONVENTION al nombre ya canónico y lo duplican. Aquí el nombre es literal.
    op.execute(f"ALTER TABLE {_TABLE} DROP CONSTRAINT {_CONSTRAINT}")
    op.execute(
        f"ALTER TABLE {_TABLE} ADD CONSTRAINT {_CONSTRAINT} CHECK ({_in_clause(values)})"
    )


def upgrade() -> None:
    """Upgrade schema."""
    _recreate_check(_VALUES_WITH_AUDIO)


def downgrade() -> None:
    """Downgrade schema."""
    _recreate_check(_VALUES_WITHOUT_AUDIO)
