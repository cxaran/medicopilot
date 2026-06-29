from backend.app.security.security_group import SecurityGroup


class FollowUpPermissions(SecurityGroup):
    # Capacidad de SÓLO LECTURA: reunir los pendientes accionables del médico (tareas abiertas/
    # vencidas, pacientes que no asistieron y resultados anormales sin revisar) para su revisión.
    # Permiso propio (no se reusa un read de tareas/citas/labs) porque es una vista transversal de
    # seguimiento que una organización puede otorgar por separado, igual que quality_checks:read y
    # medication_reconciliation:read.
    READ = (
        "follow_ups:read",
        "Ver los pendientes de seguimiento del médico (lectura)",
    )
