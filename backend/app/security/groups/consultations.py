from backend.app.security.security_group import SecurityGroup


class ConsultationPermissions(SecurityGroup):
    READ = ("consultations:read", "Listar consultas médicas")
    CREATE = ("consultations:create", "Crear consultas médicas")
    UPDATE = ("consultations:update", "Editar borradores de consulta")
    DELETE = ("consultations:delete", "Eliminar borradores de consulta")
    FINALIZE = ("consultations:finalize", "Finalizar consultas médicas")
