from backend.app.security.security_group import SecurityGroup


class VitalSignPermissions(SecurityGroup, label="Signos vitales"):
    READ = ("vital_signs:read", "Listar signos vitales")
    CREATE = ("vital_signs:create", "Registrar signos vitales")
    UPDATE = ("vital_signs:update", "Editar signos vitales")
    DELETE = ("vital_signs:delete", "Eliminar signos vitales")
