"""Registro neutral de recursos navegables de primer nivel.

Fuente única de las instancias ``ResourceQuery`` reutilizables (compartidas con los
routers) y de la metadata declarativa por recurso (label, ``api_path``, schemas por
operación, permisos por operación, acciones y orden de catálogo).

No importa routers ni la proyección: routers y proyección importan de aquí. Esto
evita ciclos y mantiene una sola definición de ``QueryOptions`` por recurso.
"""

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel

from backend.app.core.settings import settings
from backend.app.models.appointment import Appointment
from backend.app.models.clinical_code import ClinicalCode
from backend.app.models.clinical_document import ClinicalDocument
from backend.app.models.audit_event import AuditEvent
from backend.app.models.backup import BackupRun, BackupSettings
from backend.app.models.system_settings import SystemSettings
from backend.app.models.clinical_event import ClinicalEvent
from backend.app.models.clinical_note import ClinicalNote
from backend.app.models.clinical_task import ClinicalTask
from backend.app.models.consultation import Consultation
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.conversation import Conversation
from backend.app.models.doctor import Doctor
from backend.app.models.message import Message
from backend.app.models.institutional_setting import InstitutionalSetting
from backend.app.models.lab_result import LabResult
from backend.app.models.medical_history import MedicalHistoryVersion
from backend.app.models.medication_template import MedicationTemplate
from backend.app.models.patient import Patient
from backend.app.models.patient_clinical_item import PatientClinicalItem
from backend.app.models.patient_history_item import PatientHistoryItem
from backend.app.models.patient_immunization import PatientImmunization
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.models.scale_result import ScaleResult
from backend.app.models.study_order import StudyOrder
from backend.app.models.user import Role, User
from backend.app.models.vital_sign import VitalSign
from backend.app.query import QueryOptions, ResourceQuery
from backend.app.query.operators import Operator

# Operadores de texto visibles compartidos por los campos de nombre/correo de los
# recursos administrativos (``eq`` se declara aparte vía ``filter_fields``).
_TEXT_FILTER_OPERATORS = (
    Operator.CONTAINS,
    Operator.STARTS_WITH,
    Operator.ENDS_WITH,
    Operator.NE,
)
# Operadores de fecha de calendario para ``created_at`` (día completo en la zona de
# aplicación). Solo se publican en usuarios y roles, no en permisos.
_CREATED_AT_OPERATORS = (
    Operator.ON,
    Operator.BEFORE,
    Operator.AFTER,
    Operator.BETWEEN,
)
from backend.app.schemas.capabilities import (
    ActionCondition,
    ActionConditionOperator,
    ActionConditionPredicate,
    ActionScope,
    FormTransport,
    HttpMethod,
    OptionsSourceType,
    RelationCardinality,
    ResourceFileFieldCapability,
    ResourceView,
)
from backend.app.schemas.appointment import (
    AppointmentCancel,
    AppointmentCreate,
    AppointmentListItem,
    AppointmentReschedule,
    AppointmentUpdate,
)
from backend.app.schemas.clinical_document import (
    ClinicalDocumentCreateForm,
    ClinicalDocumentListItem,
    ClinicalDocumentMetadataUpdate,
)
from backend.app.schemas.clinical_event import (
    ClinicalEventCreate,
    ClinicalEventListItem,
    ClinicalEventUpdate,
)
from backend.app.schemas.clinical_note import (
    ClinicalNoteCreate,
    ClinicalNoteListItem,
    ClinicalNoteUpdate,
)
from backend.app.schemas.clinical_task import (
    ClinicalTaskCreate,
    ClinicalTaskListItem,
    ClinicalTaskUpdate,
)
from backend.app.schemas.consultation import (
    ConsultationCreate,
    ConsultationListItem,
    ConsultationUpdate,
)
from backend.app.schemas.consultation_diagnosis import (
    ConsultationDiagnosisCreate,
    ConsultationDiagnosisListItem,
    ConsultationDiagnosisUpdate,
)
from backend.app.schemas.clinical_code import (
    ClinicalCodeCreate,
    ClinicalCodeListItem,
    ClinicalCodeUpdate,
)
from backend.app.schemas.doctor import DoctorCreate, DoctorListItem, DoctorUpdate
from backend.app.schemas.lab_result import (
    LabResultCreate,
    LabResultListItem,
    LabResultUpdate,
)
from backend.app.schemas.institutional_setting import (
    InstitutionalSettingCreate,
    InstitutionalSettingListItem,
    InstitutionalSettingUpdate,
)
from backend.app.schemas.medical_history_version import (
    MedicalHistoryVersionCreate,
    MedicalHistoryVersionListItem,
    MedicalHistoryVersionUpdate,
)
from backend.app.schemas.medication_template import (
    MedicationTemplateCreate,
    MedicationTemplateListItem,
    MedicationTemplateUpdate,
)
from backend.app.schemas.patient import PatientCreate, PatientListItem, PatientUpdate
from backend.app.schemas.patient_clinical_item import (
    PatientClinicalItemCreate,
    PatientClinicalItemListItem,
    PatientClinicalItemUpdate,
)
from backend.app.schemas.patient_history_item import (
    PatientHistoryItemCreate,
    PatientHistoryItemListItem,
    PatientHistoryItemUpdate,
)
from backend.app.schemas.audit_event import AuditEventListItem
from backend.app.schemas.system_settings import (
    SystemSettingsListItem,
    SystemSettingsUpdate,
)
from backend.app.schemas.backup import (
    BackupRunListItem,
    BackupSettingsListItem,
    BackupSettingsUpdate,
)
from backend.app.schemas.conversation import (
    ConversationCreate,
    ConversationListItem,
)
from backend.app.schemas.message import MessageCreate, MessageListItem
from backend.app.schemas.patient_immunization import (
    PatientImmunizationCreate,
    PatientImmunizationListItem,
    PatientImmunizationUpdate,
)
from backend.app.schemas.prescription import (
    PrescriptionCreate,
    PrescriptionItemCreate,
    PrescriptionItemListItem,
    PrescriptionItemUpdate,
    PrescriptionListItem,
    PrescriptionUpdate,
    PrescriptionVoid,
)
from backend.app.schemas.vital_sign import (
    VitalSignCreate,
    VitalSignListItem,
    VitalSignUpdate,
)
from backend.app.schemas.role import RoleCreate, RoleListItem, RoleRead, RoleUpdate
from backend.app.schemas.scale_result import ScaleResultListItem
from backend.app.schemas.study_order import (
    StudyOrderCreate,
    StudyOrderListItem,
    StudyOrderUpdate,
)
from backend.app.schemas.user_admin import (
    UserAdminCreate,
    UserAdminListItem,
    UserAdminUpdate,
)
from backend.app.security.groups.clinical_codes import ClinicalCodePermissions
from backend.app.security.groups.clinical_documents import ClinicalDocumentPermissions
from backend.app.security.groups.clinical_events import ClinicalEventPermissions
from backend.app.security.groups.clinical_notes import ClinicalNotePermissions
from backend.app.security.groups.clinical_tasks import ClinicalTaskPermissions
from backend.app.security.groups.study_orders import StudyOrderPermissions
from backend.app.security.groups.consultation_diagnoses import (
    ConsultationDiagnosisPermissions,
)
from backend.app.security.groups.appointments import AppointmentPermissions
from backend.app.security.groups.consultations import ConsultationPermissions
from backend.app.security.groups.medical_history_versions import (
    MedicalHistoryVersionPermissions,
)
from backend.app.security.groups.medication_templates import (
    MedicationTemplatePermissions,
)
from backend.app.security.groups.prescriptions import PrescriptionPermissions
from backend.app.security.groups.doctors import DoctorPermissions
from backend.app.security.groups.institutional_settings import (
    InstitutionalSettingPermissions,
)
from backend.app.security.groups.conversations import (
    ConversationPermissions,
    MessagePermissions,
)
from backend.app.security.groups.lab_results import LabResultPermissions
from backend.app.security.groups.patient_clinical_items import (
    PatientClinicalItemPermissions,
)
from backend.app.security.groups.audit_events import AuditEventPermissions
from backend.app.security.groups.backups import BackupPermissions
from backend.app.security.groups.system_settings import SystemSettingsPermissions
from backend.app.security.groups.patient_history_items import (
    PatientHistoryItemPermissions,
)
from backend.app.security.groups.patient_immunizations import (
    PatientImmunizationPermissions,
)
from backend.app.security.groups.patients import PatientPermissions
from backend.app.security.groups.vital_signs import VitalSignPermissions
from backend.app.security.groups.permissions import PermissionPermissions
from backend.app.security.groups.roles import RolePermissions
from backend.app.security.groups.scale_results import ScaleResultPermissions
from backend.app.security.groups.users import UserPermissions
from backend.app.security.security_group import SecurityGroup

# --- Instancias de query compartidas (movidas desde los routers) ---

