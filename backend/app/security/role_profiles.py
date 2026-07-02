"""Perfiles de rol predefinidos para el sembrado inicial.

Hoy define el rol CLÍNICO por defecto ("Médico"): el conjunto de permisos con el que un médico
opera el copiloto desde el primer arranque. Incluye EXPLÍCITAMENTE ``patients:read`` y
``patients:create`` (MP-CTRL-0119): sin ``patients:create`` el recurso ``patients`` no es creable,
la tool ``clinical.create_patient_draft`` queda gateada en el copiloto (no declarable ni hallable
por ``tool_search``) y el agente responde que no puede crear pacientes. El alta de paciente sigue
pasando por la aprobación P1; este perfil sólo habilita OFRECERLA.

Regla del perfil clínico: puede CREAR todos los recursos clínicos EXCEPTO los restringidos
(resultados de escalas, antecedentes, inmunizaciones y notas clínicas estructuradas), que quedan en
sólo lectura. Nunca incluye borrado (``*:delete``) ni administración de usuarios/roles/configuración.
Única excepción de borrado: el HISTORIAL DE CHAT del copiloto (``messages:delete`` y
``conversations:reset``), que es baja lógica de mensajes del hilo, nunca de datos clínicos.
"""

from backend.app.security.catalog import declared_permissions

CLINICAL_ROLE_NAME = "Médico"
CLINICAL_ROLE_DESCRIPTION = (
    "Rol clínico: alta y atención de pacientes con el copiloto (borradores que el médico aprueba). "
    "Crea los recursos clínicos salvo los restringidos; sin borrado ni administración."
)

# Recursos clínicos que el médico puede CREAR (lectura + creación + edición y, donde aplica, su
# acción de ciclo de vida). ``patients`` va aquí EXPLÍCITAMENTE: es el hueco que corrige 0119.
_CREATABLE_CLINICAL: set[str] = {
    "patients:read", "patients:create", "patients:update",
    "consultations:read", "consultations:create", "consultations:update",
    "consultations:finalize",
    "consultation_diagnoses:read", "consultation_diagnoses:create",
    "consultation_diagnoses:update",
    "vital_signs:read", "vital_signs:create", "vital_signs:update",
    "lab_results:read", "lab_results:create", "lab_results:update",
    "clinical_events:read", "clinical_events:create", "clinical_events:update",
    "study_orders:read", "study_orders:create", "study_orders:update",
    "clinical_tasks:read", "clinical_tasks:create", "clinical_tasks:update",
    "prescriptions:read", "prescriptions:create", "prescriptions:update",
    "prescriptions:approve", "prescriptions:void",
    "appointments:read", "appointments:create", "appointments:update",
    "patient_clinical_items:read", "patient_clinical_items:create",
    "patient_clinical_items:update",
    "medical_history_versions:read", "medical_history_versions:create",
    "medical_history_versions:update", "medical_history_versions:finalize",
    "clinical_documents:read", "clinical_documents:create", "clinical_documents:update",
    "clinical_documents:download",
}

# Recursos clínicos RESTRINGIDOS a sólo lectura (NO creables por este rol).
_RESTRICTED_READ_ONLY: set[str] = {
    "scale_results:read",
    "patient_history_items:read",
    "patient_immunizations:read",
    "clinical_notes:read",
}

# Persistencia del chat del copiloto (chat-first): leer y crear conversaciones/mensajes. Persistir
# el hilo NO es una escritura clínica; habilita que el rol Médico tenga historial por paciente.
# EXCEPCIÓN a la regla "sin *:delete": ``messages:delete``/``conversations:reset`` borran (baja
# lógica) HISTORIAL DE CHAT del propio copiloto, nunca datos clínicos; permiten limpiar mensajes
# sueltos y reiniciar un hilo (completo o desde un punto).
_CHAT_PERSISTENCE: set[str] = {
    "conversations:read", "conversations:create", "conversations:reset",
    "messages:read", "messages:create", "messages:delete",
}

# Apoyo / referencia / copiloto: sólo lectura.
_SUPPORT_READ_ONLY: set[str] = {
    "clinical_scales:read",
    "clinical_codes:read",
    "medication_templates:read",
    "medication_reconciliation:read",
    "quality_checks:read",
    "follow_ups:read",
    "reports:read",
    "population:read",
    "audit_events:read",
    "institutional_settings:read",
    "doctors:read",
}

_CLINICAL_ROLE_ACCESS: set[str] = (
    _CREATABLE_CLINICAL | _RESTRICTED_READ_ONLY | _SUPPORT_READ_ONLY | _CHAT_PERSISTENCE
)


def clinical_role_permissions() -> set[str]:
    """Permisos del rol clínico por defecto, validados contra los permisos declarados.

    Falla ruidosamente si el perfil contiene un permiso inexistente (typo o permiso retirado),
    para que el sembrado nunca conceda un acceso no declarado.
    """
    undeclared = _CLINICAL_ROLE_ACCESS - declared_permissions()
    if undeclared:
        raise RuntimeError(
            f"Perfil de rol clínico con permisos no declarados: {sorted(undeclared)}"
        )
    return set(_CLINICAL_ROLE_ACCESS)
