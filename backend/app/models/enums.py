from enum import Enum


class RecordStatus(str, Enum):
    """Estado operativo reusable para entidades activables del sistema."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class PatientStatus(str, Enum):
    """Estado administrativo reusable para expedientes de pacientes."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class Sex(str, Enum):
    """Sexo registrado para fines clínicos y administrativos."""

    FEMALE = "female"
    MALE = "male"
    OTHER = "other"
    UNSPECIFIED = "unspecified"


class PatientClinicalItemType(str, Enum):
    """Tipo de dato clínico importante del resumen del paciente."""

    ALLERGY = "allergy"
    CHRONIC_CONDITION = "chronic_condition"
    CURRENT_MEDICATION = "current_medication"
    RELEVANT_HABIT = "relevant_habit"
    CLINICAL_ALERT = "clinical_alert"
    OTHER = "other"


class ClinicalSeverity(str, Enum):
    """Severidad clínica reusable cuando aplica a un dato del paciente."""

    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class ClinicalItemStatus(str, Enum):
    """Estado reusable para datos clínicos importantes del paciente."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    RESOLVED = "resolved"
    SUSPENDED = "suspended"


class MedicalHistoryVersionStatus(str, Enum):
    """Estado de una versión de historia clínica."""

    DRAFT = "draft"
    CURRENT = "current"
    SUPERSEDED = "superseded"


class AppointmentStatus(str, Enum):
    """Estado operativo de una cita médica."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    ATTENDED = "attended"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
    NO_SHOW = "no_show"


class ConsultationStatus(str, Enum):
    """Estado clínico-operativo de una consulta médica."""

    DRAFT = "draft"
    FINALIZED = "finalized"


class ClinicalNoteStatus(str, Enum):
    """Estado de una nota clínica estructurada (p. ej. nota SOAP).

    Una nota se compone a partir de los datos REALES de la consulta y se guarda como
    ``draft``; NUNCA se finaliza de forma autónoma. El médico la aprueba (``approved``)."""

    DRAFT = "draft"
    APPROVED = "approved"


class ClinicalNoteKind(str, Enum):
    """Tipo de documento clínico estructurado almacenado como ``ClinicalNote``.

    ``nota_soap`` es la nota SOAP (fase 1); ``constancia`` es la constancia/justificante de
    asistencia; ``incapacidad`` es el justificante de reposo laboral; ``referencia`` es la carta
    de referencia a otra unidad/especialidad y ``contrarreferencia`` la respuesta de vuelta a la
    unidad que refirió. Todos se componen de datos REALES de la consulta y se guardan como
    borrador (nunca autofirmados)."""

    NOTA_SOAP = "nota_soap"
    CONSTANCIA = "constancia"
    INCAPACIDAD = "incapacidad"
    REFERENCIA = "referencia"
    CONTRARREFERENCIA = "contrarreferencia"


class ConsultationDiagnosisKind(str, Enum):
    """Tipo clínico de un diagnóstico o impresión diagnóstica de la consulta."""

    PRIMARY = "primary"
    SECONDARY = "secondary"
    SUSPECTED = "suspected"


class ConsultationAiOutputType(str, Enum):
    """Tipo de resultado generado por el copiloto de IA."""

    CLINICAL_NOTE = "clinical_note"
    SUMMARY = "summary"
    SUGGESTION = "suggestion"
    INSTRUCTIONS_DRAFT = "instructions_draft"
    OTHER = "other"


class AiOutputStatus(str, Enum):
    """Estado de revisión médica de un resultado generado por IA."""

    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


class PrescriptionStatus(str, Enum):
    """Estado operativo de una receta médica."""

    DRAFT = "draft"
    APPROVED = "approved"
    VOIDED = "voided"


class ActiveInactiveStatus(str, Enum):
    """Estado reusable para catálogos simples activables."""

    ACTIVE = "active"
    INACTIVE = "inactive"


class ClinicalDocumentType(str, Enum):
    """Tipo de archivo clínico asociado al expediente del paciente."""

    LABORATORY = "laboratory"
    STUDY = "study"
    IMAGE = "image"
    PDF = "pdf"
    EXTERNAL_PRESCRIPTION = "external_prescription"
    CLINICAL_PHOTOGRAPHY = "clinical_photography"
    CONSENT = "consent"
    REFERENCE = "reference"
    AUDIO = "audio"
    OTHER = "other"


class ClinicalDocumentStatus(str, Enum):
    """Estado operativo de un archivo clínico."""

    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class PregnancyStatus(str, Enum):
    """Estado de embarazo/lactancia del paciente (relevante para seguridad del medicamento)."""

    NONE = "none"
    PREGNANT = "pregnant"
    POSTPARTUM = "postpartum"
    LACTATING = "lactating"


