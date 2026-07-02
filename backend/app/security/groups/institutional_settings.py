from backend.app.security.security_group import SecurityGroup


class InstitutionalSettingPermissions(SecurityGroup, label="Configuración institucional"):
    # Administración de la configuración institucional (umbrales/metas/intervalos clínicos
    # configurables). Rol de administración; la lectura también alimenta al copiloto.
    READ = ("institutional_settings:read", "Listar configuración institucional")
    CREATE = ("institutional_settings:create", "Registrar configuración institucional")
    UPDATE = ("institutional_settings:update", "Editar configuración institucional")
    DELETE = ("institutional_settings:delete", "Eliminar configuración institucional")
