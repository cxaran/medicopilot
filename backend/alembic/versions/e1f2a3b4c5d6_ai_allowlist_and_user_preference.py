"""allowlist de proveedores de IA y preferencia por usuario

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-03 18:00:00.000000

Slice de IA (regla del producto: SIN IA por defecto — la instalación no trae
proveedores preconfigurados ni credenciales compartidas; cada usuario aporta las
suyas y la institución no asume costos de modelos):

- system_settings.enabled_ai_providers: allowlist GLOBAL de proveedores permitidos
  (política de datos del administrador). Default: todos los del catálogo — permitir
  no cuesta nada; usar exige credencial personal.
- agent_personas.preferred_provider/preferred_model: la preferencia del usuario deja
  el localStorage (se perdía por dispositivo) y persiste en su fila de persona.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALL_PROVIDERS = '["opencode_zen", "opencode_go", "openai", "anthropic", "gemini", "openrouter", "ollama"]'


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'system_settings',
        sa.Column(
            'enabled_ai_providers',
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), 'sqlite'),
            nullable=False,
            server_default=_ALL_PROVIDERS,
            comment='Allowlist GLOBAL de proveedores de IA permitidos (política del administrador). Permitir no cuesta: usar exige credencial PERSONAL del usuario.',
        ),
    )
    op.add_column('agent_personas', sa.Column('preferred_provider', sa.String(length=40), nullable=True, comment='Proveedor de IA preferido del usuario (sus credenciales, su costo).'))
    op.add_column('agent_personas', sa.Column('preferred_model', sa.String(length=160), nullable=True, comment='Modelo preferido del usuario dentro de su proveedor.'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('agent_personas', 'preferred_model')
    op.drop_column('agent_personas', 'preferred_provider')
    op.drop_column('system_settings', 'enabled_ai_providers')