class ClinicalEventType(str, Enum):
    """Tipo de evento clínico de la línea de tiempo del paciente."""

    HOSPITALIZATION = "hospitalization"
    EMERGENCY = "emergency"
    REFERRAL = "referral"
    PROCEDURE = "procedure"
    OTHER = "other"


class ClinicalEventStatus(str, Enum):
    """Estado de un evento clínico."""

    ACTIVE = "active"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class StudyOrderStatus(str, Enum):
    """Estado de una orden de estudio/laboratorio."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    RESULTED = "resulted"
    CANCELLED = "cancelled"


class ClinicalTaskPriority(str, Enum):
    """Prioridad de una tarea clínica de seguimiento."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ClinicalTaskStatus(str, Enum):
    """Estado de una tarea clínica de seguimiento."""

    OPEN = "open"
    DONE = "done"
    CANCELLED = "cancelled"


class LabResultAbnormalFlag(str, Enum):
    """Marca de anormalidad de un resultado de laboratorio/observación.

    ``unknown`` cubre los resultados aún sin clasificar (p. ej. extraídos de un
    archivo sin rango de referencia). Los valores fuera de rango clínico son
    ``low``/``high``; ``critical`` señala un valor de alerta que exige revisión."""

    NORMAL = "normal"
    LOW = "low"
    HIGH = "high"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class PatientHistoryItemCategory(str, Enum):
    """Categoría de un antecedente clínico estructurado del paciente.

    Son CATEGORÍAS de registro del expediente (no implican afirmación médica alguna):
    antecedentes familiares, quirúrgicos, obstétricos, y personales patológicos/no patológicos."""

    FAMILIAR = "familiar"
    QUIRURGICO = "quirurgico"
    OBSTETRICO = "obstetrico"
    PATOLOGICO = "patologico"
    NO_PATOLOGICO = "no_patologico"


class FamilyRelationship(str, Enum):
    """Parentesco del familiar en un antecedente familiar (opcional)."""

    PADRE = "padre"
    MADRE = "madre"
    HERMANO = "hermano"
    HERMANA = "hermana"
    ABUELO = "abuelo"
    ABUELA = "abuela"
    HIJO = "hijo"
    HIJA = "hija"
    OTRO = "otro"


class ImmunizationRoute(str, Enum):
    """Vía de administración de una vacuna (opcional)."""

    INTRAMUSCULAR = "intramuscular"
    SUBCUTANEA = "subcutanea"
    INTRADERMICA = "intradermica"
    ORAL = "oral"
    INTRANASAL = "intranasal"


class ImmunizationStatus(str, Enum):
    """Estado de registro de una inmunización."""

    APLICADA = "aplicada"
    NO_APLICADA = "no_aplicada"
    CONTRAINDICADA = "contraindicada"


class AiProvider(str, Enum):
    """Proveedor de IA de una credencial registrada por el usuario."""

    OPENCODE_ZEN = "opencode_zen"
    OPENCODE_GO = "opencode_go"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"


class AgentMemoryKind(str, Enum):
    """Tipo de memoria persistente que el agente acumula para el usuario médico."""

    NOTA = "nota"
    PREFERENCIA = "preferencia"
    HECHO_CLINICO = "hecho_clinico"
    RECORDATORIO = "recordatorio"


class AiCredentialType(str, Enum):
    """Tipo de credencial de proveedor de IA almacenada por el usuario.

    ``api_key`` guarda un secreto estático (API key). ``oauth`` guarda un perfil
    OAuth cifrado {access, refresh, expires, account_id} obtenido por el flujo
    browser-callback PKCE (p. ej. ChatGPT Plus/Codex)."""

    API_KEY = "api_key"
    OAUTH = "oauth"


class SettingCategory(str, Enum):
    """Categoría/ámbito de una configuración institucional (regla clínica configurable)."""

    VITAL_THRESHOLD = "vital_threshold"
    LAB_TARGET = "lab_target"
    FOLLOW_UP = "follow_up"
    PROTOCOL = "protocol"


class ClinicalCodeSystem(str, Enum):
    """Sistema de codificación clínica de un código del catálogo de apoyo.

    ``cie10`` para diagnósticos (CIE-10/ICD-10 de la OMS), ``loinc`` para analitos y
    observaciones de laboratorio (LOINC) y ``atc`` para medicamentos (clasificación
    ATC de la OMS). La cobertura sembrada es LIMITADA y extensible."""

    CIE10 = "cie10"
    LOINC = "loinc"
    ATC = "atc"


def enum_values(enum_class: type[Enum]) -> list[str]:
    return [str(member.value) for member in enum_class]
