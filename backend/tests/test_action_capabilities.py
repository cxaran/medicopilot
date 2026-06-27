"""Contrato genérico de acciones (Commit D): opciones de formulario, ``input_schema``
y condiciones de estado (``visible_when``/``enabled_when``).

Estos tests usan schemas y recursos *locales* del test: no registran acciones clínicas
reales (eso es trabajo de commits posteriores). Validan la infraestructura genérica:
la proyección, la validación temprana en ``ActionDef`` y el DSL de condiciones.
"""

import os
import unittest
import uuid
from datetime import date, time
from typing import Optional


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

import json  # noqa: E402

from pydantic import BaseModel, Field  # noqa: E402

from backend.app.resources.projection import (  # noqa: E402
    _action_capability,
    _build_capability,
)
from backend.app.resources.registry import (  # noqa: E402
    ActionDef,
    ConfirmationDef,
    ResourceDefinition,
)
from backend.app.schemas.base import ApiWriteSchema  # noqa: E402
from backend.app.schemas.capabilities import (  # noqa: E402
    ActionCondition,
    ActionConditionOperator,
    ActionConditionPredicate,
    ActionScope,
    FieldValueType,
    HttpMethod,
    ResourceView,
    WidgetType,
)
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.groups.users import UserPermissions  # noqa: E402


# --- Schemas de entrada locales (representan formularios de acción) ---


