from fastapi import APIRouter

from backend.app.api.v1.agent import router as agent_router
from backend.app.api.v1.agent_internal import router as agent_internal_router
from backend.app.api.v1.agent_templates import router as agent_templates_router
from backend.app.api.v1.agent_memories import router as agent_memories_router
from backend.app.api.v1.agent_oauth import router as agent_oauth_router
from backend.app.api.v1.agent_persona import router as agent_persona_router
from backend.app.api.v1.ai_providers import router as ai_providers_router
from backend.app.api.v1.appointments import router as appointments_router
from backend.app.api.v1.audit_events import router as audit_events_router
from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.backups import router as backups_router
from backend.app.api.v1.bootstrap import router as bootstrap_router
from backend.app.api.v1.clinical_codes import router as clinical_codes_router
from backend.app.api.v1.clinical_documents import (
    router as clinical_documents_router,
)
from backend.app.api.v1.clinical_events import router as clinical_events_router
from backend.app.api.v1.clinical_notes import router as clinical_notes_router
from backend.app.api.v1.clinical_scales import router as clinical_scales_router
from backend.app.api.v1.clinical_tasks import router as clinical_tasks_router
from backend.app.api.v1.consultation_diagnoses import (
    router as consultation_diagnoses_router,
)
from backend.app.api.v1.consultations import router as consultations_router
from backend.app.api.v1.conversations import router as conversations_router
from backend.app.api.v1.doctors import router as doctors_router
from backend.app.api.v1.messages import router as messages_router
from backend.app.api.v1.follow_ups import router as follow_ups_router
from backend.app.api.v1.institutional_settings import (
    router as institutional_settings_router,
)
from backend.app.api.v1.lab_results import router as lab_results_router
from backend.app.api.v1.medical_history_versions import (
    router as medical_history_versions_router,
)
from backend.app.api.v1.medication_reconciliation import (
    router as medication_reconciliation_router,
)
from backend.app.api.v1.medication_templates import (
    router as medication_templates_router,
)
from backend.app.api.v1.patient_clinical_items import (
    router as patient_clinical_items_router,
)
from backend.app.api.v1.patient_history_items import (
    router as patient_history_items_router,
)
from backend.app.api.v1.patient_immunizations import (
    router as patient_immunizations_router,
)
from backend.app.api.v1.patients import router as patients_router
from backend.app.api.v1.permissions import router as permissions_router
from backend.app.api.v1.population import router as population_router
from backend.app.api.v1.prescription_items import router as prescription_items_router
from backend.app.api.v1.prescriptions import router as prescriptions_router
from backend.app.api.v1.quality_checks import router as quality_checks_router
from backend.app.api.v1.reports import router as reports_router
from backend.app.api.v1.research import router as research_router
from backend.app.api.v1.resources import router as resources_router
from backend.app.api.v1.roles import router as roles_router
from backend.app.api.v1.scale_results import router as scale_results_router
from backend.app.api.v1.study_orders import router as study_orders_router
from backend.app.api.v1.users import router as users_router
from backend.app.api.v1.users_admin import router as users_admin_router
from backend.app.api.v1.vital_signs import router as vital_signs_router


router = APIRouter(prefix="/v1")
router.include_router(agent_router)
router.include_router(agent_templates_router)
router.include_router(agent_internal_router)
router.include_router(agent_memories_router)
router.include_router(agent_oauth_router)
router.include_router(agent_persona_router)
router.include_router(ai_providers_router)
router.include_router(appointments_router)
router.include_router(audit_events_router)
router.include_router(auth_router)
router.include_router(backups_router)
router.include_router(bootstrap_router)
router.include_router(clinical_codes_router)
router.include_router(clinical_documents_router)
router.include_router(clinical_events_router)
router.include_router(clinical_notes_router)
router.include_router(clinical_scales_router)
router.include_router(clinical_tasks_router)
router.include_router(consultation_diagnoses_router)
router.include_router(consultations_router)
router.include_router(conversations_router)
router.include_router(doctors_router)
router.include_router(messages_router)
router.include_router(follow_ups_router)
router.include_router(institutional_settings_router)
router.include_router(lab_results_router)
router.include_router(medical_history_versions_router)
router.include_router(medication_reconciliation_router)
router.include_router(medication_templates_router)
router.include_router(patient_clinical_items_router)
router.include_router(patient_history_items_router)
router.include_router(patient_immunizations_router)
router.include_router(patients_router)
router.include_router(permissions_router)
router.include_router(population_router)
router.include_router(prescription_items_router)
router.include_router(prescriptions_router)
router.include_router(quality_checks_router)
router.include_router(reports_router)
router.include_router(research_router)
router.include_router(resources_router)
router.include_router(roles_router)
router.include_router(scale_results_router)
router.include_router(study_orders_router)
router.include_router(users_router)
router.include_router(users_admin_router)
router.include_router(vital_signs_router)
