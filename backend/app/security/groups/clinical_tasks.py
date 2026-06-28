from backend.app.security.security_group import SecurityGroup


class ClinicalTaskPermissions(SecurityGroup):
    READ = ("clinical_tasks:read", "Listar tareas clínicas")
    CREATE = ("clinical_tasks:create", "Crear tareas clínicas")
    UPDATE = ("clinical_tasks:update", "Editar tareas clínicas")
    DELETE = ("clinical_tasks:delete", "Eliminar tareas clínicas")
