from backend.app.security.security_group import SecurityGroup


class ClinicalEventPermissions(SecurityGroup, label="Eventos clínicos"):
    READ = ("clinical_events:read", "Listar eventos clínicos")
    CREATE = ("clinical_events:create", "Registrar eventos clínicos")
    UPDATE = ("clinical_events:update", "Editar eventos clínicos")
    DELETE = ("clinical_events:delete", "Eliminar eventos clínicos")
