"""Catálogo agrupado de permisos, autenticado y protegido por RBAC.

Fuente de opciones para la administración normal (editor de permisos de roles) y
para la vista ``grouped_catalog``. No reutiliza ``/bootstrap/catalog``, que solo
existe durante la instalación inicial."""

from fastapi import APIRouter

from backend.app.schemas.role import PermissionGroupRead, PermissionRead
from backend.app.security.catalog import SECURITY_GROUPS
from backend.app.security.groups.permissions import PermissionPermissions
from backend.app.security.security_group import SecurityGroup

router = APIRouter(prefix="/permissions", tags=["permissions"])

_GROUP_LABELS = {
    "users": "Usuarios",
    "roles": "Roles",
    "doctors": "Médicos",
    "medication_templates": "Plantillas de medicamentos",
    "patients": "Pacientes",
    "patient_clinical_items": "Datos clínicos de pacientes",
    "medical_history_versions": "Historia clínica",
    "consultations": "Consultas médicas",
    "consultation_diagnoses": "Diagnósticos de consulta",
    "vital_signs": "Signos vitales",
    "lab_results": "Resultados de laboratorio",
    "clinical_events": "Eventos clínicos",
    "study_orders": "Órdenes de estudio",
    "clinical_tasks": "Tareas clínicas",
    "prescriptions": "Recetas médicas",
    "appointments": "Agenda y citas",
    "clinical_documents": "Documentos clínicos",
    "population": "Población y cohortes",
    "reports": "Reportes y analítica",
    "institutional_settings": "Configuración institucional",
    "clinical_codes": "Códigos clínicos",
    "permissions": "Permisos",
}


def _group_name(group: type[SecurityGroup]) -> str:
    singular = group.__name__.removesuffix("Permissions").lower()
    return {
        "user": "users",
        "role": "roles",
        "doctor": "doctors",
        "medicationtemplate": "medication_templates",
        "patient": "patients",
        "patientclinicalitem": "patient_clinical_items",
        "medicalhistoryversion": "medical_history_versions",
        "consultation": "consultations",
        "consultationdiagnosis": "consultation_diagnoses",
        "vitalsign": "vital_signs",
        "labresult": "lab_results",
        "clinicalevent": "clinical_events",
        "studyorder": "study_orders",
        "clinicaltask": "clinical_tasks",
        "prescription": "prescriptions",
        "appointment": "appointments",
        "clinicaldocument": "clinical_documents",
        "institutionalsetting": "institutional_settings",
        "clinicalcode": "clinical_codes",
        "permission": "permissions",
    }.get(singular, singular)


@router.get("", response_model=list[PermissionGroupRead])
def list_permissions(
    _: PermissionPermissions.READ.requiere,
) -> list[PermissionGroupRead]:
    groups: list[PermissionGroupRead] = []
    for group in SECURITY_GROUPS:
        name = _group_name(group)
        groups.append(
            PermissionGroupRead(
                name=name,
                label=_GROUP_LABELS.get(name, name.capitalize()),
                permissions=[
                    PermissionRead(
                        access=permission.permission,
                        label=permission.description or permission.permission,
                        description=permission.description,
                    )
                    for permission in group
                ],
            )
        )
    return groups
