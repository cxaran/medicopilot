"""add system settings singleton and onboarding state

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-02 23:59:00.000000

Crea el singleton system_settings (política del sistema editable en runtime) y lo
SIEMBRA importando UNA sola vez el valor vigente de REGISTRATION_ENABLED del entorno
(a partir de aquí la base de datos es la fuente de verdad de esa política). Añade
platform_setup.onboarding_dismissed_at y lo backfillea NO nulo para instalaciones ya
completadas (a un despliegue que ya opera no se le muestra el checklist inicial).
"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _env_registration_enabled() -> bool:
    raw = os.environ.get("REGISTRATION_ENABLED", "false").strip().lower()
    return raw in ("1", "true", "yes", "on")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'system_settings',
        sa.Column('id', PG_UUID(as_uuid=True), nullable=False),
        sa.Column('singleton_key', sa.Boolean(), nullable=False, comment='Siempre true: fuerza una sola fila de configuración del sistema.'),
        sa.Column('public_registration_enabled', sa.Boolean(), nullable=False, comment='Política de registro público (auto-registro por correo). Efectiva sólo si el despliegue lo permite (gate REGISTRATION_ALLOWED del entorno).'),
        sa.Column('app_base_url', sa.String(length=255), nullable=True, comment='Dominio base confirmado de la instalación (https://…), usado para calcular redirect URIs. Se AÑADE a los orígenes confiables del entorno, nunca los reemplaza.'),
        sa.Column('app_base_url_verified_at', sa.DateTime(), nullable=True, comment='Momento (UTC) en que el dominio base se verificó; lo escribe el backend.'),
        sa.Column('institution_name', sa.String(length=200), nullable=True, comment='Nombre del consultorio/institución (membrete y encabezados).'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by', PG_UUID(as_uuid=True), nullable=True, comment='Último administrador que modificó la configuración.'),
        sa.CheckConstraint('singleton_key = true', name=op.f('ck_system_settings_system_settings_singleton')),
        sa.ForeignKeyConstraint(['updated_by'], ['user.id'], name=op.f('fk_system_settings_updated_by_user'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_system_settings')),
        sa.UniqueConstraint('singleton_key', name=op.f('uq_system_settings_singleton_key')),
    )

    # Siembra del singleton: importa la política vigente del entorno UNA sola vez.
    registration = 'true' if _env_registration_enabled() else 'false'
    op.execute(
        "INSERT INTO system_settings (id, singleton_key, public_registration_enabled) "
        f"VALUES (gen_random_uuid(), true, {registration})"
    )

    op.add_column(
        'platform_setup',
        sa.Column(
            'onboarding_dismissed_at',
            sa.DateTime(),
            nullable=True,
            comment='Momento (UTC) en que el administrador descartó el checklist de configuración post-bootstrap (el checklist en sí es DERIVADO del estado real, nunca persiste progreso propio).',
        ),
    )
    # Instalaciones que ya operan: no mostrarles el checklist inicial.
    op.execute(
        "UPDATE platform_setup SET onboarding_dismissed_at = now() "
        "WHERE status = 'completed'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('platform_setup', 'onboarding_dismissed_at')
    op.drop_table('system_settings')
