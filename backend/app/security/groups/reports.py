from backend.app.security.security_group import SecurityGroup


class ReportsPermissions(SecurityGroup):
    # Permiso de un rol con capacidad de calidad/auditoría (misma familia que
    # population:read): consultar reportes agregados (conteos/series), sin filas con PHI.
    READ = ("reports:read", "Consultar reportes agregados")
