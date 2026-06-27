from backend.app.security.security_group import SecurityGroup


class DoctorPermissions(SecurityGroup):
    READ = ("doctors:read", "Listar médicos")
    CREATE = ("doctors:create", "Crear médicos")
    UPDATE = ("doctors:update", "Actualizar médicos")
    DELETE = ("doctors:delete", "Eliminar médicos")
