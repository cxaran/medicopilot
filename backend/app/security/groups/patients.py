from backend.app.security.security_group import SecurityGroup


class PatientPermissions(SecurityGroup):
    READ = ("patients:read", "Listar pacientes")
    CREATE = ("patients:create", "Crear pacientes")
    UPDATE = ("patients:update", "Actualizar pacientes")
    DELETE = ("patients:delete", "Eliminar pacientes")
