from backend.app.security.security_group import SecurityGroup


class DoctorPermissions(SecurityGroup, label="Médicos"):
    READ = ("doctors:read", "Listar médicos")
    CREATE = ("doctors:create", "Crear médicos")
    UPDATE = ("doctors:update", "Actualizar médicos")
    DELETE = ("doctors:delete", "Eliminar médicos")
