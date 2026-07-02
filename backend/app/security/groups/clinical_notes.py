from backend.app.security.security_group import SecurityGroup


class ClinicalNotePermissions(SecurityGroup, label="Notas clínicas"):
    # Notas clínicas estructuradas (p. ej. nota SOAP) compuestas de una consulta y
    # aprobadas por el médico (borradores P1). Permiso DEDICADO (no se reutiliza
    # clinical_documents): una nota es TEXTO estructurado, no un archivo binario; un admin
    # puede otorgar la redacción de notas por separado. Misma familia de roles clínicos.
    READ = ("clinical_notes:read", "Listar notas clínicas")
    CREATE = ("clinical_notes:create", "Registrar notas clínicas")
    UPDATE = ("clinical_notes:update", "Editar notas clínicas")
    DELETE = ("clinical_notes:delete", "Eliminar notas clínicas")
