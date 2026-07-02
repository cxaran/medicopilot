from backend.app.security.security_group import SecurityGroup


class MedicalHistoryVersionPermissions(SecurityGroup, label="Historia clínica"):
    READ = ("medical_history_versions:read", "Listar versiones de historia clínica")
    CREATE = ("medical_history_versions:create", "Crear borradores de historia clínica")
    UPDATE = ("medical_history_versions:update", "Editar borradores de historia clínica")
    DELETE = ("medical_history_versions:delete", "Eliminar borradores de historia clínica")
    FINALIZE = (
        "medical_history_versions:finalize",
        "Finalizar y validar versiones de historia clínica",
    )
