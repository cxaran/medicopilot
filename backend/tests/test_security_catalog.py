import os
import unittest


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

from backend.app.security.catalog import SECURITY_GROUPS  # noqa: E402
from backend.app.security.groups.appointments import (  # noqa: E402
    AppointmentPermissions,
)
from backend.app.security.groups.consultation_diagnoses import (  # noqa: E402
    ConsultationDiagnosisPermissions,
)
from backend.app.security.groups.clinical_documents import (  # noqa: E402
    ClinicalDocumentPermissions,
)
from backend.app.security.groups.consultations import ConsultationPermissions  # noqa: E402
from backend.app.security.groups.clinical_events import (  # noqa: E402
    ClinicalEventPermissions,
)
from backend.app.security.groups.clinical_tasks import (  # noqa: E402
    ClinicalTaskPermissions,
)
from backend.app.security.groups.doctors import DoctorPermissions  # noqa: E402
from backend.app.security.groups.lab_results import LabResultPermissions  # noqa: E402
from backend.app.security.groups.medical_history_versions import (  # noqa: E402
    MedicalHistoryVersionPermissions,
)
from backend.app.security.groups.medication_templates import (  # noqa: E402
    MedicationTemplatePermissions,
)
from backend.app.security.groups.patient_clinical_items import (  # noqa: E402
    PatientClinicalItemPermissions,
)
from backend.app.security.groups.patients import PatientPermissions  # noqa: E402
from backend.app.security.groups.permissions import PermissionPermissions  # noqa: E402
from backend.app.security.groups.population import (  # noqa: E402
    PopulationPermissions,
)
from backend.app.security.groups.prescriptions import (  # noqa: E402
    PrescriptionPermissions,
)
from backend.app.security.groups.reports import ReportsPermissions  # noqa: E402
from backend.app.security.groups.roles import RolePermissions  # noqa: E402
from backend.app.security.groups.study_orders import (  # noqa: E402
    StudyOrderPermissions,
)
from backend.app.security.groups.users import UserPermissions  # noqa: E402
from backend.app.security.groups.vital_signs import VitalSignPermissions  # noqa: E402
from backend.app.security.security_control import SecurityControl  # noqa: E402


class SecurityCatalogTest(unittest.TestCase):
    def test_catalog_exposes_expected_groups(self) -> None:
        self.assertEqual(
            SECURITY_GROUPS,
            [
                UserPermissions,
                RolePermissions,
                DoctorPermissions,
                MedicationTemplatePermissions,
                PatientPermissions,
                PatientClinicalItemPermissions,
                MedicalHistoryVersionPermissions,
                ConsultationPermissions,
                ConsultationDiagnosisPermissions,
                VitalSignPermissions,
                LabResultPermissions,
                ClinicalEventPermissions,
                StudyOrderPermissions,
                ClinicalTaskPermissions,
                PrescriptionPermissions,
                AppointmentPermissions,
                ClinicalDocumentPermissions,
                PopulationPermissions,
                ReportsPermissions,
                PermissionPermissions,
            ],
        )

    def test_catalog_exposes_expected_permissions(self) -> None:
        permissions = [permission.permission for group in SECURITY_GROUPS for permission in group]

        self.assertEqual(
            permissions,
            [
                "users:read",
                "users:create",
                "users:update",
                "users:delete",
                "users:manage_roles",
                "users:revoke_sessions",
                "roles:read",
                "roles:create",
                "roles:update",
                "roles:delete",
                "roles:manage_permissions",
                "doctors:read",
                "doctors:create",
                "doctors:update",
                "doctors:delete",
                "medication_templates:read",
                "medication_templates:create",
                "medication_templates:update",
                "medication_templates:delete",
                "patients:read",
                "patients:create",
                "patients:update",
                "patients:delete",
                "patient_clinical_items:read",
                "patient_clinical_items:create",
                "patient_clinical_items:update",
                "patient_clinical_items:delete",
                "medical_history_versions:read",
                "medical_history_versions:create",
                "medical_history_versions:update",
                "medical_history_versions:delete",
                "medical_history_versions:finalize",
                "consultations:read",
                "consultations:create",
                "consultations:update",
                "consultations:delete",
                "consultations:finalize",
                "consultation_diagnoses:read",
                "consultation_diagnoses:create",
                "consultation_diagnoses:update",
                "consultation_diagnoses:delete",
                "vital_signs:read",
                "vital_signs:create",
                "vital_signs:update",
                "vital_signs:delete",
                "lab_results:read",
                "lab_results:create",
                "lab_results:update",
                "lab_results:delete",
                "clinical_events:read",
                "clinical_events:create",
                "clinical_events:update",
                "clinical_events:delete",
                "study_orders:read",
                "study_orders:create",
                "study_orders:update",
                "study_orders:delete",
                "clinical_tasks:read",
                "clinical_tasks:create",
                "clinical_tasks:update",
                "clinical_tasks:delete",
                "prescriptions:read",
                "prescriptions:create",
                "prescriptions:update",
                "prescriptions:delete",
                "prescriptions:approve",
                "prescriptions:void",
                "appointments:read",
                "appointments:create",
                "appointments:update",
                "appointments:delete",
                "clinical_documents:read",
                "clinical_documents:create",
                "clinical_documents:update",
                "clinical_documents:archive",
                "clinical_documents:restore",
                "clinical_documents:delete",
                "clinical_documents:download",
                "population:read",
                "reports:read",
                "permissions:read",
            ],
        )

    def test_catalog_permissions_are_unique(self) -> None:
        permissions = [permission.permission for group in SECURITY_GROUPS for permission in group]

        self.assertEqual(len(permissions), len(set(permissions)))

    def test_permission_members_expose_control_and_description(self) -> None:
        permission = UserPermissions.READ

        self.assertIsInstance(permission.access, SecurityControl)
        self.assertEqual(permission.permission, "users:read")
        self.assertEqual(permission.description, "Listar usuarios")
        self.assertTrue(callable(permission.check))
        self.assertIsNotNone(permission.requiere)


if __name__ == "__main__":
    unittest.main()