class VoidActionInput(ApiWriteSchema):
    void_reason: str = Field(
        title="Motivo de anulación",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class CancelActionInput(ApiWriteSchema):
    cancellation_reason: Optional[str] = Field(
        default=None,
        title="Motivo de cancelación",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class RescheduleActionInput(ApiWriteSchema):
    scheduled_date: date = Field(
        title="Nueva fecha",
        json_schema_extra={"ui": {"form": True, "widget": "date"}},
    )
    scheduled_time: Optional[time] = Field(
        default=None,
        title="Nueva hora",
        json_schema_extra={"ui": {"form": True, "widget": "time"}},
    )
    duration_minutes: Optional[int] = Field(
        default=None,
        title="Duración (min)",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    doctor_id: Optional[uuid.UUID] = Field(
        default=None,
        title="Médico",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    reason: Optional[str] = Field(
        default=None,
        title="Motivo",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    internal_notes: Optional[str] = Field(
        default=None,
        title="Notas internas",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


def _action(**overrides: object) -> ActionDef:
    base: dict[str, object] = dict(
        name="reschedule",
        label="Reagendar",
        method=HttpMethod.POST,
        url_template="/api/v1/_test/{id}/reschedule",
        scope=ActionScope.ITEM,
        danger=False,
        permission=UserPermissions.UPDATE,
    )
    base.update(overrides)
    return ActionDef(**base)  # type: ignore[arg-type]


def _session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


# --- B2: validación temprana en ActionDef ---


class ActionDefValidationTest(unittest.TestCase):
    def test_fixed_body_and_input_schema_are_mutually_exclusive(self) -> None:
        with self.assertRaises(ValueError):
            _action(fixed_body={"status": "void"}, input_schema=VoidActionInput)

    def test_input_schema_must_forbid_extra(self) -> None:
        class Loose(BaseModel):  # sin extra="forbid"
            x: str = Field(json_schema_extra={"ui": {"form": True, "widget": "text"}})

        with self.assertRaises(ValueError):
            _action(input_schema=Loose)

    def test_input_schema_only_is_valid(self) -> None:
        action = _action(input_schema=VoidActionInput)
        self.assertIsNone(action.fixed_body)
        self.assertIs(action.input_schema, VoidActionInput)

    def test_fixed_body_only_is_valid(self) -> None:
        action = _action(fixed_body={"status": "void"})
        self.assertIsNone(action.input_schema)


# --- B2: proyección de input_schema ---


class ActionInputSchemaProjectionTest(unittest.TestCase):
    def test_no_body_no_input_schema(self) -> None:
        cap = _action_capability(_action())
        self.assertIsNone(cap.request)
        self.assertIsNone(cap.input_schema)

    def test_fixed_body_projects_request_not_input_schema(self) -> None:
        cap = _action_capability(_action(fixed_body={"status": "void"}))
        assert cap.request is not None
        self.assertEqual(cap.request.fixed_body, {"status": "void"})
        self.assertIsNone(cap.input_schema)

    def test_input_schema_projects_form_fields(self) -> None:
        cap = _action_capability(_action(input_schema=RescheduleActionInput))
        self.assertIsNone(cap.request)
        assert cap.input_schema is not None
        fields = {f.name: f for f in cap.input_schema.fields}
        # Obligatoriedad: scheduled_date requerido, el resto opcional.
        self.assertTrue(fields["scheduled_date"].required)
        self.assertFalse(fields["scheduled_time"].required)
        self.assertFalse(fields["internal_notes"].required)
        # Widgets/tipos: date, time, number, textarea.
        self.assertEqual(fields["scheduled_date"].widget, WidgetType.DATE)
        self.assertEqual(fields["scheduled_date"].type, FieldValueType.DATE)
        self.assertEqual(fields["scheduled_time"].widget, WidgetType.TIME)
        self.assertEqual(fields["scheduled_time"].type, FieldValueType.TIME)
        self.assertEqual(fields["duration_minutes"].widget, WidgetType.NUMBER)
        self.assertEqual(fields["duration_minutes"].type, FieldValueType.INTEGER)
        self.assertEqual(fields["internal_notes"].widget, WidgetType.TEXTAREA)

    def test_textarea_only_input_schema(self) -> None:
        cap = _action_capability(_action(name="void", input_schema=VoidActionInput))
        assert cap.input_schema is not None
        field = cap.input_schema.fields[0]
        self.assertEqual(field.name, "void_reason")
        self.assertTrue(field.required)
        self.assertEqual(field.widget, WidgetType.TEXTAREA)

    def test_optional_textarea_input_schema(self) -> None:
        cap = _action_capability(_action(name="cancel", input_schema=CancelActionInput))
        assert cap.input_schema is not None
        field = cap.input_schema.fields[0]
        self.assertEqual(field.name, "cancellation_reason")
        self.assertFalse(field.required)


# --- B3: DSL de condiciones (validación temprana) ---


class ActionConditionDSLTest(unittest.TestCase):
    def test_eq_requires_value(self) -> None:
        with self.assertRaises(ValueError):
            ActionConditionPredicate(field="status", operator=ActionConditionOperator.EQ)

    def test_in_requires_non_empty_list(self) -> None:
        with self.assertRaises(ValueError):
            ActionConditionPredicate(
                field="status", operator=ActionConditionOperator.IN, value="draft"
            )
        with self.assertRaises(ValueError):
            ActionConditionPredicate(
                field="status", operator=ActionConditionOperator.IN, value=[]
            )

    def test_is_null_forbids_value(self) -> None:
        with self.assertRaises(ValueError):
            ActionConditionPredicate(
                field="voided_at",
                operator=ActionConditionOperator.IS_NULL,
                value="x",
            )

    def test_not_null_without_value_is_valid(self) -> None:
        predicate = ActionConditionPredicate(
            field="approved_at", operator=ActionConditionOperator.NOT_NULL
        )
        self.assertIsNone(predicate.value)

    def test_empty_field_rejected(self) -> None:
        with self.assertRaises(ValueError):
            ActionConditionPredicate(
                field="  ", operator=ActionConditionOperator.NOT_NULL
            )

    def test_empty_all_rejected(self) -> None:
        with self.assertRaises(ValueError):
            ActionCondition(all=[])

    def test_condition_serializes_with_all_alias(self) -> None:
        condition = ActionCondition(
            all=[
                ActionConditionPredicate(
                    field="status",
                    operator=ActionConditionOperator.EQ,
                    value="draft",
                )
            ]
        )
        dumped = condition.model_dump(by_alias=True, exclude_none=True)
        self.assertIn("all", dumped)
        self.assertEqual(dumped["all"][0]["field"], "status")
        self.assertEqual(dumped["all"][0]["operator"], "eq")
        self.assertEqual(dumped["all"][0]["value"], "draft")


# --- B3: proyección de condiciones en la capability ---


class ActionConditionProjectionTest(unittest.TestCase):
    def _capability_payload(self) -> dict:
        visible = ActionCondition(
            all=[
                ActionConditionPredicate(
                    field="status",
                    operator=ActionConditionOperator.EQ,
                    value="draft",
                )
            ]
        )
        enabled = ActionCondition(
            all=[
                ActionConditionPredicate(
                    field="voided_at", operator=ActionConditionOperator.IS_NULL
                ),
                ActionConditionPredicate(
                    field="status",
                    operator=ActionConditionOperator.IN,
                    value=["draft", "active"],
                ),
            ]
        )
        action = _action(
            input_schema=VoidActionInput,
            visible_when=visible,
            enabled_when=enabled,
            confirmation=ConfirmationDef(
                title="Anular",
                message="La acción anula el registro.",
                confirm_label="Anular",
                destructive=True,
            ),
        )
        definition = ResourceDefinition(
            name="_test_resource",
            label="Recurso de prueba",
            api_path="/api/v1/_test",
            view=ResourceView.TABLE,
            read_permission=UserPermissions.READ,
            actions=(action,),
        )
        capability = _build_capability(definition, _session_user("users:read", "users:update"))
        return capability.model_dump(by_alias=True, exclude_none=True)

    def test_visible_and_enabled_when_are_published(self) -> None:
        payload = self._capability_payload()
        action = payload["actions"][0]
        self.assertEqual(action["visible_when"]["all"][0]["operator"], "eq")
        self.assertEqual(action["visible_when"]["all"][0]["value"], "draft")
        enabled = action["enabled_when"]["all"]
        self.assertEqual(enabled[0]["operator"], "is_null")
        self.assertNotIn("value", enabled[0])  # is_null no lleva value
        self.assertEqual(enabled[1]["operator"], "in")
        self.assertEqual(enabled[1]["value"], ["draft", "active"])

    def test_input_schema_serialized_not_python_class(self) -> None:
        payload = self._capability_payload()
        action = payload["actions"][0]
        self.assertIn("input_schema", action)
        self.assertEqual(action["input_schema"]["fields"][0]["name"], "void_reason")
        self.assertNotIn("request", action)

    def test_permission_not_serialized(self) -> None:
        payload = self._capability_payload()
        blob = json.dumps(payload)
        self.assertNotIn("users:update", blob)
        self.assertNotIn("users:read", blob)
        self.assertNotIn("permission", blob)


if __name__ == "__main__":
    unittest.main()
