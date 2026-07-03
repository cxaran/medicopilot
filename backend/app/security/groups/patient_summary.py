from backend.app.security.security_group import SecurityGroup


class PatientSummaryPermissions(SecurityGroup, label="Resumen del paciente"):
    # Capacidad de SÓLO LECTURA: obtener el resumen clínico transversal de un paciente (datos
    # generales, historia, consultas, notas, vitales, recetas, labs/estudios, seguimiento, archivos
    # y citas) para el CONTEXTO del copiloto. Permiso propio (como follow_ups:read y
    # medication_reconciliation:read): una vista agregada que se puede otorgar por separado.
    READ = (
        "patient_summary:read",
        "Ver el resumen clínico del paciente (lectura)",
    )
