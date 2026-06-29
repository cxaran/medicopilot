from backend.app.security.security_group import SecurityGroup


class MedicationReconciliationPermissions(SecurityGroup):
    # Capacidad de SÓLO LECTURA: consolidar la medicación activa del paciente y marcar
    # discrepancias para revisión del médico. Permiso propio (no se reusa un read clínico)
    # porque es una vista transversal de seguridad del medicamento que una organización puede
    # otorgar por separado del acceso de lectura al expediente, igual que quality_checks:read.
    READ = (
        "medication_reconciliation:read",
        "Conciliar la medicación del paciente (lectura)",
    )
