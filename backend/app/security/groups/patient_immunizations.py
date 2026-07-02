from backend.app.security.security_group import SecurityGroup


class PatientImmunizationPermissions(SecurityGroup, label="Inmunizaciones del paciente"):
    # Esquema de vacunación del paciente (inmunizaciones aplicadas). Permisos propios, separados
    # de los demás recursos clínicos: el registro de vacunación tiene su propio gobierno de acceso.
    READ = ("patient_immunizations:read", "Listar inmunizaciones del paciente")
    CREATE = ("patient_immunizations:create", "Crear inmunizaciones del paciente")
    UPDATE = ("patient_immunizations:update", "Actualizar inmunizaciones del paciente")
    DELETE = ("patient_immunizations:delete", "Eliminar inmunizaciones del paciente")
