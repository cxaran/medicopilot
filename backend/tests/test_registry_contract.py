"""Test de contrato del RESOURCE_REGISTRY.

Recorre TODAS las ``ResourceDefinition`` de ``RESOURCE_REGISTRY`` y todas sus
acciones, verificando un conjunto de invariantes estructurales que previenen la
clase de bug 422 corregida en MP-CTRL-0006/0007 (un POST sin cuerpo declarado
hacía que el frontend enviara ``body: undefined`` y el endpoint, que declaraba un
parámetro de cuerpo Pydantic, respondía 422).

En el registry, una acción declara su cuerpo de dos formas mutuamente
excluyentes: ``fixed_body`` (cuerpo fijo, p. ej. ``{}`` o ``{"is_active": True}``)
o ``input_schema`` (formulario Pydantic con ``extra="forbid"``). La proyección
(``projection.py``) deriva ``request`` a partir de ``fixed_body`` y ``input_schema``
del propio ``input_schema``; aquí razonamos sobre los campos crudos del registry.

Invariantes (genéricas: cualquier acción futura queda cubierta sin tocar este
archivo):

- **I1 (exclusión)**: ninguna acción declara ``fixed_body`` e ``input_schema`` a
  la vez.
- **I2 (cuerpo definido / anti-422)**: toda acción mutadora (POST, PATCH o PUT)
  declara EXACTAMENTE uno de ``{fixed_body, input_schema}`` (nunca ninguno), para
  que el cliente jamás envíe el cuerpo sin definir.
- **I3 (POST sin parámetros)**: todo POST SIN ``input_schema`` declara
  ``fixed_body == {}`` (cuerpo vacío exacto, sin campos).
- **I4 (DELETE sin cuerpo)**: ningún DELETE declara ``fixed_body`` ni
  ``input_schema``.
"""

import os
import unittest


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "MedicoPilot Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "medicopilot",
}

os.environ.update(DEV_ENV)

from backend.app.resources.registry import RESOURCE_REGISTRY  # noqa: E402
from backend.app.schemas.capabilities import HttpMethod  # noqa: E402


# Métodos que envían cuerpo y, por tanto, deben declararlo explícitamente.
_MUTATING_METHODS = (HttpMethod.POST, HttpMethod.PATCH, HttpMethod.PUT)


class RegistryContractTest(unittest.TestCase):
    """Verifica las invariantes I1–I4 sobre todo el RESOURCE_REGISTRY."""

    def _all_actions(self):
        """Genera ``(resource_name, action)`` para cada acción del registry."""
        for definition in RESOURCE_REGISTRY:
            for action in definition.actions:
                yield definition.name, action

    def test_registry_has_actions(self) -> None:
        """Sanidad: el registry expone al menos una acción que validar."""
        actions = list(self._all_actions())
        self.assertGreater(
            len(actions),
            0,
            "RESOURCE_REGISTRY no declara ninguna acción; el contrato no validaría nada.",
        )

    def test_i1_fixed_body_and_input_schema_are_exclusive(self) -> None:
        """I1: ninguna acción declara fixed_body e input_schema a la vez."""
        for resource_name, action in self._all_actions():
            with self.subTest(resource=resource_name, action=action.name, invariant="I1"):
                self.assertFalse(
                    action.fixed_body is not None and action.input_schema is not None,
                    f"[I1] {resource_name}.{action.name}: declara fixed_body e "
                    "input_schema a la vez (son excluyentes).",
                )

    def test_i2_mutating_actions_declare_exactly_one_body(self) -> None:
        """I2: toda acción mutadora declara exactamente uno de fixed_body/input_schema."""
        for resource_name, action in self._all_actions():
            if action.method not in _MUTATING_METHODS:
                continue
            has_fixed_body = action.fixed_body is not None
            has_input_schema = action.input_schema is not None
            with self.subTest(resource=resource_name, action=action.name, invariant="I2"):
                self.assertEqual(
                    (has_fixed_body, has_input_schema).count(True),
                    1,
                    f"[I2] {resource_name}.{action.name} ({action.method.value}): "
                    "una acción mutadora debe declarar EXACTAMENTE uno de "
                    f"{{fixed_body, input_schema}} (anti-422); "
                    f"fixed_body={action.fixed_body!r}, input_schema={action.input_schema!r}.",
                )

    def test_i3_parameterless_post_has_empty_fixed_body(self) -> None:
        """I3: todo POST sin input_schema declara fixed_body == {} (vacío exacto)."""
        for resource_name, action in self._all_actions():
            if action.method is not HttpMethod.POST:
                continue
            if action.input_schema is not None:
                continue
            with self.subTest(resource=resource_name, action=action.name, invariant="I3"):
                self.assertEqual(
                    action.fixed_body,
                    {},
                    f"[I3] {resource_name}.{action.name} (POST sin input_schema): "
                    "debe declarar fixed_body == {} (cuerpo vacío exacto, sin campos); "
                    f"fixed_body={action.fixed_body!r}.",
                )

    def test_i4_delete_actions_declare_no_body(self) -> None:
        """I4: ningún DELETE declara fixed_body ni input_schema."""
        for resource_name, action in self._all_actions():
            if action.method is not HttpMethod.DELETE:
                continue
            with self.subTest(resource=resource_name, action=action.name, invariant="I4"):
                self.assertIsNone(
                    action.fixed_body,
                    f"[I4] {resource_name}.{action.name} (DELETE): no debe declarar "
                    f"fixed_body; fixed_body={action.fixed_body!r}.",
                )
                self.assertIsNone(
                    action.input_schema,
                    f"[I4] {resource_name}.{action.name} (DELETE): no debe declarar "
                    f"input_schema; input_schema={action.input_schema!r}.",
                )


if __name__ == "__main__":
    unittest.main()
