from backend.app.security.security_group import SecurityGroup


class AuditEventPermissions(SecurityGroup, label="Registros de auditoría"):
    # Permiso SENSIBLE de auditoría: consultar la bitácora append-only de eventos
    # (quién accedió/cambió qué y cuándo). Sólo lectura; expone identidad de actor y
    # detalle de cambios, por lo que es un gate dedicado y NO se reutiliza el de
    # population/reports (agregados sin PHI). No permite mutar la bitácora.
    READ = ("audit_events:read", "Consultar registros de auditoría")
