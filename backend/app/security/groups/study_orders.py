from backend.app.security.security_group import SecurityGroup


class StudyOrderPermissions(SecurityGroup):
    READ = ("study_orders:read", "Listar órdenes de estudio")
    CREATE = ("study_orders:create", "Registrar órdenes de estudio")
    UPDATE = ("study_orders:update", "Editar órdenes de estudio")
    DELETE = ("study_orders:delete", "Eliminar órdenes de estudio")
