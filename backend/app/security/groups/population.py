from backend.app.security.security_group import SecurityGroup


class PopulationPermissions(SecurityGroup, label="Población y cohortes"):
    # Permiso de un rol con capacidad de calidad/auditoría: consultar cohortes
    # agregadas de la población de pacientes (conteo + muestra), sin alterar datos.
    READ = ("population:read", "Consultar cohortes de población")
