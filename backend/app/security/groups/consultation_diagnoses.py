from backend.app.security.security_group import SecurityGroup


class ConsultationDiagnosisPermissions(SecurityGroup, label="Diagnósticos de consulta"):
    READ = ("consultation_diagnoses:read", "Listar diagnósticos de consulta")
    CREATE = ("consultation_diagnoses:create", "Registrar diagnósticos de consulta")
    UPDATE = ("consultation_diagnoses:update", "Editar diagnósticos de consulta")
    DELETE = ("consultation_diagnoses:delete", "Eliminar diagnósticos de consulta")
