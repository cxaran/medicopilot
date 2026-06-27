"""align prescriptions with lifecycle

Reconcilia las tablas baseline ``prescriptions`` y ``prescription_items`` con el
módulo de recetas:

- ``internal_folio`` pasa de ``String(80)`` a ``BigInteger`` con ``Identity`` (folio
  consecutivo generado por la base de datos).
- ``related_diagnosis_id`` gana FK a ``consultation_diagnoses`` (mismo expediente).
- se elimina ``issued_at`` (no forma parte del ciclo draft/approved/voided).
- se añaden los CHECK de coherencia de estado y de baja lógica sólo en borrador.
- ``prescription_items`` pierde ``medication_template_id`` (las plantillas son un
  módulo diferido).

Revision ID: 7a3c9f2b1e84
Revises: 2e8cb54d1a52
Create Date: 2026-06-26 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a3c9f2b1e84'
down_revision: Union[str, Sequence[str], None] = '2e8cb54d1a52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Coherencia de estado de la receta (idéntica al modelo): borrador sin datos de
# aprobación/anulación; aprobada con datos de aprobación y snapshot; anulada además
# con datos de anulación.
_STATUS_STATE = (
    "(status = 'draft'"
    " AND approved_by_doctor_id IS NULL AND approved_at IS NULL"
    " AND doctor_snapshot IS NULL"
    " AND voided_by_doctor_id IS NULL AND voided_at IS NULL"
    " AND void_reason IS NULL)"
    " OR (status = 'approved'"
    " AND approved_by_doctor_id IS NOT NULL AND approved_at IS NOT NULL"
    " AND doctor_snapshot IS NOT NULL"
    " AND voided_by_doctor_id IS NULL AND voided_at IS NULL"
    " AND void_reason IS NULL)"
    " OR (status = 'voided'"
    " AND approved_by_doctor_id IS NOT NULL AND approved_at IS NOT NULL"
    " AND doctor_snapshot IS NOT NULL"
    " AND voided_by_doctor_id IS NOT NULL AND voided_at IS NOT NULL"
    " AND void_reason IS NOT NULL)"
)


def upgrade() -> None:
    """Upgrade schema."""
    # --- prescriptions: internal_folio String(80) -> BigInteger Identity ---
    op.drop_constraint(
        op.f('uq_prescriptions_internal_folio'), 'prescriptions', type_='unique'
    )
    op.drop_column('prescriptions', 'internal_folio')
    op.add_column(
        'prescriptions',
        sa.Column(
            'internal_folio',
            sa.BigInteger(),
            sa.Identity(always=False),
            nullable=False,
            comment='Folio interno consecutivo, generado por la base de datos.',
        ),
    )
    op.create_unique_constraint(
        op.f('uq_prescriptions_internal_folio'), 'prescriptions', ['internal_folio']
    )

    # --- prescriptions: related_diagnosis_id ahora con FK a consultation_diagnoses ---
    op.alter_column(
        'prescriptions',
        'related_diagnosis_id',
        existing_type=sa.UUID(),
        existing_nullable=True,
        comment='Diagnóstico relacionado, opcional; debe pertenecer a la misma consulta.',
        existing_comment=(
            'Diagnóstico relacionado, opcional. Se vinculará cuando exista el modelo'
            ' de diagnósticos.'
        ),
    )
    op.create_foreign_key(
        op.f('fk_prescriptions_related_diagnosis_id_consultation_diagnoses'),
        'prescriptions',
        'consultation_diagnoses',
        ['related_diagnosis_id'],
        ['id'],
        ondelete='RESTRICT',
    )

    # --- prescriptions: eliminar issued_at (fuera del ciclo de vida) ---
    op.drop_index('ix_prescriptions_issued_at', table_name='prescriptions')
    op.drop_column('prescriptions', 'issued_at')

    # --- prescriptions: CHECK de coherencia (Alembic no los autodetecta) ---
    op.create_check_constraint(
        op.f('ck_prescriptions_prescription_status_state'), 'prescriptions', _STATUS_STATE
    )
    op.create_check_constraint(
        op.f('ck_prescriptions_prescription_deleted_only_draft'),
        'prescriptions',
        "deleted_at IS NULL OR status = 'draft'",
    )

    # --- prescription_items: eliminar medication_template_id (plantillas diferidas) ---
    op.drop_index(
        'ix_prescription_items_medication_template', table_name='prescription_items'
    )
    op.drop_constraint(
        op.f('fk_prescription_items_medication_template_id_medication_templates'),
        'prescription_items',
        type_='foreignkey',
    )
    op.drop_column('prescription_items', 'medication_template_id')


def downgrade() -> None:
    """Downgrade schema."""
    # --- prescription_items: restaurar medication_template_id ---
    op.add_column(
        'prescription_items',
        sa.Column(
            'medication_template_id',
            sa.UUID(),
            nullable=True,
            comment=(
                'Plantilla de medicamento usada, opcional. La receta copia los textos'
                ' y no depende de la plantilla después de emitirse.'
            ),
        ),
    )
    op.create_foreign_key(
        op.f('fk_prescription_items_medication_template_id_medication_templates'),
        'prescription_items',
        'medication_templates',
        ['medication_template_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.create_index(
        'ix_prescription_items_medication_template',
        'prescription_items',
        ['medication_template_id'],
        unique=False,
    )

    # --- prescriptions: quitar CHECK de coherencia ---
    op.drop_constraint(
        op.f('ck_prescriptions_prescription_deleted_only_draft'),
        'prescriptions',
        type_='check',
    )
    op.drop_constraint(
        op.f('ck_prescriptions_prescription_status_state'),
        'prescriptions',
        type_='check',
    )

    # --- prescriptions: restaurar issued_at ---
    op.add_column(
        'prescriptions',
        sa.Column(
            'issued_at',
            sa.DateTime(),
            nullable=True,
            comment='Fecha de emisión de la receta.',
        ),
    )
    op.create_index(
        'ix_prescriptions_issued_at', 'prescriptions', ['issued_at'], unique=False
    )

    # --- prescriptions: quitar FK related_diagnosis y restaurar comentario ---
    op.drop_constraint(
        op.f('fk_prescriptions_related_diagnosis_id_consultation_diagnoses'),
        'prescriptions',
        type_='foreignkey',
    )
    op.alter_column(
        'prescriptions',
        'related_diagnosis_id',
        existing_type=sa.UUID(),
        existing_nullable=True,
        comment=(
            'Diagnóstico relacionado, opcional. Se vinculará cuando exista el modelo'
            ' de diagnósticos.'
        ),
        existing_comment='Diagnóstico relacionado, opcional; debe pertenecer a la misma consulta.',
    )

    # --- prescriptions: internal_folio BigInteger Identity -> String(80) ---
    op.drop_constraint(
        op.f('uq_prescriptions_internal_folio'), 'prescriptions', type_='unique'
    )
    op.drop_column('prescriptions', 'internal_folio')
    op.add_column(
        'prescriptions',
        sa.Column(
            'internal_folio',
            sa.String(length=80),
            nullable=False,
            comment='Folio interno único de la receta.',
        ),
    )
    op.create_unique_constraint(
        op.f('uq_prescriptions_internal_folio'), 'prescriptions', ['internal_folio']
    )
