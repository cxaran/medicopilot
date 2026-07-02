from backend.app.security.security_group import SecurityGroup


class PatientHistoryItemPermissions(SecurityGroup, label="Antecedentes del paciente"):
    # Antecedentes clínicos ESTRUCTURADOS del paciente (historia familiar/quirúrgica/obstétrica/
    # patológica/no patológica). Permisos propios, separados de patient_clinical_items (que son
    # problemas ACTIVOS del resumen): la historia tiene su propio gobierno de acceso.
    READ = ("patient_history_items:read", "Listar antecedentes clínicos del paciente")
    CREATE = ("patient_history_items:create", "Crear antecedentes clínicos del paciente")
    UPDATE = ("patient_history_items:update", "Actualizar antecedentes clínicos del paciente")
    DELETE = ("patient_history_items:delete", "Eliminar antecedentes clínicos del paciente")
