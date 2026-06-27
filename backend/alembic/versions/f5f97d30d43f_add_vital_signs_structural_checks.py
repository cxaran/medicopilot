"""add vital signs structural checks

Revision ID: f5f97d30d43f
Revises: b8d7a1e61ef3
Create Date: 2026-06-26 22:12:57.283455

Agrega los CHECK constraints estructurales de ``vital_signs`` (valores positivos,
emparejamiento y orden de presión arterial, rango de saturación y no-negatividad
de glucosa). El CHECK de ``pain_scale`` ya existe en la baseline. Alembic no
autodetecta ``CheckConstraint``, por eso se escriben a mano.

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f5f97d30d43f'
down_revision: Union[str, Sequence[str], None] = 'b8d7a1e61ef3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (nombre corto de la constraint, condición). La naming convention antepone
# ``ck_vital_signs_`` para igualar lo que produce ``create_all`` desde el modelo.
_CHECKS: tuple[tuple[str, str], ...] = (
    ("weight_positive", "weight_kg IS NULL OR weight_kg > 0"),
    ("height_positive", "height_cm IS NULL OR height_cm > 0"),
    ("temperature_positive", "temperature_c IS NULL OR temperature_c > 0"),
    ("heart_rate_positive", "heart_rate_bpm IS NULL OR heart_rate_bpm > 0"),
    (
        "respiratory_rate_positive",
        "respiratory_rate_rpm IS NULL OR respiratory_rate_rpm > 0",
    ),
    (
        "blood_pressure",
        "(systolic_bp IS NULL AND diastolic_bp IS NULL)"
        " OR (systolic_bp IS NOT NULL AND diastolic_bp IS NOT NULL"
        " AND systolic_bp >= diastolic_bp)",
    ),
    (
        "oxygen_saturation_range",
        "oxygen_saturation IS NULL"
        " OR (oxygen_saturation >= 0 AND oxygen_saturation <= 100)",
    ),
    (
        "capillary_glucose_non_negative",
        "capillary_glucose IS NULL OR capillary_glucose >= 0",
    ),
)


def upgrade() -> None:
    """Upgrade schema."""
    for name, condition in _CHECKS:
        op.create_check_constraint(name, "vital_signs", condition)


def downgrade() -> None:
    """Downgrade schema."""
    for name, _condition in reversed(_CHECKS):
        op.drop_constraint(
            op.f(f"ck_vital_signs_{name}"), "vital_signs", type_="check"
        )
