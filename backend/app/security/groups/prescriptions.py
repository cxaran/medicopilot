from backend.app.security.security_group import SecurityGroup


class PrescriptionPermissions(SecurityGroup):
    """Permisos de recetas. Los renglones de medicamento heredan este grupo: leer un
    renglón exige ``prescriptions:read`` y crearlo/editarlo/eliminarlo,
    ``prescriptions:update``. No existe un grupo ``prescription_items``."""

    READ = ("prescriptions:read", "Listar recetas y sus medicamentos")
    CREATE = ("prescriptions:create", "Crear borradores de receta")
    UPDATE = ("prescriptions:update", "Editar borradores de receta y sus medicamentos")
    DELETE = ("prescriptions:delete", "Eliminar borradores de receta y sus medicamentos")
    APPROVE = ("prescriptions:approve", "Aprobar recetas")
    VOID = ("prescriptions:void", "Anular recetas aprobadas")
