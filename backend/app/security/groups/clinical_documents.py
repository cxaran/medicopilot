from backend.app.security.security_group import SecurityGroup


class ClinicalDocumentPermissions(SecurityGroup):
    """Permisos del recurso de archivos clínicos.

    ``DOWNLOAD`` es un permiso explícito y **separado** de ``READ``: leer la metadata
    de un documento (tipo, fecha, tamaño) no implica autorización para descargar el
    contenido binario, que es información clínica más sensible. ``ARCHIVE``/``RESTORE``/
    ``DELETE`` gobiernan las transiciones de estado del ciclo de vida.
    """

    READ = ("clinical_documents:read", "Listar documentos clínicos")
    CREATE = ("clinical_documents:create", "Cargar documentos clínicos")
    UPDATE = ("clinical_documents:update", "Editar metadatos de documentos clínicos")
    ARCHIVE = ("clinical_documents:archive", "Archivar documentos clínicos")
    RESTORE = ("clinical_documents:restore", "Restaurar documentos clínicos")
    DELETE = ("clinical_documents:delete", "Eliminar documentos clínicos")
    DOWNLOAD = ("clinical_documents:download", "Descargar documentos clínicos")
