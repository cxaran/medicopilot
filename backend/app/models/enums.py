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
    OTHER = "other"


class ClinicalDocumentStatus(str, Enum):
    """Estado operativo de un archivo clínico."""

    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class AiProvider(str, Enum):
    """Proveedor de IA de una credencial registrada por el usuario."""

    OPENCODE_ZEN = "opencode_zen"
    OPENCODE_GO = "opencode_go"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"


class AiCredentialType(str, Enum):
    """Tipo de credencial de proveedor de IA almacenada por el usuario.

    ``api_key`` guarda un secreto estático (API key). ``oauth`` guarda un perfil
    OAuth cifrado {access, refresh, expires, account_id} obtenido por el flujo
    browser-callback PKCE (p. ej. ChatGPT Plus/Codex)."""

    API_KEY = "api_key"
    OAUTH = "oauth"


def enum_values(enum_class: type[Enum]) -> list[str]:
    return [str(member.value) for member in enum_class]
