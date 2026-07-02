from backend.app.security.security_group import SecurityGroup


class ClinicalScalePermissions(SecurityGroup, label="Escalas clínicas"):
    # Escalas clínicas validadas de apoyo a la decisión (cómputo determinista, sin estado).
    # Solo lectura: listar las escalas/insumos y computar un puntaje. No hay alta/edición/baja
    # porque las escalas son lógica clínica fija definida en código, no datos administrables.
    READ = ("clinical_scales:read", "Consultar y computar escalas clínicas")
