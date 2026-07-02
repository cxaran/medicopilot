"""Tests del perfil de rol CLÍNICO por defecto (MP-CTRL-0119).

Bloquean la regresión del hueco reportado en vivo: el copiloto no ofrecía crear un paciente porque
el rol clínico carecía de ``patients:create`` y la tool de alta quedaba gateada. Se verifica que el
perfil clínico por defecto PUEDE crear pacientes (y que, proyectado a capabilities, ``patients``
expone ``forms.create``), respetando la regla de creables/restringidos. Función pura sobre el
registry + el perfil; no requiere base de datos.
"""

import os
import unittest
import uuid


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "MedicoPilot Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "medicopilot",
}

os.environ.update(DEV_ENV)

from backend.app.resources.projection import build_capability_if_visible  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402
from backend.app.security.role_profiles import (  # noqa: E402
    CLINICAL_ROLE_NAME,
    clinical_role_permissions,
)
from backend.app.schemas.user import SessionUser  # noqa: E402


def clinical_user() -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Doctora",
        last_name="Apellido",
        email="medica@example.com",
        permissions=clinical_role_permissions(),
    )


class ClinicalRoleProfileTest(unittest.TestCase):
    def test_profile_permissions_are_all_declared(self) -> None:
        # El perfil nunca concede un permiso inexistente (la función valida y, si no, lanza).
        self.assertTrue(clinical_role_permissions() <= declared_permissions())

    def test_clinical_role_can_create_patients(self) -> None:
        perms = clinical_role_permissions()
        self.assertIn("patients:read", perms)
        self.assertIn("patients:create", perms)  # el hueco que corrige 0119

    def test_creatable_clinical_resources_present(self) -> None:
        perms = clinical_role_permissions()
        for resource in (
            "patients", "consultations", "appointments", "consultation_diagnoses",
            "prescriptions", "lab_results", "study_orders", "clinical_tasks",
            "patient_clinical_items",
        ):
            self.assertIn(f"{resource}:create", perms, resource)

    def test_restricted_resources_are_read_only(self) -> None:
        perms = clinical_role_permissions()
        for resource in (
            "scale_results", "patient_history_items", "patient_immunizations", "clinical_notes",
        ):
            self.assertIn(f"{resource}:read", perms, resource)
            self.assertNotIn(f"{resource}:create", perms, resource)

    def test_no_destructive_or_admin_permissions(self) -> None:
        perms = clinical_role_permissions()
        # Sin borrado de recursos ni administración de usuarios/roles. Única excepción
        # documentada en role_profiles: ``messages:delete`` (baja lógica del historial
        # de chat del copiloto, nunca de datos clínicos).
        self.assertFalse(
            any(p.endswith(":delete") and p != "messages:delete" for p in perms)
        )
        self.assertFalse(any(p.startswith("users:") for p in perms))
        self.assertFalse(any(p.startswith("roles:") for p in perms))

    def test_projection_exposes_patients_create_for_clinical_role(self) -> None:
        # Punta a punta del backend: con el perfil clínico, el recurso 'patients' expone forms.create
        # (la MISMA señal que el copiloto usa para no gatear clinical.create_patient_draft).
        capability = build_capability_if_visible("patients", clinical_user())
        self.assertIsNotNone(capability)
        assert capability is not None
        self.assertIsNotNone(capability.forms)
        assert capability.forms is not None
        self.assertIsNotNone(capability.forms.create)

    def test_role_name_is_spanish(self) -> None:
        self.assertEqual(CLINICAL_ROLE_NAME, "Médico")


if __name__ == "__main__":
    unittest.main()
