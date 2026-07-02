from backend.app.security.security_group import SecurityGroup


class LabResultPermissions(SecurityGroup, label="Resultados de laboratorio"):
    READ = ("lab_results:read", "Listar resultados de laboratorio")
    CREATE = ("lab_results:create", "Registrar resultados de laboratorio")
    UPDATE = ("lab_results:update", "Editar resultados de laboratorio")
    DELETE = ("lab_results:delete", "Eliminar resultados de laboratorio")
