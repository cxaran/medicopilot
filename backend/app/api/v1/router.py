from fastapi import APIRouter

from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.bootstrap import router as bootstrap_router
from backend.app.api.v1.consultations import router as consultations_router
from backend.app.api.v1.doctors import router as doctors_router
from backend.app.api.v1.medical_history_versions import (
    router as medical_history_versions_router,
)
from backend.app.api.v1.patient_clinical_items import (
    router as patient_clinical_items_router,
)
from backend.app.api.v1.patients import router as patients_router
from backend.app.api.v1.permissions import router as permissions_router
from backend.app.api.v1.resources import router as resources_router
from backend.app.api.v1.roles import router as roles_router
from backend.app.api.v1.users import router as users_router
from backend.app.api.v1.users_admin import router as users_admin_router
from backend.app.api.v1.vital_signs import router as vital_signs_router


router = APIRouter(prefix="/v1")
router.include_router(auth_router)
router.include_router(bootstrap_router)
router.include_router(consultations_router)
router.include_router(doctors_router)
router.include_router(medical_history_versions_router)
router.include_router(patient_clinical_items_router)
router.include_router(patients_router)
router.include_router(permissions_router)
router.include_router(resources_router)
router.include_router(roles_router)
router.include_router(users_router)
router.include_router(users_admin_router)
router.include_router(vital_signs_router)
