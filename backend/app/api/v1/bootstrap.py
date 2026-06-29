from fastapi import APIRouter, Header, Request, Response, status
from sqlalchemy.exc import IntegrityError

from backend.app.api.resource_actions import api_error
from backend.app.bootstrap.security import (
    BOOTSTRAP_TOKEN_HEADER,
    bootstrap_token_required,
    require_bootstrap_token,
)
from backend.app.bootstrap.service import (
    BootstrapAdditionalRoleInput,
    BootstrapError,
    BootstrapInitializeInput,
    BootstrapRoleInput,
    BootstrapUserInput,
    MAX_ADDITIONAL_ROLES,
    get_platform_setup_status,
    initialize_platform,
)
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.schemas.bootstrap import (
    BootstrapCatalogRead,
    BootstrapInitializeRead,
    BootstrapInitializeRequest,
    BootstrapLimitsRead,
    BootstrapPermissionGroupRead,
    BootstrapPermissionRead,
    BootstrapStatusRead,
)
from backend.app.security.catalog import SECURITY_GROUPS
from backend.app.security.rate_limit import limit_bootstrap_initialize

router = APIRouter(prefix="/bootstrap", tags=["bootstrap"])


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _token_required() -> bool:
    return bootstrap_token_required(settings.bootstrap_setup_token)


def _ensure_setup_available(session: SessionDep) -> None:
    status_read = get_platform_setup_status(session, token_required=_token_required())
    if not status_read.setup_required:
        api_error(
            status.HTTP_409_CONFLICT,
            "bootstrap_completed",
            "Bootstrap ya fue completado.",
        )


@router.get("/status", response_model=BootstrapStatusRead)
def read_bootstrap_status(response: Response, session: SessionDep) -> BootstrapStatusRead:
    _no_store(response)
    return BootstrapStatusRead.model_validate(
        get_platform_setup_status(session, token_required=_token_required())
    )


@router.get("/catalog", response_model=BootstrapCatalogRead)
def read_bootstrap_catalog(
    response: Response,
    session: SessionDep,
    bootstrap_token: str | None = Header(default=None, alias=BOOTSTRAP_TOKEN_HEADER),
) -> BootstrapCatalogRead:
    _no_store(response)
    _ensure_setup_available(session)
    require_bootstrap_token(settings.bootstrap_setup_token, bootstrap_token)
    return _catalog_read()


@router.post(
    "/initialize",
    response_model=BootstrapInitializeRead,
    status_code=status.HTTP_201_CREATED,
)
def initialize_bootstrap(
    payload: BootstrapInitializeRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    bootstrap_token: str | None = Header(default=None, alias=BOOTSTRAP_TOKEN_HEADER),
) -> BootstrapInitializeRead:
    _no_store(response)
    limit_bootstrap_initialize(request)
    require_bootstrap_token(settings.bootstrap_setup_token, bootstrap_token)
    try:
        initialize_platform(session, _payload_to_input(payload))
        session.commit()
    except BootstrapError as exc:
        session.rollback()
        _raise_bootstrap_error(exc)
    except IntegrityError:
        session.rollback()
        api_error(
            status.HTTP_409_CONFLICT,
            "bootstrap_conflict",
            "No se pudo completar Bootstrap.",
        )

    return BootstrapInitializeRead(setup_complete=True)


def _catalog_read() -> BootstrapCatalogRead:
    groups: list[BootstrapPermissionGroupRead] = []
    for group in SECURITY_GROUPS:
        group_name = _group_name(group.__name__)
        groups.append(
            BootstrapPermissionGroupRead(
                name=group_name,
                label=_group_label(group_name),
                permissions=[
                    BootstrapPermissionRead(
                        access=permission.permission,
                        label=permission.description or permission.permission,
                        description=permission.description,
                    )
                    for permission in group
                ],
            )
        )
    return BootstrapCatalogRead(
        permission_groups=groups,
        limits=BootstrapLimitsRead(max_additional_roles=MAX_ADDITIONAL_ROLES),
    )


def _payload_to_input(payload: BootstrapInitializeRequest) -> BootstrapInitializeInput:
    return BootstrapInitializeInput(
        user=BootstrapUserInput(
            name=payload.user.name,
            last_name=payload.user.last_name,
            email=str(payload.user.email),
            password=payload.user.password,
        ),
        system_admin_role=BootstrapRoleInput(
            label=payload.system_admin_role.label,
            description=payload.system_admin_role.description,
        ),
        additional_roles=[
            BootstrapAdditionalRoleInput(
                name=role.name,
                description=role.description,
                permissions=role.permissions,
                assign_to_initial_user=role.assign_to_initial_user,
            )
            for role in payload.additional_roles
        ],
    )


def _raise_bootstrap_error(exc: BootstrapError) -> None:
    status_code = (
        status.HTTP_409_CONFLICT
        if exc.code == "bootstrap_unavailable"
        else 422
    )
    api_error(status_code, exc.code, exc.message)


def _group_name(class_name: str) -> str:
    singular = class_name.removesuffix("Permissions").lower()
    return {
        "user": "users",
        "role": "roles",
        "doctor": "doctors",
        "medicationtemplate": "medication_templates",
        "patient": "patients",
        "patientclinicalitem": "patient_clinical_items",
        "patienthistoryitem": "patient_history_items",
        "patientimmunization": "patient_immunizations",
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
        "clinicalscale": "clinical_scales",
        "scaleresult": "scale_results",
        "clinicalnote": "clinical_notes",
        "qualitycheck": "quality_checks",
        "medicationreconciliation": "medication_reconciliation",
        "followup": "follow_ups",
        "auditevent": "audit_events",
        "permission": "permissions",
    }.get(singular, singular)


def _group_label(group_name: str) -> str:
    return {
        "users": "Usuarios",
        "roles": "Roles",
        "doctors": "Médicos",
        "medication_templates": "Plantillas de medicamentos",
        "patients": "Pacientes",
        "patient_clinical_items": "Datos clínicos de pacientes",
        "patient_history_items": "Antecedentes del paciente",
        "patient_immunizations": "Inmunizaciones del paciente",
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
        "clinical_scales": "Escalas clínicas",
        "scale_results": "Resultados de escalas clínicas",
        "clinical_notes": "Notas clínicas",
        "quality_checks": "Verificaciones de calidad/seguridad",
        "medication_reconciliation": "Conciliación de medicación",
        "follow_ups": "Pendientes de seguimiento",
        "audit_events": "Registros de auditoría",
        "permissions": "Permisos",
    }.get(group_name, group_name.capitalize())
