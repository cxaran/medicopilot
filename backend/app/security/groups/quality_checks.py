from backend.app.security.security_group import SecurityGroup


class QualityCheckPermissions(SecurityGroup):
    # Capacidad de SÓLO LECTURA: ejecutar verificaciones deterministas de calidad/seguridad
    # clínica que MARCAN posibles problemas para revisión del médico. No corrige ni escribe
    # nada. Se declara como permiso propio (no se reusa un read clínico) porque es una
    # capacidad transversal de revisión que una organización puede otorgar por separado del
    # acceso de lectura al expediente.
    READ = ("quality_checks:read", "Ejecutar verificaciones de calidad/seguridad clínica")
