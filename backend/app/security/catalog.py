from backend.app.security.groups.appointments import AppointmentPermissions
from backend.app.security.groups.audit_events import AuditEventPermissions
from backend.app.security.groups.backups import BackupPermissions
from backend.app.security.groups.clinical_codes import ClinicalCodePermissions
from backend.app.security.groups.clinical_documents import ClinicalDocumentPermissions
from backend.app.security.groups.clinical_events import ClinicalEventPermissions
from backend.app.security.groups.clinical_notes import ClinicalNotePermissions
from backend.app.security.groups.clinical_scales import ClinicalScalePermissions
from backend.app.security.groups.clinical_tasks import ClinicalTaskPermissions
from backend.app.security.groups.consultation_diagnoses import (
    ConsultationDiagnosisPermissions,
)
from backend.app.security.groups.consultations import ConsultationPermissions
from backend.app.security.groups.conversations import (
    ConversationPermissions,
    MessagePermissions,
)
from backend.app.security.groups.doctors import DoctorPermissions
from backend.app.security.groups.follow_ups import FollowUpPermissions
from backend.app.security.groups.institutional_settings import (
    InstitutionalSettingPermissions,
)
from backend.app.security.groups.lab_results import LabResultPermissions
from backend.app.security.groups.medication_reconciliation import (
    MedicationReconciliationPermissions,
)
from backend.app.security.groups.medical_history_versions import (
    MedicalHistoryVersionPermissions,
)
from backend.app.security.groups.medication_templates import (
    MedicationTemplatePermissions,
)
from backend.app.security.groups.patient_clinical_items import (
    PatientClinicalItemPermissions,
)
from backend.app.security.groups.patient_history_items import (
    PatientHistoryItemPermissions,
)
from backend.app.security.groups.patient_immunizations import (
    PatientImmunizationPermissions,
)
from backend.app.security.groups.patient_summary import PatientSummaryPermissions
from backend.app.security.groups.patients import PatientPermissions
from backend.app.security.groups.permissions import PermissionPermissions
from backend.app.security.groups.population import PopulationPermissions
from backend.app.security.groups.prescriptions import PrescriptionPermissions
from backend.app.security.groups.quality_checks import QualityCheckPermissions
from backend.app.security.groups.reports import ReportsPermissions
from backend.app.security.groups.roles import RolePermissions
from backend.app.security.groups.scale_results import ScaleResultPermissions
from backend.app.security.groups.study_orders import StudyOrderPermissions
from backend.app.security.groups.system_settings import SystemSettingsPermissions
from backend.app.security.groups.users import UserPermissions
from backend.app.security.groups.vital_signs import VitalSignPermissions
from backend.app.security.security_group import SecurityGroup


SECURITY_GROUPS: list[type[SecurityGroup]] = [
    UserPermissions,
    RolePermissions,
    DoctorPermissions,
    MedicationTemplatePermissions,
    PatientPermissions,
    PatientClinicalItemPermissions,
    PatientHistoryItemPermissions,
    PatientImmunizationPermissions,
    MedicalHistoryVersionPermissions,
    ConsultationPermissions,
    ConsultationDiagnosisPermissions,
    ConversationPermissions,
    MessagePermissions,
    VitalSignPermissions,
    LabResultPermissions,
    ClinicalEventPermissions,
    StudyOrderPermissions,
    SystemSettingsPermissions,
    ClinicalTaskPermissions,
    PrescriptionPermissions,
    AppointmentPermissions,
    ClinicalDocumentPermissions,
    PopulationPermissions,
    ReportsPermissions,
    InstitutionalSettingPermissions,
    ClinicalCodePermissions,
    ClinicalScalePermissions,
    ScaleResultPermissions,
    ClinicalNotePermissions,
    QualityCheckPermissions,
    MedicationReconciliationPermissions,
    FollowUpPermissions,
    PatientSummaryPermissions,
    AuditEventPermissions,
    BackupPermissions,
    PermissionPermissions,
]


def declared_permissions() -> set[str]:
    """Conjunto de todos los permisos declarados en código.

    Fuente única para validar que un permiso solicitado exista; evita recomputar
    la derivación del catálogo en cada router.
    """
    return {permission.permission for group in SECURITY_GROUPS for permission in group}
