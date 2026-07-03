"""system settings: correo configurable y password reset en base de datos

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-03 12:00:00.000000

Columnas ADITIVAS del slice de correo: transporte configurable (environment/smtp/
resend) con secretos cifrados write-only y estado del último test; y la política de
recuperación de contraseña pasa a la base de datos importando UNA sola vez el valor
vigente de PASSWORD_RESET_ENABLED del entorno (a partir de aquí la DB es la fuente
de verdad, editable por administradores y auditada).
"""
import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _env_password_reset_enabled() -> bool:
    raw = os.environ.get("PASSWORD_RESET_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def upgrade() -> None:
    """Upgrade schema."""
    reset_default = 'true' if _env_password_reset_enabled() else 'false'
    op.add_column('system_settings', sa.Column('password_reset_enabled', sa.Boolean(), nullable=False, server_default=reset_default, comment='Recuperación de contraseña por correo. Sin candado de despliegue (bajo riesgo); apagarla con registro cerrado y un solo admin puede dejar la instalación sin acceso (salida: seed CLI).'))
    op.add_column('system_settings', sa.Column('email_mode', sa.String(length=20), nullable=False, server_default='environment', comment='Transporte de correo: environment (SMTP_* del entorno; Mailpit en dev), smtp (credenciales de esta fila) o resend (API key de esta fila).'))
    op.add_column('system_settings', sa.Column('email_from_address', sa.String(length=255), nullable=True, comment='Remitente para los modos smtp/resend (environment usa SMTP_FROM_*).'))
    op.add_column('system_settings', sa.Column('email_from_name', sa.String(length=120), nullable=True, comment='Nombre visible del remitente (modos smtp/resend).'))
    op.add_column('system_settings', sa.Column('email_smtp_host', sa.String(length=255), nullable=True, comment='Servidor SMTP (modo smtp).'))
    op.add_column('system_settings', sa.Column('email_smtp_port', sa.Integer(), nullable=True, comment='Puerto SMTP (modo smtp).'))
    op.add_column('system_settings', sa.Column('email_smtp_username', sa.String(length=255), nullable=True, comment='Usuario SMTP (modo smtp).'))
    op.add_column('system_settings', sa.Column('email_smtp_password_ciphertext', sa.Text(), nullable=True, comment='Contraseña SMTP CIFRADA (Fernet). Nunca se proyecta a la API.'))
    op.add_column('system_settings', sa.Column('email_smtp_tls', sa.Boolean(), nullable=False, server_default='true', comment='STARTTLS (modo smtp).'))
    op.add_column('system_settings', sa.Column('email_smtp_ssl', sa.Boolean(), nullable=False, server_default='false', comment='SSL/TLS directo (modo smtp).'))
    op.add_column('system_settings', sa.Column('email_resend_api_key_ciphertext', sa.Text(), nullable=True, comment='API key de Resend CIFRADA (Fernet). Nunca se proyecta a la API.'))
    op.add_column('system_settings', sa.Column('email_last_test_at', sa.DateTime(), nullable=True, comment='Momento (UTC) del último correo de prueba; lo escribe la acción de test.'))
    op.add_column('system_settings', sa.Column('email_last_test_status', sa.String(length=20), nullable=True, comment='Resultado del último test: ok o failed (estado derivado, no editable).'))
    op.add_column('system_settings', sa.Column('email_last_test_error', sa.String(length=255), nullable=True, comment='Resumen SEGURO del fallo del último test (sin credenciales).'))
    op.create_check_constraint(
        'ck_system_settings_system_settings_email_mode',
        'system_settings',
        "email_mode in ('environment', 'smtp', 'resend')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_system_settings_system_settings_email_mode', 'system_settings', type_='check')
    for column in (
        'email_last_test_error', 'email_last_test_status', 'email_last_test_at',
        'email_resend_api_key_ciphertext', 'email_smtp_ssl', 'email_smtp_tls',
        'email_smtp_password_ciphertext', 'email_smtp_username', 'email_smtp_port',
        'email_smtp_host', 'email_from_name', 'email_from_address', 'email_mode',
        'password_reset_enabled',
    ):
        op.drop_column('system_settings', column)
