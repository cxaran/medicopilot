from backend.app.security.security_group import SecurityGroup


class ClinicalCodePermissions(SecurityGroup):
    # Catálogo de códigos clínicos de apoyo (CIE-10/LOINC/ATC). La lectura asiste la
    # codificación y alimenta al copiloto; el alta/edición/baja son de administración.
    READ = ("clinical_codes:read", "Consultar códigos clínicos")
    CREATE = ("clinical_codes:create", "Registrar códigos clínicos")
    UPDATE = ("clinical_codes:update", "Editar códigos clínicos")
    DELETE = ("clinical_codes:delete", "Eliminar códigos clínicos")
