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

Además (MP-CTRL-0009) se verifica la GOBERNANZA DE CAMPOS de los schemas de
escritura expuestos al cliente (``create_schema``, ``update_schema`` y el
``input_schema`` de cada acción): ningún campo aceptado en esos cuerpos debe ser
un campo gobernado por el servidor (identificador, folio, auditoría, soft-delete,
snapshots, marcas de aprobación/anulación, etc.). Ver ``FieldGovernanceTest``.

Y (MP-CTRL-0010) se verifica la VALIDEZ DE LAS CONDICIONES de estado de las
acciones (``visible_when``/``enabled_when``, el DSL serializable añadido en
MP-CTRL-0005): cada predicado usa un operador soportado y referencia un campo que
el cliente realmente recibe por fila (el ``list_schema`` que serializa el row que
consume el evaluador client-side); si el campo no existiera, el evaluador no
podría evaluar la condición y el gating de UI se rompería en silencio. Ver
``ActionConditionValidityTest``.
"""

import enum
import os
import typing
import unittest
from typing import NamedTuple, Optional


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

from pydantic import BaseModel  # noqa: E402

from backend.app.resources.registry import RESOURCE_REGISTRY  # noqa: E402
from backend.app.schemas.capabilities import (  # noqa: E402
    ActionCondition,
    ActionConditionOperator,
    ActionConditionPredicate,
    HttpMethod,
)


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


# ---------------------------------------------------------------------------
# Gobernanza de campos de los schemas de escritura (MP-CTRL-0009)
# ---------------------------------------------------------------------------

# Conjunto de campos GOBERNADOS POR EL SERVIDOR que jamás deben aceptarse en un
# cuerpo de escritura del cliente. Si uno de estos aparece en un create_schema /
# update_schema / input_schema, el servidor estaría confiando en el cliente para
# fijar un valor que él mismo administra (identidad, folio, auditoría, ciclo de
# vida derivado, snapshots, etc.).
#
# La detección es por NOMBRE de campo, en tres formas:
#   - Coincidencia exacta (denylist explícito del contrato).
#   - Prefijos de grupos administrados por el servidor.
#   - Sufijos de auditoría.
_GOVERNED_EXACT = frozenset({"id", "status", "folio", "position", "rescheduled_from_id"})
_GOVERNED_PREFIXES = (
    "created_",
    "updated_",
    "deleted_",
    "approved_",
    "voided_",
    "snapshot",
)
_GOVERNED_SUFFIXES = ("_at", "_by")


def _is_server_governed(field_name: str) -> bool:
    """Indica si ``field_name`` luce como un campo administrado por el servidor."""
    if field_name in _GOVERNED_EXACT:
        return True
    if field_name.startswith(_GOVERNED_PREFIXES):
        return True
    if field_name.endswith(_GOVERNED_SUFFIXES):
        return True
    return False


# Excepciones EXPLÍCITAS y auditadas: campos cuyo nombre dispara la heurística
# anterior pero que, leídos los modelos reales, son entrada legítima del cliente
# (no los administra el servidor). Cada par ``(owner, field)`` se justifica abajo.
# ``owner`` es el nombre del recurso (para forms.create/forms.update) o
# ``"<recurso>.<acción>"`` (para el input_schema de una acción).
#
# Mantener este conjunto MÍNIMO: sólo se agrega un par cuando el campo es
# demostrablemente client-operable. ``test_exceptions_are_justified`` falla si
# una excepción deja de ser real o deja de disparar la heurística (evita que el
# allowlist enmascare campos por accidente o quede obsoleto).
_CLIENT_WRITABLE_EXCEPTIONS = frozenset(
    {
        # ``status`` operativo/clínico que el usuario fija (activa/inactiva,
        # activo/resuelto, etc.). Es distinto de la baja lógica (deleted_at) y
        # está documentado como client-operable en cada schema. NO es el status
        # de ciclo de vida gobernado por acciones (finalize/void/cancel/archive)
        # de consultations/prescriptions/appointments/clinical_documents, que NO
        # exponen ``status`` en sus write schemas.
        ("doctors", "status"),
        ("medication_templates", "status"),
        ("patients", "status"),
        ("patient_clinical_items", "status"),
        # Marcas temporales CLÍNICAS que captura el médico (no son auditoría). La
        # auditoría real (created_at/updated_at/deleted_at) queda cubierta por los
        # prefijos y nunca se expone en los write schemas.
        ("consultations", "consulted_at"),  # "Fecha de atención" (opcional)
        ("consultations", "next_appointment_at"),  # "Próxima cita sugerida"
        ("vital_signs", "measured_at"),  # "Fecha de medición"
        ("appointments", "scheduled_at"),  # "Inicio" de la cita
        ("appointments.reschedule", "scheduled_at"),  # nueva fecha al reagendar
    }
)


class WriteSchemaRef(NamedTuple):
    """Referencia a un schema de escritura expuesto al cliente.

    ``owner`` es la clave de ``_CLIENT_WRITABLE_EXCEPTIONS``: el nombre del
    recurso para forms.create/forms.update, o ``"<recurso>.<acción>"`` para el
    input_schema de una acción.
    """

    resource: str
    source_label: str
    owner: str
    schema: type[BaseModel]


def _write_schemas():
    """Genera un ``WriteSchemaRef`` por cada schema de ESCRITURA expuesto al
    cliente en todo el RESOURCE_REGISTRY: ``create_schema``, ``update_schema`` y
    el ``input_schema`` de cada acción."""
    for definition in RESOURCE_REGISTRY:
        if definition.create_schema is not None:
            yield WriteSchemaRef(
                definition.name, "forms.create", definition.name, definition.create_schema
            )
        if definition.update_schema is not None:
            yield WriteSchemaRef(
                definition.name, "forms.update", definition.name, definition.update_schema
            )
        for action in definition.actions:
            if action.input_schema is not None:
                yield WriteSchemaRef(
                    definition.name,
                    f"acción '{action.name}' (input_schema)",
                    f"{definition.name}.{action.name}",
                    action.input_schema,
                )


class FieldGovernanceTest(unittest.TestCase):
    """Verifica que ningún schema de escritura exponga campos server-governed."""

    def test_has_write_schemas(self) -> None:
        """Sanidad: el registry expone al menos un schema de escritura."""
        schemas = list(_write_schemas())
        self.assertGreater(
            len(schemas),
            0,
            "El RESOURCE_REGISTRY no expone ningún schema de escritura; la "
            "gobernanza de campos no validaría nada.",
        )

    def test_write_schemas_resolve_to_pydantic(self) -> None:
        """Cada schema de escritura resuelve a una clase Pydantic con model_fields."""
        for ref in _write_schemas():
            with self.subTest(resource=ref.resource, source=ref.source_label):
                self.assertTrue(
                    isinstance(ref.schema, type) and issubclass(ref.schema, BaseModel),
                    f"{ref.resource} / {ref.source_label}: el schema {ref.schema!r} no "
                    "es una subclase de pydantic.BaseModel.",
                )
                self.assertIsInstance(
                    ref.schema.model_fields,
                    dict,
                    f"{ref.resource} / {ref.source_label}: model_fields no es accesible.",
                )

    def test_no_server_governed_fields_exposed(self) -> None:
        """Ningún campo expuesto para escritura es un campo server-governed."""
        for ref in _write_schemas():
            for field_name in ref.schema.model_fields:
                if not _is_server_governed(field_name):
                    continue
                if (ref.owner, field_name) in _CLIENT_WRITABLE_EXCEPTIONS:
                    continue
                with self.subTest(
                    resource=ref.resource,
                    source=ref.source_label,
                    field=field_name,
                ):
                    self.fail(
                        f"[gobernanza] {ref.resource} / {ref.source_label}: el campo "
                        f"'{field_name}' es server-governed y NO debe exponerse para "
                        "escritura. Si es legítimamente client-operable, justifícalo "
                        "en _CLIENT_WRITABLE_EXCEPTIONS; de lo contrario, quítalo del "
                        "schema (no debe aceptarse en el cuerpo)."
                    )

    def test_exceptions_are_justified(self) -> None:
        """Cada excepción del allowlist debe ser real y disparar la heurística.

        Evita que ``_CLIENT_WRITABLE_EXCEPTIONS`` quede obsoleto o enmascare un
        campo que en realidad no es server-governed por nombre.
        """
        present = {
            (ref.owner, field_name)
            for ref in _write_schemas()
            for field_name in ref.schema.model_fields
        }
        for owner, field_name in _CLIENT_WRITABLE_EXCEPTIONS:
            with self.subTest(owner=owner, field=field_name):
                self.assertIn(
                    (owner, field_name),
                    present,
                    f"Excepción obsoleta: ({owner!r}, {field_name!r}) no existe en "
                    "ningún schema de escritura del registry.",
                )
                self.assertTrue(
                    _is_server_governed(field_name),
                    f"Excepción innecesaria: '{field_name}' no dispara la heurística "
                    "server-governed; no debería estar en el allowlist.",
                )


# ---------------------------------------------------------------------------
# Validez de condiciones de estado de acciones (MP-CTRL-0010)
# ---------------------------------------------------------------------------
#
# ``visible_when``/``enabled_when`` (DSL serializable añadido en MP-CTRL-0005) son
# instancias ``ActionCondition`` ya validadas por Pydantic al construirse en el
# registry: el operador es un enum (no puede ser un string arbitrario) y la forma
# (value presente/ausente según el operador, ``all`` no vacío) la valida
# ``ActionConditionPredicate._validate_shape`` / ``ActionCondition._validate_non_empty``.
# Lo que NO garantiza Pydantic es que el ``field`` referenciado EXISTA en el row que
# el cliente recibe: el evaluador client-side (``evaluateActionCondition`` en
# ``resource-action.ts``) evalúa cada predicado contra el item de la lista y, si el
# campo está ausente, es conservador (devuelve ``true``); es decir, una condición
# que apunte a un campo inexistente NO da error pero rompe el gating en silencio.
#
# Fuente real de los campos del row: la lista se sirve como ``OffsetPage[<ListItem>]``
# y ese ``<ListItem>`` es exactamente ``definition.list_schema``; sus ``model_fields``
# son los campos que el cliente recibe por fila.

_SUPPORTED_OPERATORS = frozenset(ActionConditionOperator)
_SCALAR_OPERATORS = frozenset({ActionConditionOperator.EQ, ActionConditionOperator.NEQ})
_LIST_OPERATORS = frozenset({ActionConditionOperator.IN, ActionConditionOperator.NOT_IN})


class ConditionRef(NamedTuple):
    """Referencia a una condición de estado declarada por una acción."""

    resource: str
    action: str
    kind: str  # "visible_when" | "enabled_when"
    condition: ActionCondition
    field_set: frozenset
    list_schema: Optional[type[BaseModel]]


def _resolve_enum(annotation) -> Optional[type[enum.Enum]]:
    """Subclase ``Enum`` del anotado (desenvolviendo ``Optional``/``Union``), o None."""
    for candidate in (annotation, *typing.get_args(annotation)):
        if isinstance(candidate, type) and issubclass(candidate, enum.Enum):
            return candidate
    return None


def _action_conditions():
    """Genera un ``ConditionRef`` por cada ``visible_when``/``enabled_when``
    declarado por cualquier acción del RESOURCE_REGISTRY."""
    for definition in RESOURCE_REGISTRY:
        for action in definition.actions:
            for kind in ("visible_when", "enabled_when"):
                condition = getattr(action, kind)
                if condition is None:
                    continue
                list_schema = definition.list_schema
                field_set = (
                    frozenset(list_schema.model_fields)
                    if list_schema is not None
                    else frozenset()
                )
                yield ConditionRef(
                    definition.name, action.name, kind, condition, field_set, list_schema
                )


class ActionConditionValidityTest(unittest.TestCase):
    """Verifica que cada condición de acción sea estructuralmente válida y
    referencie operadores y campos que el cliente realmente puede evaluar."""

    def test_has_conditions(self) -> None:
        """Sanidad: existe al menos una condición que validar."""
        refs = list(_action_conditions())
        self.assertGreater(
            len(refs),
            0,
            "Ninguna acción declara visible_when/enabled_when; el test no validaría "
            "nada.",
        )

    def test_resource_with_condition_has_list_schema(self) -> None:
        """Toda acción con condición pertenece a un recurso con ``list_schema``.

        Sin ``list_schema`` no hay row contra el cual el evaluador pueda resolver
        la condición.
        """
        for ref in _action_conditions():
            with self.subTest(resource=ref.resource, action=ref.action, kind=ref.kind):
                self.assertIsNotNone(
                    ref.list_schema,
                    f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: el recurso "
                    "no declara list_schema; el evaluador no tiene un row sobre el cual "
                    "evaluar la condición.",
                )

    def test_conditions_are_well_formed(self) -> None:
        """Cada condición es un ``ActionCondition`` con ``all`` no vacío de predicados."""
        for ref in _action_conditions():
            with self.subTest(resource=ref.resource, action=ref.action, kind=ref.kind):
                self.assertIsInstance(ref.condition, ActionCondition)
                self.assertTrue(
                    ref.condition.all_,
                    f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: 'all' no "
                    "puede estar vacío.",
                )
                for predicate in ref.condition.all_:
                    self.assertIsInstance(predicate, ActionConditionPredicate)
                    self.assertTrue(
                        isinstance(predicate.field, str) and predicate.field.strip(),
                        f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: un "
                        "predicado tiene 'field' vacío.",
                    )

    def test_operators_are_supported(self) -> None:
        """Cada predicado usa un operador del conjunto soportado por el contrato."""
        for ref in _action_conditions():
            for predicate in ref.condition.all_:
                with self.subTest(
                    resource=ref.resource,
                    action=ref.action,
                    kind=ref.kind,
                    field=predicate.field,
                ):
                    self.assertIn(
                        predicate.operator,
                        _SUPPORTED_OPERATORS,
                        f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: el "
                        f"operador {predicate.operator!r} sobre '{predicate.field}' no "
                        "está soportado.",
                    )

    def test_fields_exist_in_client_row(self) -> None:
        """Cada campo referenciado existe en el row que el cliente recibe."""
        for ref in _action_conditions():
            if ref.list_schema is None:
                continue  # cubierto por test_resource_with_condition_has_list_schema
            for predicate in ref.condition.all_:
                with self.subTest(
                    resource=ref.resource,
                    action=ref.action,
                    kind=ref.kind,
                    field=predicate.field,
                ):
                    self.assertIn(
                        predicate.field,
                        ref.field_set,
                        f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: el "
                        f"campo '{predicate.field}' no existe en el row que el cliente "
                        f"recibe (list_schema={ref.list_schema.__name__}); el evaluador "
                        "client-side no podría evaluarlo y el gating se rompería en "
                        "silencio.",
                    )

    def test_condition_values_match_enum_fields(self) -> None:
        """Coherencia de valor (robusta): cuando el campo resuelve a un ``Enum``, el
        valor comparado debe ser un miembro válido. Se omite para campos no-enum y
        para operadores sin valor (``is_null``/``not_null``)."""
        for ref in _action_conditions():
            if ref.list_schema is None:
                continue
            for predicate in ref.condition.all_:
                field_info = ref.list_schema.model_fields.get(predicate.field)
                if field_info is None:
                    continue  # cubierto por test_fields_exist_in_client_row
                enum_cls = _resolve_enum(field_info.annotation)
                if enum_cls is None:
                    continue
                if predicate.operator in _SCALAR_OPERATORS:
                    values = [predicate.value]
                elif predicate.operator in _LIST_OPERATORS:
                    values = list(predicate.value) if isinstance(predicate.value, list) else []
                else:
                    values = []
                allowed = {member.value for member in enum_cls}
                for value in values:
                    raw = getattr(value, "value", value)
                    with self.subTest(
                        resource=ref.resource,
                        action=ref.action,
                        kind=ref.kind,
                        field=predicate.field,
                        value=raw,
                    ):
                        self.assertIn(
                            raw,
                            allowed,
                            f"[condición] {ref.resource}.{ref.action} [{ref.kind}]: el "
                            f"valor {raw!r} comparado contra '{predicate.field}' no es "
                            f"un miembro válido de {enum_cls.__name__} "
                            f"({sorted(allowed)}).",
                        )


if __name__ == "__main__":
    unittest.main()
