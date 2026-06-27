"""align medical history versions with versioning rules

Revision ID: c73fd842385b
Revises: 1d0ef33344f3
Create Date: 2026-06-26 21:39:07.521522

Alinea ``medical_history_versions`` con las reglas del recurso: agrega
``based_on_version_id`` (auto-FK a la versión vigente de origen), renombra
``relevant_habits_notes`` a ``relevant_habits``, retira ``change_reason`` (no
forma parte del modelo acordado) y añade el índice parcial único que garantiza a
lo sumo un borrador no eliminado por paciente (el de ``current`` ya existe en la
baseline). Alembic no detecta renombres de columna, por eso se escribe a mano.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c73fd842385b'
down_revision: Union[str, Sequence[str], None] = '1d0ef33344f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_BASED_ON_FK = "fk_medical_history_versions_based_on_version_id_medical_history_versions"
_RELEVANT_HABITS_OLD_COMMENT = (
    "Narrativa adicional sobre hábitos. El resumen vigente vive en patient_clinical_items."
)
_RELEVANT_HABITS_NEW_COMMENT = (
    "Hábitos relevantes (narrativa). El resumen vigente vive en patient_clinical_items."
)
_DRAFT_INDEX = "uq_medical_history_versions_draft_patient"
_DRAFT_WHERE = "status = 'draft' AND deleted_at IS NULL"


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "medical_history_versions",
        "relevant_habits_notes",
        new_column_name="relevant_habits",
        existing_type=sa.Text(),
        comment=_RELEVANT_HABITS_NEW_COMMENT,
        existing_comment=_RELEVANT_HABITS_OLD_COMMENT,
        existing_nullable=True,
    )
    op.drop_column("medical_history_versions", "change_reason")
    op.add_column(
        "medical_history_versions",
        sa.Column(
            "based_on_version_id",
            sa.UUID(),
            nullable=True,
            comment="Versión vigente desde la cual nació este borrador; nulo sólo en la primera versión.",
        ),
    )
    op.create_index(
        "ix_medical_history_versions_based_on",
        "medical_history_versions",
        ["based_on_version_id"],
        unique=False,
    )
    op.create_index(
        _DRAFT_INDEX,
        "medical_history_versions",
        ["patient_id"],
        unique=True,
        postgresql_where=sa.text(_DRAFT_WHERE),
    )
    op.create_foreign_key(
        op.f(_BASED_ON_FK),
        "medical_history_versions",
        "medical_history_versions",
        ["based_on_version_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f(_BASED_ON_FK), "medical_history_versions", type_="foreignkey"
    )
    op.drop_index(
        _DRAFT_INDEX,
        table_name="medical_history_versions",
        postgresql_where=sa.text(_DRAFT_WHERE),
    )
    op.drop_index(
        "ix_medical_history_versions_based_on", table_name="medical_history_versions"
    )
    op.drop_column("medical_history_versions", "based_on_version_id")
    op.add_column(
        "medical_history_versions",
        sa.Column(
            "change_reason",
            sa.TEXT(),
            autoincrement=False,
            nullable=True,
            comment="Motivo de creación o actualización de la versión.",
        ),
    )
    op.alter_column(
        "medical_history_versions",
        "relevant_habits",
        new_column_name="relevant_habits_notes",
        existing_type=sa.Text(),
        comment=_RELEVANT_HABITS_OLD_COMMENT,
        existing_comment=_RELEVANT_HABITS_NEW_COMMENT,
        existing_nullable=True,
    )