USERS = ResourceQuery(
    name="UserAdminQuery",
    model=User,
    schema=UserAdminListItem,
    options=QueryOptions(
        filter_fields=("is_active", "email", "name"),
        sort_fields=("created_at", "name", "email"),
        search_fields=("name", "email"),
        in_fields=("id",),
        field_operators={
            "name": _TEXT_FILTER_OPERATORS,
            "email": _TEXT_FILTER_OPERATORS,
            "created_at": _CREATED_AT_OPERATORS,
        },
        default_sort="-created_at",
    ),
)

USER_ROLES = ResourceQuery(
    name="UserRoleQuery",
    model=Role,
    schema=RoleRead,
    options=QueryOptions(
        filter_fields=("is_active", "name"),
        sort_fields=("name", "created_at"),
        search_fields=("name",),
        in_fields=("id",),
        default_sort="name",
    ),
)

ROLES = ResourceQuery(
    name="RoleQuery",
    model=Role,
    schema=RoleListItem,
    options=QueryOptions(
        filter_fields=("is_active", "name"),
        sort_fields=("created_at", "name"),
        search_fields=("name",),
        in_fields=("id",),
        field_operators={
            "name": _TEXT_FILTER_OPERATORS,
            "created_at": _CREATED_AT_OPERATORS,
        },
        default_sort="name",
    ),
)

DOCTORS = ResourceQuery(
    name="DoctorQuery",
    model=Doctor,
    schema=DoctorListItem,
    options=QueryOptions(
        # ``status`` (enum no-nativo) se filtra por igualdad (select). Los listados
        # excluyen perfiles eliminados (``deleted_at``) mediante un stmt base en el router.
        filter_fields=("status",),
        sort_fields=("created_at", "professional_name"),
        search_fields=("professional_name", "professional_license_number", "specialty"),
        in_fields=("id",),
        field_operators={
            "professional_name": _TEXT_FILTER_OPERATORS,
            "specialty": _TEXT_FILTER_OPERATORS,
            "created_at": _CREATED_AT_OPERATORS,
        },
        default_sort="-created_at",
    ),
)

MEDICATION_TEMPLATES = ResourceQuery(
    name="MedicationTemplateQuery",
    model=MedicationTemplate,
    schema=MedicationTemplateListItem,
    options=QueryOptions(
        # ``doctor_id`` (UUID), ``status`` (enum no-nativo) y ``medication_name``
        # (texto) por igualdad. Búsqueda libre sobre nombre/presentación/indicaciones
        # (metadata del catálogo, no datos de paciente). Los listados excluyen las
        # plantillas eliminadas (``deleted_at``) vía stmt base en el router.
        filter_fields=("doctor_id", "status", "medication_name"),
        sort_fields=("medication_name", "use_count", "created_at", "updated_at"),
        search_fields=("medication_name", "presentation", "default_instructions"),
        in_fields=("id",),
        default_sort="medication_name",
    ),
)

INSTITUTIONAL_SETTINGS = ResourceQuery(
    name="InstitutionalSettingQuery",
    model=InstitutionalSetting,
    schema=InstitutionalSettingListItem,
    options=QueryOptions(
        # ``category`` (enum no-nativo) por igualdad; búsqueda libre por clave/descripción
        # (metadata de configuración, no datos de paciente). Los listados excluyen las
        # eliminadas (``deleted_at``) vía stmt base en el router.
        filter_fields=("category",),
        sort_fields=("key", "category", "created_at", "updated_at"),
        search_fields=("key", "description"),
        in_fields=("id",),
        default_sort="key",
    ),
)

CLINICAL_CODES = ResourceQuery(
    name="ClinicalCodeQuery",
    model=ClinicalCode,
    schema=ClinicalCodeListItem,
    options=QueryOptions(
        # ``system`` (enum no-nativo) por igualdad (select). Búsqueda libre por código y
        # término (metadata de catálogo, no datos de paciente): un término desconocido no
        # coincide y la búsqueda devuelve vacío. Los listados excluyen los eliminados
        # (``deleted_at``) vía stmt base en el router.
        filter_fields=("system",),
        sort_fields=("system", "code", "display_term", "created_at"),
        search_fields=("code", "display_term"),
        in_fields=("id",),
        default_sort="display_term",
    ),
)

PATIENTS = ResourceQuery(
    name="PatientQuery",
    model=Patient,
    schema=PatientListItem,
    options=QueryOptions(
        # ``status`` (enum no-nativo) por igualdad; ``record_number`` (entero) como
        # filtro exacto. Los listados excluyen eliminados (``deleted_at``) vía stmt base.
        filter_fields=("status", "record_number"),
        sort_fields=("created_at", "full_name", "record_number"),
        search_fields=("full_name", "curp", "phone"),
        in_fields=("id",),
        field_operators={
            "full_name": _TEXT_FILTER_OPERATORS,
            "created_at": _CREATED_AT_OPERATORS,
        },
        default_sort="-created_at",
    ),
)

