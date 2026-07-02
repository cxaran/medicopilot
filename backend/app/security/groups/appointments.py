from backend.app.security.security_group import SecurityGroup


class AppointmentPermissions(SecurityGroup, label="Agenda y citas"):
    """Permisos de agenda y citas. Las transiciones de estado (confirmar, cancelar,
    reprogramar, marcar inasistencia) reutilizan ``appointments:update``; no tienen
    permisos propios."""

    READ = ("appointments:read", "Listar citas de la agenda")
    CREATE = ("appointments:create", "Crear citas")
    UPDATE = ("appointments:update", "Editar y cambiar el estado de las citas")
    DELETE = ("appointments:delete", "Eliminar citas creadas por error")
