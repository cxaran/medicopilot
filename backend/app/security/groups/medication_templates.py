from backend.app.security.security_group import SecurityGroup


class MedicationTemplatePermissions(SecurityGroup, label="Plantillas de medicamentos"):
    """Permisos del catálogo de plantillas de medicamentos frecuentes.

    El ``status`` (active/inactive) es estado operativo editable vía
    create/update; la baja del catálogo es lógica (``deleted_at``) y la gobierna
    ``DELETE``.
    """

    READ = ("medication_templates:read", "Listar plantillas de medicamentos")
    CREATE = ("medication_templates:create", "Crear plantillas de medicamentos")
    UPDATE = ("medication_templates:update", "Actualizar plantillas de medicamentos")
    DELETE = ("medication_templates:delete", "Eliminar plantillas de medicamentos")
