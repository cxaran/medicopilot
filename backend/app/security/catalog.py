from backend.app.security.groups.consultation_diagnoses import (
    ConsultationDiagnosisPermissions,
)
from backend.app.security.groups.consultations import ConsultationPermissions
from backend.app.security.groups.doctors import DoctorPermissions
from backend.app.security.groups.medical_history_versions import (
    MedicalHistoryVersionPermissions,
)
from backend.app.security.groups.patient_clinical_items import (
    PatientClinicalItemPermissions,
)
from backend.app.security.groups.patients import PatientPermissions
from backend.app.security.groups.permissions import PermissionPermissions
from backend.app.security.groups.prescriptions import PrescriptionPermissions
from backend.app.security.groups.roles import RolePermissions
from backend.app.security.groups.users import UserPermissions
from backend.app.security.groups.vital_signs import VitalSignPermissions
from backend.app.security.security_group import SecurityGroup


SECURITY_GROUPS: list[type[SecurityGroup]] = [
    UserPermissions,
    RolePermissions,
    DoctorPermissions,
    PatientPermissions,
    PatientClinicalItemPermissions,
    MedicalHistoryVersionPermissions,
    ConsultationPermissions,
    ConsultationDiagnosisPermissions,
    VitalSignPermissions,
    PrescriptionPermissions,
    PermissionPermissions,
]


def declared_permissions() -> set[str]:
    """Conjunto de todos los permisos declarados en código.

    Fuente única para validar que un permiso solicitado exista; evita recomputar
    la derivación del catálogo en cada router.
    """
    return {permission.permission for group in SECURITY_GROUPS for permission in group}
