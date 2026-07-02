from backend.app.security.security_group import SecurityGroup


class PatientClinicalItemPermissions(SecurityGroup, label="Datos clínicos de pacientes"):
    READ = ("patient_clinical_items:read", "Listar datos clínicos de pacientes")
    CREATE = ("patient_clinical_items:create", "Crear datos clínicos de pacientes")
    UPDATE = ("patient_clinical_items:update", "Actualizar datos clínicos de pacientes")
    DELETE = ("patient_clinical_items:delete", "Eliminar datos clínicos de pacientes")
