from backend.app.security.security_group import SecurityGroup


class ScaleResultPermissions(SecurityGroup):
    # Resultados de escalas clínicas computadas y aprobadas por el médico (borradores P1
    # persistidos). Misma familia de roles clínicos que resultados de laboratorio/eventos.
    READ = ("scale_results:read", "Listar resultados de escalas clínicas")
    CREATE = ("scale_results:create", "Registrar resultados de escalas clínicas")
    UPDATE = ("scale_results:update", "Editar resultados de escalas clínicas")
    DELETE = ("scale_results:delete", "Eliminar resultados de escalas clínicas")