PATIENT_CLINICAL_ITEMS = ResourceQuery(
    name="PatientClinicalItemQuery",
    model=PatientClinicalItem,
    schema=PatientClinicalItemListItem,
    options=QueryOptions(
        # ``patient_id`` (UUID) por igualdad: el resumen se consulta por paciente.
        # ``item_type``/``status``/``severity`` (enums no-nativos) por igualdad (select).
        # Los listados excluyen eliminados (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "item_type", "status", "severity"),
        sort_fields=("created_at", "updated_at", "title", "started_on"),
        search_fields=("title", "details"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

PATIENT_HISTORY_ITEMS = ResourceQuery(
    name="PatientHistoryItemQuery",
    model=PatientHistoryItem,
    schema=PatientHistoryItemListItem,
    options=QueryOptions(
        # ``patient_id`` (UUID) y ``category`` (enum no-nativo) por igualdad: la historia se
        # consulta por paciente y opcionalmente por categoría. Búsqueda libre sobre la
        # descripción/condición. Los listados excluyen eliminados (``deleted_at``) vía stmt base.
        filter_fields=("patient_id", "category"),
        sort_fields=("created_at", "updated_at", "occurred_on"),
        search_fields=("description", "related_condition"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

PATIENT_IMMUNIZATIONS = ResourceQuery(
    name="PatientImmunizationQuery",
    model=PatientImmunization,
    schema=PatientImmunizationListItem,
    options=QueryOptions(
        # ``patient_id`` (UUID) y ``status`` (enum no-nativo) por igualdad: el esquema de
        # vacunación se consulta por paciente y opcionalmente por estado. ``administered_on``
        # admite rango de calendario. Búsqueda libre sobre el nombre de la vacuna. Los listados
        # excluyen eliminados (``deleted_at``) vía stmt base.
        filter_fields=("patient_id", "status"),
        sort_fields=("administered_on", "created_at", "updated_at"),
        search_fields=("vaccine_name",),
        in_fields=("id",),
        default_sort="-administered_on",
    ),
)

CONVERSATIONS = ResourceQuery(
    name="ConversationQuery",
    model=Conversation,
    schema=ConversationListItem,
    options=QueryOptions(
        # Chat-first: el hilo se consulta por paciente (``patient_id`` por igualdad); el chat
        # global (sin paciente) son las conversaciones con patient_id nulo. Orden por fecha
        # descendente. Los listados excluyen eliminados (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id",),
        sort_fields=("created_at", "updated_at"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

MESSAGES = ResourceQuery(
    name="MessageQuery",
    model=Message,
    schema=MessageListItem,
    options=QueryOptions(
        # Los mensajes se consultan por conversación (``conversation_id`` por igualdad) y,
        # opcionalmente, por ``role``. Orden por ``sequence_index`` ASCENDENTE (orden del chat).
        # Los listados excluyen eliminados (``deleted_at``) vía stmt base en el router.
        filter_fields=("conversation_id", "role"),
        sort_fields=("sequence_index", "created_at"),
        in_fields=("id",),
        default_sort="sequence_index",
    ),
)

BACKUP_SETTINGS = ResourceQuery(
    name="BackupSettingsQuery",
    model=BackupSettings,
    schema=BackupSettingsListItem,
    options=QueryOptions(
        # Singleton: la lista devuelve UNA fila; sin filtros ni búsqueda (no hay nada
        # que filtrar). El orden es irrelevante pero el contrato exige un default.
        sort_fields=("created_at",),
        in_fields=("id",),
        default_sort="created_at",
    ),
)

SYSTEM_SETTINGS = ResourceQuery(
    name="SystemSettingsQuery",
    model=SystemSettings,
    schema=SystemSettingsListItem,
    options=QueryOptions(
        # Singleton: una fila; sin filtros ni búsqueda.
        sort_fields=("created_at",),
        in_fields=("id",),
        default_sort="created_at",
    ),
)

BACKUP_RUNS = ResourceQuery(
    name="BackupRunQuery",
    model=BackupRun,
    schema=BackupRunListItem,
    options=QueryOptions(
        # Historial operativo: filtro por estado (enum no nativo, igualdad) y rango de
        # calendario sobre created_at. Sin búsqueda libre (metadata, no texto).
        filter_fields=("status", "trigger_kind"),
        field_operators={"created_at": _CREATED_AT_OPERATORS},
        sort_fields=("created_at", "finished_at", "file_size_bytes"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

AUDIT_EVENTS = ResourceQuery(
    name="AuditEventQuery",
    model=AuditEvent,
    schema=AuditEventListItem,
    options=QueryOptions(
        # Bitácora append-only (sin baja lógica). Filtros por igualdad: ``actor_user_id``
        # (quién), ``action`` (qué acción), ``entity_type`` y ``entity_id`` (sobre qué
        # entidad — así se reconstruye el rastro de un paciente: entity_type=patient +
        # entity_id). ``occurred_at`` (DateTime) admite rango de calendario. Orden por
        # fecha descendente por defecto. Sin búsqueda libre (la bitácora no es texto).
        filter_fields=("actor_user_id", "action", "entity_type", "entity_id"),
        field_operators={"occurred_at": _CREATED_AT_OPERATORS},
        sort_fields=("occurred_at",),
        in_fields=("id",),
        default_sort="-occurred_at",
    ),
)

MEDICAL_HISTORY_VERSIONS = ResourceQuery(
    name="MedicalHistoryVersionQuery",
    model=MedicalHistoryVersion,
    schema=MedicalHistoryVersionListItem,
    options=QueryOptions(
        # ``patient_id`` (UUID) por igualdad: la historia se consulta por paciente;
        # ``status`` (enum no-nativo) por igualdad (p. ej. ?status=current). No se
        # habilita búsqueda libre sobre los campos narrativos (datos sensibles).
        # Los listados excluyen eliminados (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "status"),
        sort_fields=("version_number", "created_at", "updated_at", "reviewed_at"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

CONSULTATIONS = ResourceQuery(
    name="ConsultationQuery",
    model=Consultation,
    schema=ConsultationListItem,
    options=QueryOptions(
        # ``patient_id``/``attending_doctor_id`` (UUID) y ``status`` (enum) por
        # igualdad. ``consulted_at`` admite rango de calendario (on/before/after/
        # between). La búsqueda libre se limita a ``reason_for_visit``: el resto de
        # las notas clínicas son sensibles y no se indexan. Los listados excluyen
        # eliminadas (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "attending_doctor_id", "status"),
        sort_fields=("consulted_at", "created_at", "updated_at"),
        search_fields=("reason_for_visit",),
        in_fields=("id",),
        field_operators={"consulted_at": _CREATED_AT_OPERATORS},
        default_sort="-consulted_at",
    ),
)

VITAL_SIGNS = ResourceQuery(
    name="VitalSignQuery",
    model=VitalSign,
    schema=VitalSignListItem,
    options=QueryOptions(
        # ``consultation_id``/``patient_id`` (UUID) por igualdad: las mediciones se
        # consultan por consulta o por paciente (derivado de la consulta vía
        # subconsulta del modelo — permite el expediente por paciente). ``measured_at``
        # admite rango de calendario. Sin búsqueda libre sobre observaciones ni
        # numéricos. Los listados excluyen eliminadas (``deleted_at``) y las de
        # consultas eliminadas vía stmt base en el router.
        filter_fields=("consultation_id", "patient_id"),
        sort_fields=("measured_at", "created_at", "updated_at"),
        in_fields=("id",),
        field_operators={"measured_at": _CREATED_AT_OPERATORS},
        default_sort="-measured_at",
    ),
)

LAB_RESULTS = ResourceQuery(
    name="LabResultQuery",
    model=LabResult,
    schema=LabResultListItem,
    options=QueryOptions(
        # ``patient_id``/``consultation_id`` (UUID) y ``abnormal_flag`` (enum) por
        # igualdad. ``analyte_name`` admite búsqueda libre (q) y coincidencia parcial
        # (contains) para tolerar variantes de nombre. ``measured_at`` admite rango de
        # calendario. ``abnormal_flag`` se añade a ``in_fields`` para el filtro
        # "solo anormales" (abnormal_flag_in=low,high,critical). Los listados excluyen
        # resultados eliminados (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "consultation_id", "analyte_name", "abnormal_flag"),
        sort_fields=("measured_at", "created_at", "updated_at", "analyte_name"),
        search_fields=("analyte_name", "analyte_code"),
        in_fields=("id", "abnormal_flag"),
        field_operators={
            "analyte_name": _TEXT_FILTER_OPERATORS,
            "measured_at": _CREATED_AT_OPERATORS,
        },
        default_sort="-measured_at",
    ),
)

SCALE_RESULTS = ResourceQuery(
    name="ScaleResultQuery",
    model=ScaleResult,
    schema=ScaleResultListItem,
    options=QueryOptions(
        # ``patient_id``/``consultation_id`` (UUID) y ``scale_id`` (texto, el id del
        # registro) por igualdad: los resultados se consultan por paciente y se acotan por
        # escala. ``computed_at`` admite rango de calendario. Sin búsqueda libre (los
        # insumos pueden ser sensibles). Los listados excluyen los eliminados
        # (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "consultation_id", "scale_id"),
        sort_fields=("computed_at", "created_at", "updated_at", "scale_id"),
        in_fields=("id",),
        field_operators={"computed_at": _CREATED_AT_OPERATORS},
        default_sort="-computed_at",
    ),
)

CLINICAL_NOTES = ResourceQuery(
    name="ClinicalNoteQuery",
    model=ClinicalNote,
    schema=ClinicalNoteListItem,
    options=QueryOptions(
        # ``patient_id``/``consultation_id`` (UUID), ``kind`` (nota_soap/constancia/
        # incapacidad) y ``status`` (enum no-nativo) por igualdad: las notas/documentos se
        # consultan por paciente o consulta y se acotan por tipo y estado. ``created_at``
        # admite rango de calendario. Sin búsqueda libre (texto clínico sensible). Los
        # listados excluyen las eliminadas (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "consultation_id", "kind", "status"),
        sort_fields=("created_at", "updated_at"),
        in_fields=("id",),
        field_operators={"created_at": _CREATED_AT_OPERATORS},
        default_sort="-created_at",
    ),
)

CLINICAL_EVENTS = ResourceQuery(
    name="ClinicalEventQuery",
    model=ClinicalEvent,
    schema=ClinicalEventListItem,
    options=QueryOptions(
        # ``patient_id`` (UUID), ``event_type`` y ``status`` (enums) por igualdad: la línea de
        # tiempo se consulta por paciente y se acota por tipo/estado. ``started_at`` admite rango
        # de calendario. Búsqueda libre por título. Los listados excluyen eventos eliminados
        # (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "event_type", "status"),
        sort_fields=("started_at", "created_at", "updated_at"),
        search_fields=("title",),
        in_fields=("id",),
        field_operators={"started_at": _CREATED_AT_OPERATORS},
        default_sort="-started_at",
    ),
)

STUDY_ORDERS = ResourceQuery(
    name="StudyOrderQuery",
    model=StudyOrder,
    schema=StudyOrderListItem,
    options=QueryOptions(
        # ``patient_id``/``ordered_by`` (UUID) y ``status`` (enum) por igualdad. ``ordered_at``
        # admite rango de calendario. Búsqueda libre por nombre del estudio. Los listados excluyen
        # órdenes eliminadas (``deleted_at``) vía stmt base en el router.
        filter_fields=("patient_id", "ordered_by", "status"),
        sort_fields=("ordered_at", "created_at", "updated_at"),
        search_fields=("study_name", "code"),
        in_fields=("id",),
        field_operators={"ordered_at": _CREATED_AT_OPERATORS},
        default_sort="-ordered_at",
    ),
)

CLINICAL_TASKS = ResourceQuery(
    name="ClinicalTaskQuery",
    model=ClinicalTask,
    schema=ClinicalTaskListItem,
    options=QueryOptions(
        # ``owner_id``/``patient_id`` (UUID), ``status`` y ``priority`` (enums) por igualdad: los
        # pendientes/vencidos se consultan por responsable + estado + rango de ``due_at``. Búsqueda
        # libre por título. Los listados excluyen tareas eliminadas vía stmt base en el router.
        filter_fields=("owner_id", "patient_id", "status", "priority"),
        sort_fields=("due_at", "created_at", "updated_at"),
        search_fields=("title",),
        in_fields=("id",),
        field_operators={"due_at": _CREATED_AT_OPERATORS},
        default_sort="-created_at",
    ),
)

CONSULTATION_DIAGNOSES = ResourceQuery(
    name="ConsultationDiagnosisQuery",
    model=ConsultationDiagnosis,
    schema=ConsultationDiagnosisListItem,
    options=QueryOptions(
        # ``consultation_id`` (UUID) por igualdad y ``diagnosis_kind`` (enum) por
        # igualdad. Búsqueda libre acotada a ``diagnosis_text`` y ``code`` (no a
        # ``notes``). Los listados excluyen diagnósticos eliminados y los de
        # consultas eliminadas vía stmt base en el router.
        filter_fields=("consultation_id", "diagnosis_kind"),
        sort_fields=("created_at", "updated_at", "diagnosis_text"),
        search_fields=("diagnosis_text", "code"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

PRESCRIPTIONS = ResourceQuery(
    name="PrescriptionQuery",
    model=Prescription,
    schema=PrescriptionListItem,
    options=QueryOptions(
        # ``consultation_id``/``patient_id``/``related_diagnosis_id`` (UUID) por
        # igualdad: las recetas se consultan por consulta o por paciente (derivado de
        # la consulta vía subconsulta del modelo — permite el expediente por paciente).
        # ``status`` (enum no-nativo) y ``internal_folio`` (entero) como filtros
        # exactos. Sin búsqueda libre. Los listados excluyen recetas eliminadas y las
        # de consultas eliminadas vía stmt base en el router.
        filter_fields=(
            "consultation_id",
            "patient_id",
            "related_diagnosis_id",
            "status",
            "internal_folio",
        ),
        sort_fields=("internal_folio", "created_at", "updated_at", "approved_at", "voided_at"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

PRESCRIPTION_ITEMS = ResourceQuery(
    name="PrescriptionItemQuery",
    model=PrescriptionItem,
    schema=PrescriptionItemListItem,
    options=QueryOptions(
        # ``prescription_id`` (UUID) por igualdad: los medicamentos se consultan por
        # receta. Búsqueda libre acotada a ``medication_name``. ``position`` ordena el
        # listado por defecto. Los listados excluyen renglones eliminados y los de
        # recetas eliminadas vía stmt base en el router.
        filter_fields=("prescription_id",),
        sort_fields=("position", "created_at", "updated_at", "medication_name"),
        search_fields=("medication_name",),
        in_fields=("id",),
        default_sort="position",
    ),
)

APPOINTMENTS = ResourceQuery(
    name="AppointmentQuery",
    model=Appointment,
    schema=AppointmentListItem,
    options=QueryOptions(
        # ``patient_id``/``doctor_id`` (UUID) y ``status`` (enum) por igualdad (select).
        # ``scheduled_date`` (``date``) está en ``filter_fields``: al ser de tipo fecha recibe
        # automáticamente igualdad (ese día) + rango por extremos ``gte``/``lte`` (fecha civil,
        # comparación directa sin zona horaria). El contrato PUBLICA esos operadores
        # (proyección de filtros) y el frontend de la agenda los consume. La cita se agenda
        # por fecha; la hora (``scheduled_time``) es opcional y sólo ordena. Búsqueda libre
        # acotada a ``reason`` (no a ``internal_notes``). Los listados excluyen citas
        # eliminadas vía stmt base en el router.
        filter_fields=("patient_id", "doctor_id", "status", "scheduled_date"),
        sort_fields=(
            "scheduled_date",
            "scheduled_time",
            "created_at",
            "updated_at",
            "duration_minutes",
        ),
        search_fields=("reason",),
        in_fields=("id",),
        default_sort="scheduled_date",
    ),
)


CLINICAL_DOCUMENTS = ResourceQuery(
    name="ClinicalDocumentQuery",
    model=ClinicalDocument,
    schema=ClinicalDocumentListItem,
    options=QueryOptions(
        # ``patient_id``/``consultation_id`` (UUID) por igualdad: los archivos se
        # consultan por paciente o por consulta. ``document_type``/``status`` (enums
        # no-nativos) por igualdad (select). ``uploaded_at``/``document_date`` admiten
        # rango de calendario. Búsqueda libre acotada al nombre de archivo (metadata, no
        # sensible). Los listados excluyen documentos eliminados y los de pacientes
        # eliminados vía stmt base en el router.
        filter_fields=("patient_id", "consultation_id", "document_type", "status"),
        sort_fields=("uploaded_at", "document_date", "size_bytes"),
        search_fields=("original_filename",),
        in_fields=("id",),
        # ``document_date`` es ``date`` (no admite los operadores de calendario, que
        # exigen datetime); queda como campo ordenable. El rango de calendario aplica a
        # ``uploaded_at`` (datetime).
        field_operators={"uploaded_at": _CREATED_AT_OPERATORS},
        default_sort="-uploaded_at",
    ),
)


@dataclass(frozen=True)
class ConfirmationDef:
    """Confirmación declarada de una acción (diálogo accesible en el frontend)."""

    title: str
    message: str
    confirm_label: str
    destructive: bool
    required: bool = True


@dataclass(frozen=True)
class ActionDef:
    """Acción declarada de un recurso. ``permission`` es un control de seguridad
    existente (miembro de ``SecurityGroup``); se filtra con ``.check(current_user)``.

    ``fixed_body`` declara el cuerpo exacto que el frontend debe enviar (p. ej.
    ``{"is_active": False}`` para reutilizar el PATCH de actualización como
    desactivación). El frontend no puede modificarlo ni reutilizar la acción para
    otro payload.

    ``input_schema`` declara, en su lugar, un formulario de entrada (un schema Pydantic
    con ``extra="forbid"``) que el frontend debe presentar y enviar. ``fixed_body`` e
    ``input_schema`` son excluyentes: una acción tiene cuerpo fijo, o formulario, o
    ningún cuerpo (jamás los dos).

    ``visible_when``/``enabled_when`` son condiciones de estado (DSL serializable de
    capabilities) que el frontend usa como guía; el backend revalida siempre. El permiso
    nunca se expresa en estas condiciones: es la propiedad ``permission``."""

    name: str
    label: str
    method: HttpMethod
    url_template: str
    scope: ActionScope
    danger: bool
    permission: SecurityGroup
    fixed_body: Optional[dict[str, object]] = None
    input_schema: Optional[type[BaseModel]] = None
    confirmation: Optional[ConfirmationDef] = None
    visible_when: Optional[ActionCondition] = None
    enabled_when: Optional[ActionCondition] = None

    def __post_init__(self) -> None:
        # Falla temprano (al definir el recurso), no al proyectar la capability.
        if self.fixed_body is not None and self.input_schema is not None:
            raise ValueError(
                f"La acción '{self.name}' no puede declarar 'fixed_body' e 'input_schema' a la vez."
            )
        if self.input_schema is not None:
            extra = self.input_schema.model_config.get("extra")
            if extra != "forbid":
                raise ValueError(
                    f"El input_schema de la acción '{self.name}' debe usar extra='forbid'."
                )


@dataclass(frozen=True)
class RelationDef:
    """Editor relacional declarado de un recurso (reemplazo atómico de una M2M).

    Las URLs son plantillas con ``{id}`` del recurso dueño. ``permission`` es el
    control que habilita **editar** la relación: la capability solo se proyecta si
    el actor lo cumple (además del permiso de lectura del recurso). El backend sigue
    siendo la autoridad: supervivencia administrativa e invalidación de sesiones se
    aplican en la mutación, no en la UI."""

    name: str
    label: str
    description: Optional[str]
    cardinality: RelationCardinality
    required: bool
    selection_url_template: str
    # Campo de la respuesta de ``selection_url`` que contiene la lista de valores
    # actualmente seleccionados. Si es ``None``, la selección es una página
    # (``items[]``) y el valor de cada item se lee con ``options_value_field``.
    selection_field: Optional[str]
    mutation_method: HttpMethod
    mutation_url_template: str
    request_field: str
    options_type: OptionsSourceType
    options_url: str
    options_value_field: str
    options_label_field: str
    permission: SecurityGroup


@dataclass(frozen=True)
class RelatedListDef:
    """Lista relacionada navegable por item (p. ej. signos vitales de una consulta).

    ``resource`` es el nombre REGISTRADO del recurso destino y ``filter_field`` su
    campo de filtro EQ (debe estar en los ``filter_fields`` del destino) que recibe
    el id del item dueño. La proyección la publica solo si el actor tiene el permiso
    de lectura del recurso destino; es navegación de solo lectura, no un editor."""

    resource: str
    label: str
    filter_field: str


@dataclass(frozen=True)
class ResourceDefinition:
    name: str
    label: str
    api_path: str
    view: ResourceView
    read_permission: SecurityGroup
    list_query: Optional[ResourceQuery] = None
    list_schema: Optional[type[BaseModel]] = None
    create_schema: Optional[type[BaseModel]] = None
    update_schema: Optional[type[BaseModel]] = None
    create_permission: Optional[SecurityGroup] = None
    update_permission: Optional[SecurityGroup] = None
    # Transporte del formulario de creación. ``MULTIPART`` declara una carga de archivo:
    # ``create_file_field`` describe el campo de archivo (genérico). Los campos de
    # metadata siguen proyectándose desde ``create_schema``.
    create_transport: FormTransport = FormTransport.JSON
    create_file_field: Optional[ResourceFileFieldCapability] = None
    # Descarga de binario por item. Si se declara, el recurso publica ``file_download``
    # cuando el actor tiene ``download_permission`` (distinto del de lectura).
    download_url_template: Optional[str] = None
    download_permission: Optional[SecurityGroup] = None
    # Lectura individual: si está declarada, el recurso publica ``item_reference`` y
    # ``detail``. El campo identificador (``item_id_field``) coincide con el token
    # ``{id}`` de las plantillas de URL (detail, update, acciones).
    detail_url_template: Optional[str] = None
    item_id_field: str = "id"
    actions: tuple[ActionDef, ...] = ()
    relations: tuple[RelationDef, ...] = ()
    related_lists: tuple[RelatedListDef, ...] = ()


RESOURCE_REGISTRY: tuple[ResourceDefinition, ...] = (
    ResourceDefinition(
        name="users",
        label="Usuarios",
        api_path="/api/v1/users",
        view=ResourceView.TABLE,
        read_permission=UserPermissions.READ,
        list_query=USERS,
        list_schema=UserAdminListItem,
        create_schema=UserAdminCreate,
        update_schema=UserAdminUpdate,
        create_permission=UserPermissions.CREATE,
        update_permission=UserPermissions.UPDATE,
        detail_url_template="/api/v1/users/{id}",
        actions=(
            # Activate/deactivate reutilizan el PATCH de actualización con un cuerpo
            # fijo: la supervivencia administrativa y la invalidación de sesiones ya
            # viven ahí, sin endpoints nuevos que dupliquen reglas.
            ActionDef(
                name="activate",
                label="Activar",
                method=HttpMethod.PATCH,
                url_template="/api/v1/users/{id}",
                scope=ActionScope.ITEM,
                danger=False,
                permission=UserPermissions.UPDATE,
                fixed_body={"is_active": True},
                confirmation=ConfirmationDef(
                    title="Activar usuario",
                    message="El usuario recuperará acceso a la plataforma.",
                    confirm_label="Activar",
                    destructive=False,
                    required=False,
                ),
            ),
            ActionDef(
                name="deactivate",
                label="Desactivar",
                method=HttpMethod.PATCH,
                url_template="/api/v1/users/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=UserPermissions.UPDATE,
                fixed_body={"is_active": False},
                confirmation=ConfirmationDef(
                    title="Desactivar usuario",
                    message="El usuario perderá acceso inmediatamente.",
                    confirm_label="Desactivar",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="revoke_sessions",
                label="Revocar sesiones",
                method=HttpMethod.POST,
                url_template="/api/v1/users/{id}/revoke-sessions",
                scope=ActionScope.ITEM,
                danger=True,
                permission=UserPermissions.REVOKE_SESSIONS,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y nunca reciba 422.
                fixed_body={},
                confirmation=ConfirmationDef(
                    title="Revocar sesiones",
                    message="Se cerrarán todas las sesiones activas del usuario.",
                    confirm_label="Revocar",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/users/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=UserPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar usuario",
                    message="El usuario será desactivado y perderá acceso.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
        relations=(
            RelationDef(
                name="roles",
                label="Roles",
                description="Roles asignados al usuario",
                cardinality=RelationCardinality.MULTIPLE,
                required=False,
                selection_url_template="/api/v1/users/{id}/roles",
                selection_field=None,
                mutation_method=HttpMethod.PUT,
                mutation_url_template="/api/v1/users/{id}/roles",
                request_field="role_ids",
                options_type=OptionsSourceType.LIST,
                options_url="/api/v1/roles",
                options_value_field="id",
                options_label_field="name",
                permission=UserPermissions.MANAGE_ROLES,
            ),
        ),
    ),
    ResourceDefinition(
        name="roles",
        label="Roles",
        api_path="/api/v1/roles",
        view=ResourceView.TABLE,
        read_permission=RolePermissions.READ,
        list_query=ROLES,
        list_schema=RoleListItem,
        create_schema=RoleCreate,
        update_schema=RoleUpdate,
        create_permission=RolePermissions.CREATE,
        update_permission=RolePermissions.UPDATE,
        detail_url_template="/api/v1/roles/{id}",
        actions=(
            ActionDef(
                name="activate",
                label="Activar",
                method=HttpMethod.PATCH,
                url_template="/api/v1/roles/{id}",
                scope=ActionScope.ITEM,
                danger=False,
                permission=RolePermissions.UPDATE,
                fixed_body={"is_active": True},
                confirmation=ConfirmationDef(
                    title="Activar rol",
                    message="El rol y sus permisos volverán a estar disponibles.",
                    confirm_label="Activar",
                    destructive=False,
                    required=False,
                ),
            ),
            ActionDef(
                name="deactivate",
                label="Desactivar",
                method=HttpMethod.PATCH,
                url_template="/api/v1/roles/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=RolePermissions.UPDATE,
                fixed_body={"is_active": False},
                confirmation=ConfirmationDef(
                    title="Desactivar rol",
                    message="Los usuarios con este rol perderán sus permisos.",
                    confirm_label="Desactivar",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/roles/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=RolePermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar rol",
                    message="El rol será desactivado y dejará de aplicarse.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
        relations=(
            RelationDef(
                name="permissions",
                label="Permisos",
                description="Permisos asignados al rol",
                cardinality=RelationCardinality.MULTIPLE,
                required=False,
                selection_url_template="/api/v1/roles/{id}/permissions",
                selection_field="permissions",
                mutation_method=HttpMethod.PUT,
                mutation_url_template="/api/v1/roles/{id}/permissions",
                request_field="permissions",
                options_type=OptionsSourceType.GROUPED_CATALOG,
                options_url="/api/v1/permissions",
                options_value_field="access",
                options_label_field="label",
                permission=RolePermissions.MANAGE_PERMISSIONS,
            ),
        ),
    ),
    ResourceDefinition(
        name="doctors",
        label="Médicos",
        api_path="/api/v1/doctors",
        view=ResourceView.TABLE,
        read_permission=DoctorPermissions.READ,
        list_query=DOCTORS,
        list_schema=DoctorListItem,
        create_schema=DoctorCreate,
        update_schema=DoctorUpdate,
        create_permission=DoctorPermissions.CREATE,
        update_permission=DoctorPermissions.UPDATE,
        detail_url_template="/api/v1/doctors/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/doctors/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=DoctorPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar médico",
                    message="El perfil médico se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="medication_templates",
        label="Plantillas de medicamentos",
        api_path="/api/v1/medication-templates",
        view=ResourceView.TABLE,
        read_permission=MedicationTemplatePermissions.READ,
        list_query=MEDICATION_TEMPLATES,
        list_schema=MedicationTemplateListItem,
        create_schema=MedicationTemplateCreate,
        update_schema=MedicationTemplateUpdate,
        create_permission=MedicationTemplatePermissions.CREATE,
        update_permission=MedicationTemplatePermissions.UPDATE,
        detail_url_template="/api/v1/medication-templates/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/medication-templates/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=MedicationTemplatePermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar plantilla",
                    message="La plantilla de medicamento se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="institutional_settings",
        label="Configuración institucional",
        api_path="/api/v1/institutional-settings",
        view=ResourceView.TABLE,
        read_permission=InstitutionalSettingPermissions.READ,
        list_query=INSTITUTIONAL_SETTINGS,
        list_schema=InstitutionalSettingListItem,
        create_schema=InstitutionalSettingCreate,
        update_schema=InstitutionalSettingUpdate,
        create_permission=InstitutionalSettingPermissions.CREATE,
        update_permission=InstitutionalSettingPermissions.UPDATE,
        detail_url_template="/api/v1/institutional-settings/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/institutional-settings/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=InstitutionalSettingPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar configuración",
                    message="La configuración institucional se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="clinical_codes",
        label="Códigos clínicos",
        api_path="/api/v1/clinical-codes",
        view=ResourceView.TABLE,
        read_permission=ClinicalCodePermissions.READ,
        list_query=CLINICAL_CODES,
        list_schema=ClinicalCodeListItem,
        create_schema=ClinicalCodeCreate,
        update_schema=ClinicalCodeUpdate,
        create_permission=ClinicalCodePermissions.CREATE,
        update_permission=ClinicalCodePermissions.UPDATE,
        detail_url_template="/api/v1/clinical-codes/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/clinical-codes/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ClinicalCodePermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar código clínico",
                    message="El código clínico se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="patients",
        label="Pacientes",
        api_path="/api/v1/patients",
        view=ResourceView.TABLE,
        read_permission=PatientPermissions.READ,
        list_query=PATIENTS,
        list_schema=PatientListItem,
        create_schema=PatientCreate,
        update_schema=PatientUpdate,
        create_permission=PatientPermissions.CREATE,
        update_permission=PatientPermissions.UPDATE,
        detail_url_template="/api/v1/patients/{id}",
        actions=(
            # Archivar reutiliza el PATCH de actualización con cuerpo fijo (status).
            ActionDef(
                name="archive",
                label="Archivar",
                method=HttpMethod.PATCH,
                url_template="/api/v1/patients/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PatientPermissions.UPDATE,
                fixed_body={"status": "archived"},
                confirmation=ConfirmationDef(
                    title="Archivar paciente",
                    message="El paciente quedará archivado y fuera de la operación diaria.",
                    confirm_label="Archivar",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/patients/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PatientPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar paciente",
                    message="El expediente se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="patient_clinical_items",
        label="Datos clínicos del paciente",
        api_path="/api/v1/patient-clinical-items",
        view=ResourceView.TABLE,
        read_permission=PatientClinicalItemPermissions.READ,
        list_query=PATIENT_CLINICAL_ITEMS,
        list_schema=PatientClinicalItemListItem,
        create_schema=PatientClinicalItemCreate,
        update_schema=PatientClinicalItemUpdate,
        create_permission=PatientClinicalItemPermissions.CREATE,
        update_permission=PatientClinicalItemPermissions.UPDATE,
        detail_url_template="/api/v1/patient-clinical-items/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/patient-clinical-items/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PatientClinicalItemPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar dato clínico",
                    message="El dato clínico se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="patient_history_items",
        label="Antecedentes del paciente",
        api_path="/api/v1/patient-history-items",
        view=ResourceView.TABLE,
        read_permission=PatientHistoryItemPermissions.READ,
        list_query=PATIENT_HISTORY_ITEMS,
        list_schema=PatientHistoryItemListItem,
        # Columnas tipadas (sin JSON): el alta/edición SÍ se exponen como formulario genérico,
        # igual que patient_clinical_items. El copiloto crea antecedentes como BORRADOR que el
        # médico aprueba (P1) vía la tool clinical.create_history_item_draft.
        create_schema=PatientHistoryItemCreate,
        update_schema=PatientHistoryItemUpdate,
        create_permission=PatientHistoryItemPermissions.CREATE,
        update_permission=PatientHistoryItemPermissions.UPDATE,
        detail_url_template="/api/v1/patient-history-items/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/patient-history-items/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PatientHistoryItemPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar antecedente",
                    message="El antecedente se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="patient_immunizations",
        label="Inmunizaciones del paciente",
        api_path="/api/v1/patient-immunizations",
        view=ResourceView.TABLE,
        read_permission=PatientImmunizationPermissions.READ,
        list_query=PATIENT_IMMUNIZATIONS,
        list_schema=PatientImmunizationListItem,
        # Columnas tipadas (sin JSON): el alta/edición se exponen como formulario genérico. El
        # copiloto crea inmunizaciones como BORRADOR que el médico aprueba (P1) vía la tool
        # clinical.create_immunization_draft.
        create_schema=PatientImmunizationCreate,
        update_schema=PatientImmunizationUpdate,
        create_permission=PatientImmunizationPermissions.CREATE,
        update_permission=PatientImmunizationPermissions.UPDATE,
        detail_url_template="/api/v1/patient-immunizations/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/patient-immunizations/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PatientImmunizationPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar inmunización",
                    message="La inmunización se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="conversations",
        label="Conversaciones",
        api_path="/api/v1/conversations",
        view=ResourceView.TABLE,
        read_permission=ConversationPermissions.READ,
        list_query=CONVERSATIONS,
        list_schema=ConversationListItem,
        create_schema=ConversationCreate,
        create_permission=ConversationPermissions.CREATE,
        detail_url_template="/api/v1/conversations/{id}",
    ),
    ResourceDefinition(
        name="messages",
        label="Mensajes",
        api_path="/api/v1/messages",
        view=ResourceView.TABLE,
        read_permission=MessagePermissions.READ,
        list_query=MESSAGES,
        list_schema=MessageListItem,
        create_schema=MessageCreate,
        create_permission=MessagePermissions.CREATE,
        detail_url_template="/api/v1/messages/{id}",
    ),
    ResourceDefinition(
        name="system_settings",
        label="Configuración del sistema",
        api_path="/api/v1/system-settings",
        view=ResourceView.TABLE,
        read_permission=SystemSettingsPermissions.READ,
        list_query=SYSTEM_SETTINGS,
        list_schema=SystemSettingsListItem,
        # Singleton editable: sin create ni delete; el update usa el PATCH del detail.
        update_schema=SystemSettingsUpdate,
        update_permission=SystemSettingsPermissions.CONFIGURE,
        detail_url_template="/api/v1/system-settings/{id}",
    ),
    ResourceDefinition(
        name="backup_settings",
        label="Configuración de respaldos",
        api_path="/api/v1/backup-settings",
        view=ResourceView.TABLE,
        read_permission=BackupPermissions.READ,
        list_query=BACKUP_SETTINGS,
        list_schema=BackupSettingsListItem,
        # Singleton editable: sin create ni delete; el update usa el PATCH del detail.
        update_schema=BackupSettingsUpdate,
        update_permission=BackupPermissions.CONFIGURE,
        detail_url_template="/api/v1/backup-settings/{id}",
        actions=(
            ActionDef(
                name="connect_drive",
                fixed_body={},
                label="Conectar Google Drive",
                method=HttpMethod.POST,
                url_template="/api/v1/backup-settings/{id}/connect-drive",
                scope=ActionScope.ITEM,
                danger=False,
                permission=BackupPermissions.CONFIGURE,
            ),
            ActionDef(
                name="disconnect_drive",
                fixed_body={},
                label="Desconectar Google Drive",
                method=HttpMethod.POST,
                url_template="/api/v1/backup-settings/{id}/disconnect-drive",
                scope=ActionScope.ITEM,
                danger=True,
                permission=BackupPermissions.CONFIGURE,
                confirmation=ConfirmationDef(
                    title="Desconectar Google Drive",
                    message=(
                        "Se olvidará la conexión y los respaldos quedarán deshabilitados. "
                        "Los archivos ya subidos y el historial se conservan."
                    ),
                    confirm_label="Desconectar",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="generate_encryption_key",
                fixed_body={},
                label="Generar clave de cifrado",
                method=HttpMethod.POST,
                url_template="/api/v1/backup-settings/{id}/generate-encryption-key",
                scope=ActionScope.ITEM,
                danger=False,
                permission=BackupPermissions.CONFIGURE,
                confirmation=ConfirmationDef(
                    title="Generar clave de cifrado",
                    message=(
                        "Se generará una clave de cifrado para los respaldos y la clave "
                        "PRIVADA se enviará a tu correo — guárdala: es la única forma de "
                        "abrir los respaldos cifrados. Reemplaza cualquier clave anterior."
                    ),
                    confirm_label="Generar y enviar por correo",
                    destructive=False,
                ),
            ),
            ActionDef(
                name="run_now",
                fixed_body={},
                label="Respaldar ahora",
                method=HttpMethod.POST,
                url_template="/api/v1/backup-settings/{id}/run-now",
                scope=ActionScope.ITEM,
                danger=False,
                permission=BackupPermissions.CONFIGURE,
                confirmation=ConfirmationDef(
                    title="Respaldo manual",
                    message="Se encolará un respaldo hacia Google Drive.",
                    confirm_label="Respaldar",
                    destructive=False,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="backup_runs",
        label="Historial de respaldos",
        api_path="/api/v1/backup-runs",
        view=ResourceView.TABLE,
        # SÓLO LECTURA: el historial lo escribe el worker; sin create/update/delete.
        read_permission=BackupPermissions.READ,
        list_query=BACKUP_RUNS,
        list_schema=BackupRunListItem,
        detail_url_template="/api/v1/backup-runs/{id}",
    ),
    ResourceDefinition(
        name="audit_events",
        label="Registros de auditoría",
        api_path="/api/v1/audit-events",
        view=ResourceView.TABLE,
        # Recurso SÓLO LECTURA: no declara create_schema/update_schema ni acciones (la
        # bitácora es append-only). El gate es el permiso dedicado de auditoría
        # (audit_events:read), distinto y NO más débil que population/reports.
        read_permission=AuditEventPermissions.READ,
        list_query=AUDIT_EVENTS,
        list_schema=AuditEventListItem,
        detail_url_template="/api/v1/audit-events/{id}",
    ),
    ResourceDefinition(
        name="medical_history_versions",
        label="Historia clínica",
        api_path="/api/v1/medical-history-versions",
        view=ResourceView.TABLE,
        read_permission=MedicalHistoryVersionPermissions.READ,
        list_query=MEDICAL_HISTORY_VERSIONS,
        list_schema=MedicalHistoryVersionListItem,
        create_schema=MedicalHistoryVersionCreate,
        update_schema=MedicalHistoryVersionUpdate,
        create_permission=MedicalHistoryVersionPermissions.CREATE,
        update_permission=MedicalHistoryVersionPermissions.UPDATE,
        detail_url_template="/api/v1/medical-history-versions/{id}",
        actions=(
            # finalize sella la versión (draft -> current). Cuerpo vacío por diseño:
            # ni fixed_body ni input_schema. Sólo visible mientras está en borrador; el
            # backend revalida la transición.
            ActionDef(
                name="finalize",
                label="Finalizar",
                method=HttpMethod.POST,
                url_template="/api/v1/medical-history-versions/{id}/finalize",
                scope=ActionScope.ITEM,
                danger=False,
                permission=MedicalHistoryVersionPermissions.FINALIZE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y el endpoint no responda 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Finalizar historia clínica",
                    message="La versión se sellará como vigente y dejará de ser editable.",
                    confirm_label="Finalizar",
                    destructive=False,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/medical-history-versions/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=MedicalHistoryVersionPermissions.DELETE,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Eliminar versión de historia",
                    message="La versión en borrador se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="consultations",
        label="Consultas médicas",
        api_path="/api/v1/consultations",
        view=ResourceView.TABLE,
        read_permission=ConsultationPermissions.READ,
        list_query=CONSULTATIONS,
        list_schema=ConsultationListItem,
        create_schema=ConsultationCreate,
        update_schema=ConsultationUpdate,
        create_permission=ConsultationPermissions.CREATE,
        update_permission=ConsultationPermissions.UPDATE,
        detail_url_template="/api/v1/consultations/{id}",
        actions=(
            # finalize sella la consulta (draft -> finalized). Cuerpo vacío por diseño.
            ActionDef(
                name="finalize",
                label="Finalizar",
                method=HttpMethod.POST,
                url_template="/api/v1/consultations/{id}/finalize",
                scope=ActionScope.ITEM,
                danger=False,
                permission=ConsultationPermissions.FINALIZE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y el endpoint no responda 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Finalizar consulta",
                    message="La consulta se sellará y sus datos clínicos quedarán bloqueados.",
                    confirm_label="Finalizar",
                    destructive=False,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/consultations/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ConsultationPermissions.DELETE,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Eliminar consulta",
                    message="La consulta en borrador se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
        # Navegación por fila a los registros de ESTA consulta (signos vitales y
        # recetas se capturan por consulta; el filtro EQ ya existe en el destino).
        related_lists=(
            RelatedListDef(
                resource="vital_signs",
                label="Signos vitales",
                filter_field="consultation_id",
            ),
            RelatedListDef(
                resource="prescriptions",
                label="Recetas",
                filter_field="consultation_id",
            ),
        ),
    ),
    ResourceDefinition(
        name="vital_signs",
        label="Signos vitales",
        api_path="/api/v1/vital-signs",
        view=ResourceView.TABLE,
        read_permission=VitalSignPermissions.READ,
        list_query=VITAL_SIGNS,
        list_schema=VitalSignListItem,
        create_schema=VitalSignCreate,
        update_schema=VitalSignUpdate,
        create_permission=VitalSignPermissions.CREATE,
        update_permission=VitalSignPermissions.UPDATE,
        detail_url_template="/api/v1/vital-signs/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/vital-signs/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=VitalSignPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar signos vitales",
                    message="La medición se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="lab_results",
        label="Resultados de laboratorio",
        api_path="/api/v1/lab-results",
        view=ResourceView.TABLE,
        read_permission=LabResultPermissions.READ,
        list_query=LAB_RESULTS,
        list_schema=LabResultListItem,
        create_schema=LabResultCreate,
        update_schema=LabResultUpdate,
        create_permission=LabResultPermissions.CREATE,
        update_permission=LabResultPermissions.UPDATE,
        detail_url_template="/api/v1/lab-results/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/lab-results/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=LabResultPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar resultado de laboratorio",
                    message="El resultado se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="scale_results",
        label="Resultados de escalas clínicas",
        api_path="/api/v1/scale-results",
        view=ResourceView.TABLE,
        read_permission=ScaleResultPermissions.READ,
        list_query=SCALE_RESULTS,
        list_schema=ScaleResultListItem,
        # El alta/edición NO se exponen como formulario genérico: un resultado de escala se
        # crea por RE-CÓMPUTO determinista en el servidor desde ``scale_id`` + ``inputs``
        # (insumos JSON estructurados que arma el copiloto y el médico aprueba, P1), vía el
        # endpoint dedicado /api/v1/scale-results. Se conservan los permisos create/update
        # para gobernar ese endpoint (RBAC), y el recurso publica lista/detalle/baja.
        create_permission=ScaleResultPermissions.CREATE,
        update_permission=ScaleResultPermissions.UPDATE,
        detail_url_template="/api/v1/scale-results/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/scale-results/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ScaleResultPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar resultado de escala",
                    message="El resultado de la escala se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="clinical_notes",
        label="Notas clínicas",
        api_path="/api/v1/clinical-notes",
        view=ResourceView.TABLE,
        read_permission=ClinicalNotePermissions.READ,
        list_query=CLINICAL_NOTES,
        list_schema=ClinicalNoteListItem,
        # A diferencia de scale_results (cuyo insumo JSON no se renderiza en un form), las
        # secciones SOAP son TEXTO: se exponen como formulario genérico (textarea). El alta
        # deriva el paciente de la consulta y nace en draft (el cliente no fija patient_id
        # ni status). El copiloto las compone vía la tool P1 clinical.create_soap_note_draft.
        create_schema=ClinicalNoteCreate,
        update_schema=ClinicalNoteUpdate,
        create_permission=ClinicalNotePermissions.CREATE,
        update_permission=ClinicalNotePermissions.UPDATE,
        detail_url_template="/api/v1/clinical-notes/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/clinical-notes/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ClinicalNotePermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar nota clínica",
                    message="La nota clínica se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="clinical_events",
        label="Eventos clínicos",
        api_path="/api/v1/clinical-events",
        view=ResourceView.TABLE,
        read_permission=ClinicalEventPermissions.READ,
        list_query=CLINICAL_EVENTS,
        list_schema=ClinicalEventListItem,
        create_schema=ClinicalEventCreate,
        update_schema=ClinicalEventUpdate,
        create_permission=ClinicalEventPermissions.CREATE,
        update_permission=ClinicalEventPermissions.UPDATE,
        detail_url_template="/api/v1/clinical-events/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/clinical-events/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ClinicalEventPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar evento clínico",
                    message="El evento se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="study_orders",
        label="Órdenes de estudio",
        api_path="/api/v1/study-orders",
        view=ResourceView.TABLE,
        read_permission=StudyOrderPermissions.READ,
        list_query=STUDY_ORDERS,
        list_schema=StudyOrderListItem,
        create_schema=StudyOrderCreate,
        update_schema=StudyOrderUpdate,
        create_permission=StudyOrderPermissions.CREATE,
        update_permission=StudyOrderPermissions.UPDATE,
        detail_url_template="/api/v1/study-orders/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/study-orders/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=StudyOrderPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar orden de estudio",
                    message="La orden se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="clinical_tasks",
        label="Tareas clínicas",
        api_path="/api/v1/clinical-tasks",
        view=ResourceView.TABLE,
        read_permission=ClinicalTaskPermissions.READ,
        list_query=CLINICAL_TASKS,
        list_schema=ClinicalTaskListItem,
        create_schema=ClinicalTaskCreate,
        update_schema=ClinicalTaskUpdate,
        create_permission=ClinicalTaskPermissions.CREATE,
        update_permission=ClinicalTaskPermissions.UPDATE,
        detail_url_template="/api/v1/clinical-tasks/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/clinical-tasks/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ClinicalTaskPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar tarea clínica",
                    message="La tarea se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="consultation_diagnoses",
        label="Diagnósticos de consulta",
        api_path="/api/v1/consultation-diagnoses",
        view=ResourceView.TABLE,
        read_permission=ConsultationDiagnosisPermissions.READ,
        list_query=CONSULTATION_DIAGNOSES,
        list_schema=ConsultationDiagnosisListItem,
        create_schema=ConsultationDiagnosisCreate,
        update_schema=ConsultationDiagnosisUpdate,
        create_permission=ConsultationDiagnosisPermissions.CREATE,
        update_permission=ConsultationDiagnosisPermissions.UPDATE,
        detail_url_template="/api/v1/consultation-diagnoses/{id}",
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/consultation-diagnoses/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ConsultationDiagnosisPermissions.DELETE,
                confirmation=ConfirmationDef(
                    title="Eliminar diagnóstico",
                    message="El diagnóstico se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="prescriptions",
        label="Recetas médicas",
        api_path="/api/v1/prescriptions",
        view=ResourceView.TABLE,
        read_permission=PrescriptionPermissions.READ,
        list_query=PRESCRIPTIONS,
        list_schema=PrescriptionListItem,
        create_schema=PrescriptionCreate,
        update_schema=PrescriptionUpdate,
        create_permission=PrescriptionPermissions.CREATE,
        update_permission=PrescriptionPermissions.UPDATE,
        detail_url_template="/api/v1/prescriptions/{id}",
        actions=(
            # approve sella la receta (draft -> approved). Cuerpo vacío por diseño.
            ActionDef(
                name="approve",
                label="Aprobar",
                method=HttpMethod.POST,
                url_template="/api/v1/prescriptions/{id}/approve",
                scope=ActionScope.ITEM,
                danger=False,
                permission=PrescriptionPermissions.APPROVE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y el endpoint no responda 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Aprobar receta",
                    message="La receta se aprobará y dejará de ser editable.",
                    confirm_label="Aprobar",
                    destructive=False,
                ),
            ),
            # void anula una receta aprobada; exige motivo (input_schema PrescriptionVoid).
            ActionDef(
                name="void",
                label="Anular",
                method=HttpMethod.POST,
                url_template="/api/v1/prescriptions/{id}/void",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PrescriptionPermissions.VOID,
                input_schema=PrescriptionVoid,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="approved",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Anular receta",
                    message="La receta aprobada quedará anulada. Indica el motivo.",
                    confirm_label="Anular",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/prescriptions/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PrescriptionPermissions.DELETE,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="draft",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Eliminar receta",
                    message="La receta en borrador se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="prescription_items",
        label="Renglones de receta",
        api_path="/api/v1/prescription-items",
        view=ResourceView.TABLE,
        # Los renglones reutilizan los permisos de la receta: crear/editar/eliminar un
        # renglón requiere prescriptions:update (la receta padre, en borrador, los gobierna).
        read_permission=PrescriptionPermissions.READ,
        list_query=PRESCRIPTION_ITEMS,
        list_schema=PrescriptionItemListItem,
        create_schema=PrescriptionItemCreate,
        update_schema=PrescriptionItemUpdate,
        create_permission=PrescriptionPermissions.UPDATE,
        update_permission=PrescriptionPermissions.UPDATE,
        detail_url_template="/api/v1/prescription-items/{id}",
        actions=(
            # El renglón no tiene estado propio: no se declara visible_when (el backend
            # revalida contra el estado de la receta padre).
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/prescription-items/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=PrescriptionPermissions.UPDATE,
                confirmation=ConfirmationDef(
                    title="Eliminar renglón",
                    message="El medicamento se quitará de la receta (baja lógica).",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="appointments",
        label="Agenda y citas",
        api_path="/api/v1/appointments",
        view=ResourceView.TABLE,
        read_permission=AppointmentPermissions.READ,
        list_query=APPOINTMENTS,
        list_schema=AppointmentListItem,
        create_schema=AppointmentCreate,
        update_schema=AppointmentUpdate,
        create_permission=AppointmentPermissions.CREATE,
        update_permission=AppointmentPermissions.UPDATE,
        detail_url_template="/api/v1/appointments/{id}",
        actions=(
            # Las transiciones de cita reutilizan appointments:update (no hay permisos
            # dedicados); el backend revalida cada transición de estado.
            ActionDef(
                name="confirm",
                label="Confirmar",
                method=HttpMethod.POST,
                url_template="/api/v1/appointments/{id}/confirm",
                scope=ActionScope.ITEM,
                danger=False,
                permission=AppointmentPermissions.UPDATE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y el endpoint no responda 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="pending",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Confirmar cita",
                    message="La cita pasará a confirmada.",
                    confirm_label="Confirmar",
                    destructive=False,
                    required=False,
                ),
            ),
            ActionDef(
                name="cancel",
                label="Cancelar",
                method=HttpMethod.POST,
                url_template="/api/v1/appointments/{id}/cancel",
                scope=ActionScope.ITEM,
                danger=True,
                permission=AppointmentPermissions.UPDATE,
                input_schema=AppointmentCancel,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.IN,
                            value=["pending", "confirmed"],
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Cancelar cita",
                    message="La cita se cancelará. Puedes indicar un motivo.",
                    confirm_label="Cancelar cita",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="no_show",
                label="No asistió",
                method=HttpMethod.POST,
                url_template="/api/v1/appointments/{id}/no-show",
                scope=ActionScope.ITEM,
                danger=True,
                permission=AppointmentPermissions.UPDATE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y el endpoint no responda 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="confirmed",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Marcar inasistencia",
                    message="La cita confirmada se marcará como no asistida.",
                    confirm_label="Marcar no asistió",
                    destructive=True,
                ),
            ),
            ActionDef(
                name="reschedule",
                label="Reagendar",
                method=HttpMethod.POST,
                url_template="/api/v1/appointments/{id}/reschedule",
                scope=ActionScope.ITEM,
                danger=False,
                permission=AppointmentPermissions.UPDATE,
                input_schema=AppointmentReschedule,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.IN,
                            value=["pending", "confirmed"],
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Reagendar cita",
                    message="Se creará la cita reprogramada con los datos indicados.",
                    confirm_label="Reagendar",
                    destructive=False,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/appointments/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=AppointmentPermissions.DELETE,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="pending",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Eliminar cita",
                    message="La cita pendiente se dará de baja lógica.",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="clinical_documents",
        label="Documentos clínicos",
        api_path="/api/v1/clinical-documents",
        view=ResourceView.TABLE,
        read_permission=ClinicalDocumentPermissions.READ,
        list_query=CLINICAL_DOCUMENTS,
        list_schema=ClinicalDocumentListItem,
        # La creación es multipart: los campos de metadata vienen de ``create_schema``
        # (contrato declarativo) y el binario de ``create_file_field``.
        create_schema=ClinicalDocumentCreateForm,
        create_permission=ClinicalDocumentPermissions.CREATE,
        create_transport=FormTransport.MULTIPART,
        create_file_field=ResourceFileFieldCapability(
            name="file",
            label="Archivo",
            accepted_mime_types=sorted(settings.clinical_document_allowed_mimes),
            max_size_bytes=settings.clinical_document_max_size_bytes,
            required=True,
        ),
        update_schema=ClinicalDocumentMetadataUpdate,
        update_permission=ClinicalDocumentPermissions.UPDATE,
        download_url_template="/api/v1/clinical-documents/{id}/download",
        download_permission=ClinicalDocumentPermissions.DOWNLOAD,
        detail_url_template="/api/v1/clinical-documents/{id}",
        actions=(
            # Las condiciones de estado son guía de UI; el backend revalida la transición
            # y responde 409 clinical_document_state_invalid si se fuerza la petición.
            ActionDef(
                name="archive",
                label="Archivar",
                method=HttpMethod.POST,
                url_template="/api/v1/clinical-documents/{id}/archive",
                scope=ActionScope.ITEM,
                danger=False,
                permission=ClinicalDocumentPermissions.ARCHIVE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y nunca reciba 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="active",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Archivar documento",
                    message="El documento quedará archivado (seguirá siendo descargable).",
                    confirm_label="Archivar",
                    destructive=False,
                    required=False,
                ),
            ),
            ActionDef(
                name="restore",
                label="Restaurar",
                method=HttpMethod.POST,
                url_template="/api/v1/clinical-documents/{id}/restore",
                scope=ActionScope.ITEM,
                danger=False,
                permission=ClinicalDocumentPermissions.RESTORE,
                # POST sin parámetros: cuerpo vacío explícito ({}) para que el cliente
                # capability-driven envíe un JSON válido y nunca reciba 422.
                fixed_body={},
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.EQ,
                            value="deleted",
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Restaurar documento",
                    message="El documento volverá a estar activo.",
                    confirm_label="Restaurar",
                    destructive=False,
                    required=False,
                ),
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/clinical-documents/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=ClinicalDocumentPermissions.DELETE,
                visible_when=ActionCondition(
                    all=[
                        ActionConditionPredicate(
                            field="status",
                            operator=ActionConditionOperator.IN,
                            value=["active", "archived"],
                        )
                    ]
                ),
                confirmation=ConfirmationDef(
                    title="Eliminar documento",
                    message="El documento se dará de baja lógica (no se descargará).",
                    confirm_label="Eliminar",
                    destructive=True,
                ),
            ),
        ),
    ),
    ResourceDefinition(
        name="permissions",
        label="Permisos",
        api_path="/api/v1/permissions",
        view=ResourceView.GROUPED_CATALOG,
        read_permission=PermissionPermissions.READ,
    ),
)


def get_resource(name: str) -> Optional[ResourceDefinition]:
    for definition in RESOURCE_REGISTRY:
        if definition.name == name:
            return definition
    return None
