import os
import unittest
import uuid


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

from fastapi.testclient import TestClient  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.resources.projection import (  # noqa: E402
    CapabilityConfigError,
    _require_label,
)
from backend.app.resources.registry import USERS  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


client = TestClient(app)


def session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


class _As:
    """Context manager que sobreescribe ``get_current_user`` con permisos dados."""

    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: session_user(*self.permissions)

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class ResourcesAuthTest(unittest.TestCase):
    def test_anonymous_gets_401(self) -> None:
        self.assertEqual(client.get("/api/v1/resources").status_code, 401)

    def test_partial_permissions_only_returns_allowed_resources(self) -> None:
        with _As("users:read"):
            body = client.get("/api/v1/resources").json()
        names = [resource["name"] for resource in body]
        self.assertEqual(names, ["users"])

    def test_revoke_visible_resource_requires_read_not_revoke(self) -> None:
        # Tiene revoke pero no read: no debe ver el recurso users en el catálogo.
        with _As("users:revoke_sessions"):
            body = client.get("/api/v1/resources").json()
        self.assertEqual([r["name"] for r in body], [])

    def test_hidden_and_missing_return_same_404(self) -> None:
        with _As("users:read"):
            hidden = client.get("/api/v1/resources/roles")
            missing = client.get("/api/v1/resources/does-not-exist")
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(hidden.json(), missing.json())
        self.assertEqual(hidden.json()["code"], "resource_not_found")


class ResourcesActionTest(unittest.TestCase):
    def test_revoke_action_absent_without_permission(self) -> None:
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        action_names = [action["name"] for action in users["actions"]]
        self.assertNotIn("revoke_sessions", action_names)

    def test_revoke_action_present_with_permission(self) -> None:
        with _As("users:read", "users:revoke_sessions"):
            users = client.get("/api/v1/resources/users").json()
        action = next(a for a in users["actions"] if a["name"] == "revoke_sessions")
        self.assertEqual(action["method"], "POST")
        self.assertEqual(action["url_template"], "/api/v1/users/{id}/revoke-sessions")
        self.assertEqual(action["scope"], "item")
        self.assertTrue(action["danger"])

    def test_delete_action_only_with_delete_permission(self) -> None:
        with _As("users:read"):
            without = client.get("/api/v1/resources/users").json()
        with _As("users:read", "users:delete"):
            withp = client.get("/api/v1/resources/users").json()
        self.assertNotIn("delete", [a["name"] for a in without["actions"]])
        self.assertIn("delete", [a["name"] for a in withp["actions"]])

    def test_forms_omitted_without_permission(self) -> None:
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        self.assertNotIn("forms", users)

    def test_create_form_present_only_with_create_permission(self) -> None:
        with _As("users:read", "users:create"):
            users = client.get("/api/v1/resources/users").json()
        self.assertIn("create", users["forms"])
        self.assertNotIn("update", users["forms"])
        create = users["forms"]["create"]
        self.assertEqual(create["method"], "POST")
        self.assertEqual(create["url_template"], "/api/v1/users")
        names = [f["name"] for f in create["fields"]]
        self.assertIn("password", names)
        password = next(f for f in create["fields"] if f["name"] == "password")
        self.assertEqual(password["widget"], "password")


class RevokeEndpointPermissionTest(unittest.TestCase):
    def test_revoke_with_update_but_not_revoke_is_403(self) -> None:
        with _As("users:update"):
            response = client.post(f"/api/v1/users/{uuid.uuid4()}/revoke-sessions")
        self.assertEqual(response.status_code, 403)


class PermissionsResourceTest(unittest.TestCase):
    def test_permissions_requires_its_read_permission(self) -> None:
        with _As("users:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertNotIn("permissions", names)

    def test_permissions_is_grouped_catalog_without_table_shape(self) -> None:
        with _As("permissions:read"):
            body = client.get("/api/v1/resources/permissions").json()
        self.assertEqual(body["view"], "grouped_catalog")
        self.assertNotIn("list", body)
        self.assertNotIn("forms", body)
        self.assertEqual(body["actions"], [])


class CapabilityContentTest(unittest.TestCase):
    def test_no_permission_strings_leak_in_payload(self) -> None:
        with _As(*declared_permissions()):
            blob = json.dumps(client.get("/api/v1/resources").json())
        leaks = [permission for permission in declared_permissions() if permission in blob]
        self.assertEqual(leaks, [])

    def test_id_not_a_default_list_column(self) -> None:
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        self.assertNotIn("id", [field["name"] for field in users["list"]["fields"]])

    def test_all_projected_fields_have_labels(self) -> None:
        with _As(*declared_permissions()):
            resources = client.get("/api/v1/resources").json()
        for resource in resources:
            for field in resource.get("list", {}).get("fields", []):
                self.assertTrue(field["label"], resource["name"])
            forms = resource.get("forms", {})
            for form in (forms.get("create"), forms.get("update")):
                for field in (form or {}).get("fields", []):
                    self.assertTrue(field["label"], resource["name"])

    def test_list_capabilities_reflect_query_plan(self) -> None:
        plan = USERS.plan
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        list_cap = users["list"]
        self.assertEqual(list_cap["sort"]["default_sort"], plan.default_order)
        self.assertFalse(list_cap["sort"]["fixed_server_order"])
        for field in list_cap["fields"]:
            self.assertEqual(field["sortable"], field["name"] in plan.public_sort_columns)

    def test_missing_label_raises(self) -> None:
        class NoLabel(BaseModel):
            value: str = Field(json_schema_extra={"ui": {"list": True}})

        with self.assertRaises(CapabilityConfigError):
            _require_label(NoLabel.model_fields["value"], "value")


class ResourceRelationsTest(unittest.TestCase):
    def test_roles_relation_absent_without_manage_roles(self) -> None:
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        self.assertEqual(users.get("relations", []), [])

    def test_roles_relation_present_with_manage_roles(self) -> None:
        with _As("users:read", "users:manage_roles"):
            users = client.get("/api/v1/resources/users").json()
        relation = next(r for r in users["relations"] if r["name"] == "roles")
        self.assertTrue(relation["editable"])
        self.assertEqual(relation["selection_url"], "/api/v1/users/{id}/roles")
        self.assertEqual(relation["mutation_method"], "PUT")
        self.assertEqual(relation["mutation_url"], "/api/v1/users/{id}/roles")
        self.assertEqual(relation["request_field"], "role_ids")
        # Selección paginada: sin selection_field (se lee items[].id).
        self.assertNotIn("selection_field", relation)
        self.assertEqual(relation["options"]["type"], "list")
        self.assertEqual(relation["options"]["url"], "/api/v1/roles")
        self.assertEqual(relation["options"]["value_field"], "id")
        self.assertEqual(relation["options"]["label_field"], "name")

    def test_permissions_relation_present_with_manage_permissions(self) -> None:
        with _As("roles:read", "roles:manage_permissions"):
            roles = client.get("/api/v1/resources/roles").json()
        relation = next(r for r in roles["relations"] if r["name"] == "permissions")
        self.assertEqual(relation["selection_url"], "/api/v1/roles/{id}/permissions")
        self.assertEqual(relation["selection_field"], "permissions")
        self.assertEqual(relation["mutation_url"], "/api/v1/roles/{id}/permissions")
        self.assertEqual(relation["request_field"], "permissions")
        self.assertEqual(relation["options"]["type"], "grouped_catalog")
        self.assertEqual(relation["options"]["url"], "/api/v1/permissions")
        self.assertEqual(relation["options"]["value_field"], "access")

    def test_permissions_relation_absent_without_manage_permissions(self) -> None:
        with _As("roles:read"):
            roles = client.get("/api/v1/resources/roles").json()
        self.assertEqual(roles.get("relations", []), [])


class ResourceActionContractTest(unittest.TestCase):
    def _users_actions(self, *permissions: str) -> dict:
        with _As(*permissions):
            users = client.get("/api/v1/resources/users").json()
        return {action["name"]: action for action in users["actions"]}

    def test_deactivate_reuses_patch_with_fixed_body(self) -> None:
        actions = self._users_actions("users:read", "users:update")
        deactivate = actions["deactivate"]
        self.assertEqual(deactivate["method"], "PATCH")
        self.assertEqual(deactivate["url_template"], "/api/v1/users/{id}")
        self.assertEqual(deactivate["request"]["content_type"], "application/json")
        self.assertEqual(deactivate["request"]["fixed_body"], {"is_active": False})
        self.assertEqual(deactivate["success_behavior"], "refresh")

    def test_activate_reuses_patch_with_fixed_body(self) -> None:
        actions = self._users_actions("users:read", "users:update")
        self.assertEqual(actions["activate"]["request"]["fixed_body"], {"is_active": True})

    def test_destructive_actions_require_confirmation(self) -> None:
        actions = self._users_actions(
            "users:read", "users:update", "users:revoke_sessions", "users:delete"
        )
        for name in ("deactivate", "revoke_sessions", "delete"):
            confirmation = actions[name]["confirmation"]
            self.assertTrue(confirmation["required"], name)
            self.assertTrue(confirmation["destructive"], name)
            self.assertTrue(confirmation["title"] and confirmation["confirm_label"], name)

    def test_activate_confirmation_is_explicit_but_optional(self) -> None:
        actions = self._users_actions("users:read", "users:update")
        confirmation = actions["activate"]["confirmation"]
        self.assertFalse(confirmation["required"])
        self.assertFalse(confirmation["destructive"])

    def test_revoke_sessions_sends_empty_body(self) -> None:
        # revoke_sessions es POST sin parámetros: publica request.fixed_body == {}
        # (cuerpo vacío explícito) y nunca input_schema.
        actions = self._users_actions("users:read", "users:revoke_sessions")
        revoke = actions["revoke_sessions"]
        self.assertEqual(revoke["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", revoke)

    def test_update_actions_absent_without_update_permission(self) -> None:
        actions = self._users_actions("users:read")
        self.assertNotIn("activate", actions)
        self.assertNotIn("deactivate", actions)

    def test_permissions_resource_has_no_actions(self) -> None:
        with _As("permissions:read"):
            permissions = client.get("/api/v1/resources/permissions").json()
        self.assertEqual(permissions["actions"], [])

    def test_forging_capability_does_not_bypass_backend(self) -> None:
        # Aunque el frontend forje una acción, el backend exige el permiso real.
        with _As("users:read"):
            response = client.patch(
                f"/api/v1/users/{uuid.uuid4()}", json={"is_active": False}
            )
        self.assertEqual(response.status_code, 403)


class ItemReferenceAndDetailTest(unittest.TestCase):
    def test_users_publish_item_reference_and_detail(self) -> None:
        with _As("users:read"):
            users = client.get("/api/v1/resources/users").json()
        self.assertEqual(
            users["item_reference"],
            {"field": "id", "placeholder": "id", "type": "uuid"},
        )
        self.assertEqual(users["detail"]["method"], "GET")
        self.assertEqual(users["detail"]["url_template"], "/api/v1/users/{id}")

    def test_roles_detail_url(self) -> None:
        with _As("roles:read"):
            roles = client.get("/api/v1/resources/roles").json()
        self.assertEqual(roles["detail"]["url_template"], "/api/v1/roles/{id}")

    def test_grouped_catalog_has_no_item_reference_or_detail(self) -> None:
        with _As("permissions:read"):
            permissions = client.get("/api/v1/resources/permissions").json()
        self.assertNotIn("item_reference", permissions)
        self.assertNotIn("detail", permissions)

    def test_update_form_fields_are_editable(self) -> None:
        with _As("users:read", "users:update"):
            users = client.get("/api/v1/resources/users").json()
        update_fields = users["forms"]["update"]["fields"]
        self.assertTrue(update_fields)
        for field in update_fields:
            self.assertTrue(field["editable"])
        names = [field["name"] for field in update_fields]
        # El generic update no expone relaciones ni secretos.
        self.assertNotIn("roles", names)
        self.assertNotIn("password", names)
        self.assertNotIn("token", names)


class PermissionsCatalogTest(unittest.TestCase):
    def test_requires_permissions_read(self) -> None:
        with _As("users:read"):
            self.assertEqual(client.get("/api/v1/permissions").status_code, 403)

    def test_grouped_catalog_exposes_labels(self) -> None:
        with _As("permissions:read"):
            groups = client.get("/api/v1/permissions").json()
        names = [group["name"] for group in groups]
        self.assertEqual(names, ["users", "roles", "doctors", "medication_templates", "patients", "patient_clinical_items", "patient_history_items", "patient_immunizations", "medical_history_versions", "consultations", "consultation_diagnoses", "conversations", "messages", "vital_signs", "lab_results", "clinical_events", "study_orders", "system_settings", "clinical_tasks", "prescriptions", "appointments", "clinical_documents", "population", "reports", "institutional_settings", "clinical_codes", "clinical_scales", "scale_results", "clinical_notes", "quality_checks", "medication_reconciliation", "follow_ups", "patient_summary", "audit_events", "backups", "permissions"])
        for group in groups:
            self.assertTrue(group["label"])
            for permission in group["permissions"]:
                self.assertTrue(permission["access"])
                self.assertTrue(permission["label"])


class ResourcesOpenApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.openapi = client.get("/api/openapi.json").json()

    def test_endpoints_present(self) -> None:
        paths = self.openapi["paths"]
        self.assertIn("/api/v1/resources", paths)
        self.assertIn("/api/v1/resources/{resource_name}", paths)

    def test_capability_schemas_and_enums_present(self) -> None:
        schemas = self.openapi["components"]["schemas"]
        for name in (
            "ResourceCapability",
            "ResourceListCapability",
            "ResourceFieldCapability",
            "ResourceActionCapability",
            "ResourceFormCapability",
            "ResourceFormFieldCapability",
            "ItemReference",
            "ResourceDetailCapability",
            "ActionRequestSpec",
            "ActionConfirmation",
            "ActionSuccessBehavior",
            "ResourceRelationCapability",
            "RelationOptionsSource",
                        "OptionsSourceType",
            "FieldValueType",
            "WidgetType",
            "FilterOperator",
            "HttpMethod",
            "ActionScope",
            "ResourceView",
        ):
            self.assertIn(name, schemas)


class DoctorsCapabilityTest(unittest.TestCase):
    def test_doctor_resource_contract_is_renderable(self) -> None:
        with _As("doctors:read", "doctors:create", "doctors:update", "doctors:delete"):
            cap = client.get("/api/v1/resources/doctors").json()
        self.assertEqual(cap["name"], "doctors")
        self.assertEqual(cap["label"], "Médicos")
        self.assertEqual(cap["view"], "table")
        self.assertEqual(cap["detail"]["url_template"], "/api/v1/doctors/{id}")
        self.assertEqual(cap["item_reference"]["field"], "id")

        labels = {f["name"]: f["label"] for f in cap["list"]["fields"]}
        self.assertEqual(labels["professional_license_number"], "Cédula")
        self.assertEqual(labels["status"], "Estado")

        # El filtro de status publica opciones en español desde el contrato.
        status_field = next(
            f for f in cap["list"]["filterable_fields"] if f["key"] == "status"
        )
        eq = next(o for o in status_field["operators"] if o["key"] == "eq")
        self.assertEqual(eq["widget"], "select")
        values = {o["value"] for o in (eq["options"] or [])}
        self.assertEqual(values, {"active", "inactive", "suspended"})

        self.assertEqual(cap["forms"]["create"]["method"], "POST")
        self.assertEqual(cap["forms"]["update"]["method"], "PATCH")
        action_names = {a["name"] for a in cap["actions"]}
        self.assertIn("delete", action_names)

    def test_doctor_form_select_publishes_enum_options(self) -> None:
        # B1: el campo de selección del formulario publica sus opciones {value,label}
        # con labels en español desde el mismo contrato (no sólo el filtro de lista).
        with _As("doctors:read", "doctors:create"):
            cap = client.get("/api/v1/resources/doctors").json()
        status_field = next(
            f for f in cap["forms"]["create"]["fields"] if f["name"] == "status"
        )
        self.assertEqual(status_field["widget"], "select")
        options = {o["value"]: o["label"] for o in status_field["options"]}
        self.assertEqual(options, {
            "active": "Activo",
            "inactive": "Inactivo",
            "suspended": "Suspendido",
        })
        # Un campo de texto libre no publica opciones (se omite por exclude_none).
        name_field = next(
            f for f in cap["forms"]["create"]["fields"] if f["name"] == "professional_name"
        )
        self.assertNotIn("options", name_field)

    def test_doctors_hidden_without_read_permission(self) -> None:
        with _As("patients:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertNotIn("doctors", names)

    def test_doctor_forms_gated_by_permission(self) -> None:
        with _As("doctors:read"):
            cap = client.get("/api/v1/resources/doctors").json()
        self.assertNotIn("forms", cap)
        self.assertEqual(cap["actions"], [])


class PatientsCapabilityTest(unittest.TestCase):
    def test_patient_resource_contract_is_renderable(self) -> None:
        with _As("patients:read", "patients:create", "patients:update", "patients:delete"):
            cap = client.get("/api/v1/resources/patients").json()
        self.assertEqual(cap["name"], "patients")
        self.assertEqual(cap["label"], "Pacientes")

        list_field_names = {f["name"] for f in cap["list"]["fields"]}
        self.assertIn("record_number", list_field_names)

        # record_number es de sólo lectura: nunca aparece en los formularios.
        create_fields = {f["name"] for f in cap["forms"]["create"]["fields"]}
        update_fields = {f["name"] for f in cap["forms"]["update"]["fields"]}
        self.assertNotIn("record_number", create_fields)
        self.assertNotIn("record_number", update_fields)

        action_names = {a["name"] for a in cap["actions"]}
        self.assertEqual(action_names, {"archive", "delete"})
        archive = next(a for a in cap["actions"] if a["name"] == "archive")
        self.assertEqual(archive["method"], "PATCH")
        self.assertEqual(archive["request"]["fixed_body"], {"status": "archived"})


class ClinicalSummaryCapabilityTest(unittest.TestCase):
    def test_patient_clinical_items_contract(self) -> None:
        with _As(
            "patient_clinical_items:read",
            "patient_clinical_items:create",
            "patient_clinical_items:update",
            "patient_clinical_items:delete",
        ):
            cap = client.get("/api/v1/resources/patient_clinical_items").json()
        self.assertEqual(cap["name"], "patient_clinical_items")
        self.assertEqual(cap["api_path"], "/api/v1/patient-clinical-items")
        filterable_keys = {f["key"] for f in cap["list"]["filterable_fields"]}
        self.assertLessEqual({"item_type", "severity", "status"}, filterable_keys)
        # Un solo recurso reutilizable; las opciones de tipo vienen del contrato.
        type_field = next(
            f for f in cap["list"]["filterable_fields"] if f["key"] == "item_type"
        )
        type_eq = next(o for o in type_field["operators"] if o["key"] == "eq")
        self.assertIn("allergy", {o["value"] for o in (type_eq["options"] or [])})
        self.assertEqual({a["name"] for a in cap["actions"]}, {"delete"})

    def test_vital_signs_contract_excludes_bmi_from_forms_and_columns(self) -> None:
        with _As("vital_signs:read", "vital_signs:create", "vital_signs:update"):
            cap = client.get("/api/v1/resources/vital_signs").json()
        self.assertEqual(cap["name"], "vital_signs")
        list_fields = {f["name"] for f in cap["list"]["fields"]}
        self.assertNotIn("bmi", list_fields)
        create_fields = {f["name"] for f in cap["forms"]["create"]["fields"]}
        self.assertNotIn("bmi", create_fields)
        self.assertIn("consultation_id", create_fields)

    def test_consultation_diagnoses_contract(self) -> None:
        with _As("consultation_diagnoses:read"):
            cap = client.get("/api/v1/resources/consultation_diagnoses").json()
        self.assertEqual(cap["name"], "consultation_diagnoses")
        kind_field = next(
            f for f in cap["list"]["filterable_fields"] if f["key"] == "diagnosis_kind"
        )
        kind_eq = next(o for o in kind_field["operators"] if o["key"] == "eq")
        self.assertEqual(kind_eq["widget"], "select")
        # Sin permisos de escritura: ni forms ni acciones.
        self.assertNotIn("forms", cap)
        self.assertEqual(cap["actions"], [])

    def test_clinical_resources_hidden_without_read_permission(self) -> None:
        with _As("users:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        for name in ("patient_clinical_items", "vital_signs", "consultation_diagnoses"):
            self.assertNotIn(name, names)


class MedicalHistoryAndConsultationsCapabilityTest(unittest.TestCase):
    _GOVERNED = (
        "status",
        "created_by",
        "updated_by",
        "deleted_at",
        "deleted_by",
        "finalized_at",
        "finalized_by_doctor_id",
        "reviewed_at",
        "reviewed_by_doctor_id",
        "version_number",
    )

    def test_both_resources_visible_with_read(self) -> None:
        with _As("medical_history_versions:read", "consultations:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertIn("medical_history_versions", names)
        self.assertIn("consultations", names)

    def test_forms_only_with_write_permissions(self) -> None:
        with _As("consultations:read"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertNotIn("forms", cap)
        with _As("consultations:read", "consultations:create", "consultations:update"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertEqual(cap["forms"]["create"]["method"], "POST")
        self.assertEqual(cap["forms"]["create"]["url_template"], "/api/v1/consultations")
        self.assertEqual(cap["forms"]["update"]["method"], "PATCH")

    def test_finalize_only_with_finalize_permission(self) -> None:
        with _As("consultations:read", "consultations:delete"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertNotIn("finalize", [a["name"] for a in cap["actions"]])
        with _As("consultations:read", "consultations:finalize"):
            cap = client.get("/api/v1/resources/consultations").json()
        actions = {a["name"]: a for a in cap["actions"]}
        self.assertIn("finalize", actions)
        self.assertNotIn("delete", actions)
        finalize = actions["finalize"]
        self.assertEqual(finalize["method"], "POST")
        self.assertEqual(finalize["url_template"], "/api/v1/consultations/{id}/finalize")
        self.assertTrue(finalize["confirmation"]["required"])
        self.assertEqual(
            finalize["visible_when"]["all"][0],
            {"field": "status", "operator": "eq", "value": "draft"},
        )
        # finalize es POST sin parámetros: publica request.fixed_body == {} (cuerpo
        # vacío explícito para que el cliente envíe JSON válido) y nunca input_schema.
        self.assertEqual(finalize["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", finalize)

    def test_related_lists_follow_target_read_permission(self) -> None:
        # Consultas publica navegación a los registros de la MISMA consulta (signos
        # vitales y recetas), pero cada lista relacionada exige el permiso de LECTURA
        # del recurso DESTINO, no el del recurso dueño.
        with _As("consultations:read"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertEqual(cap.get("related_lists", []), [])

        with _As("consultations:read", "vital_signs:read"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertEqual(
            cap["related_lists"],
            [
                {
                    "resource": "vital_signs",
                    "label": "Signos vitales",
                    "parameter_name": "consultation_id",
                }
            ],
        )

        with _As("consultations:read", "vital_signs:read", "prescriptions:read"):
            cap = client.get("/api/v1/resources/consultations").json()
        self.assertEqual(
            [(r["resource"], r["parameter_name"]) for r in cap["related_lists"]],
            [("vital_signs", "consultation_id"), ("prescriptions", "consultation_id")],
        )

    def test_medical_history_finalize_publishes_empty_body(self) -> None:
        with _As("medical_history_versions:read", "medical_history_versions:finalize"):
            cap = client.get("/api/v1/resources/medical_history_versions").json()
        actions = {a["name"]: a for a in cap["actions"]}
        finalize = actions["finalize"]
        self.assertEqual(finalize["method"], "POST")
        self.assertEqual(
            finalize["url_template"], "/api/v1/medical-history-versions/{id}/finalize"
        )
        # POST sin parámetros: cuerpo vacío explícito ({}), nunca input_schema.
        self.assertEqual(finalize["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", finalize)

    def test_delete_only_with_delete_permission(self) -> None:
        with _As("medical_history_versions:read", "medical_history_versions:finalize"):
            cap = client.get("/api/v1/resources/medical_history_versions").json()
        self.assertNotIn("delete", [a["name"] for a in cap["actions"]])
        with _As("medical_history_versions:read", "medical_history_versions:delete"):
            cap = client.get("/api/v1/resources/medical_history_versions").json()
        actions = {a["name"]: a for a in cap["actions"]}
        self.assertEqual(set(actions), {"delete"})
        delete = actions["delete"]
        self.assertEqual(delete["method"], "DELETE")
        self.assertEqual(
            delete["url_template"], "/api/v1/medical-history-versions/{id}"
        )
        self.assertTrue(delete["confirmation"]["destructive"])
        self.assertEqual(delete["visible_when"]["all"][0]["value"], "draft")

    def test_forms_hide_server_governed_fields(self) -> None:
        perms = [
            f"{resource}:{op}"
            for resource in ("medical_history_versions", "consultations")
            for op in ("read", "create", "update")
        ]
        with _As(*perms):
            for name in ("medical_history_versions", "consultations"):
                cap = client.get(f"/api/v1/resources/{name}").json()
                fields: set[str] = set()
                for form in ("create", "update"):
                    fields |= {f["name"] for f in cap["forms"][form]["fields"]}
                for governed in self._GOVERNED:
                    self.assertNotIn(governed, fields, f"{name}.{governed}")

    def test_resource_catalog_clinical_order(self) -> None:
        with _As(*declared_permissions()):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        # Orden clínico coherente: paciente -> historia -> consulta -> datos de consulta.
        self.assertLess(
            names.index("patient_clinical_items"), names.index("medical_history_versions")
        )
        self.assertLess(
            names.index("medical_history_versions"), names.index("consultations")
        )
        self.assertLess(names.index("consultations"), names.index("vital_signs"))


class PrescriptionsAndAppointmentsCapabilityTest(unittest.TestCase):
    _GOVERNED = (
        "status",
        "internal_folio",
        "created_by",
        "updated_by",
        "deleted_at",
        "deleted_by",
        "approved_at",
        "approved_by",
        "voided_at",
        "voided_by",
        "position",
        "rescheduled_from_id",
        "doctor_snapshot",
        "patient_snapshot",
    )

    def _cap(self, name: str, *permissions: str) -> dict:
        with _As(*permissions):
            return client.get(f"/api/v1/resources/{name}").json()

    def test_resources_visible_only_with_read(self) -> None:
        with _As("users:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        for name in ("prescriptions", "prescription_items", "appointments"):
            self.assertNotIn(name, names)
        with _As(
            "prescriptions:read", "appointments:read"
        ):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        # prescription_items reutiliza el permiso de lectura de recetas.
        for name in ("prescriptions", "prescription_items", "appointments"):
            self.assertIn(name, names)

    def test_forms_gated_by_write_permissions(self) -> None:
        self.assertNotIn("forms", self._cap("prescriptions", "prescriptions:read"))
        cap = self._cap(
            "prescriptions", "prescriptions:read", "prescriptions:create", "prescriptions:update"
        )
        self.assertEqual(cap["forms"]["create"]["url_template"], "/api/v1/prescriptions")
        self.assertEqual(cap["forms"]["update"]["method"], "PATCH")

    def test_prescription_actions_gated_by_specific_permissions(self) -> None:
        cap = self._cap("prescriptions", "prescriptions:read", "prescriptions:approve")
        self.assertEqual([a["name"] for a in cap["actions"]], ["approve"])
        approve = cap["actions"][0]
        self.assertEqual(approve["method"], "POST")
        self.assertEqual(approve["url_template"], "/api/v1/prescriptions/{id}/approve")
        self.assertEqual(approve["visible_when"]["all"][0]["value"], "draft")
        self.assertTrue(approve["confirmation"])
        # POST sin parámetros: cuerpo vacío explícito ({}), nunca input_schema.
        self.assertEqual(approve["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", approve)

        cap = self._cap("prescriptions", "prescriptions:read", "prescriptions:void")
        void = next(a for a in cap["actions"] if a["name"] == "void")
        self.assertEqual(void["url_template"], "/api/v1/prescriptions/{id}/void")
        self.assertEqual(void["visible_when"]["all"][0]["value"], "approved")
        self.assertEqual(
            [f["name"] for f in void["input_schema"]["fields"]], ["void_reason"]
        )

    def test_appointment_actions_and_input_schemas(self) -> None:
        cap = self._cap("appointments", "appointments:read", "appointments:update")
        actions = {a["name"]: a for a in cap["actions"]}
        # confirm/cancel/no_show/reschedule se habilitan con update (guard real).
        self.assertEqual(
            set(actions), {"confirm", "cancel", "no_show", "reschedule"}
        )
        self.assertEqual(
            actions["confirm"]["url_template"], "/api/v1/appointments/{id}/confirm"
        )
        self.assertEqual(actions["confirm"]["enabled_when"]["all"][0]["value"], "pending")
        # confirm/no_show son POST sin parámetros: cuerpo vacío explícito ({}).
        self.assertEqual(actions["confirm"]["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", actions["confirm"])
        self.assertEqual(actions["no_show"]["request"]["fixed_body"], {})
        self.assertNotIn("input_schema", actions["no_show"])
        self.assertEqual(
            actions["cancel"]["enabled_when"]["all"][0]["operator"], "in"
        )
        self.assertEqual(
            [f["name"] for f in actions["cancel"]["input_schema"]["fields"]], ["reason"]
        )
        reschedule_fields = {
            f["name"] for f in actions["reschedule"]["input_schema"]["fields"]
        }
        self.assertEqual(
            reschedule_fields,
            {"doctor_id", "scheduled_date", "scheduled_time", "duration_minutes", "reason", "internal_notes"},
        )
        self.assertEqual(
            actions["no_show"]["url_template"], "/api/v1/appointments/{id}/no-show"
        )

    def test_appointment_delete_gated_by_delete_permission(self) -> None:
        cap = self._cap("appointments", "appointments:read", "appointments:delete")
        self.assertEqual([a["name"] for a in cap["actions"]], ["delete"])
        delete = cap["actions"][0]
        self.assertEqual(delete["method"], "DELETE")
        self.assertEqual(delete["visible_when"]["all"][0]["value"], "pending")

    def test_prescription_item_delete_has_no_state_condition(self) -> None:
        cap = self._cap("prescription_items", "prescriptions:read", "prescriptions:update")
        actions = {a["name"]: a for a in cap["actions"]}
        self.assertIn("delete", actions)
        # El renglón no tiene estado propio: no se inventa visible_when.
        self.assertNotIn("visible_when", actions["delete"])
        self.assertEqual(
            actions["delete"]["url_template"], "/api/v1/prescription-items/{id}"
        )

    def test_forms_hide_server_governed_fields(self) -> None:
        cases = {
            "prescriptions": ("prescriptions:read", "prescriptions:create", "prescriptions:update"),
            "prescription_items": ("prescriptions:read", "prescriptions:update"),
            "appointments": ("appointments:read", "appointments:create", "appointments:update"),
        }
        for name, perms in cases.items():
            cap = self._cap(name, *perms)
            fields: set[str] = set()
            for form in ("create", "update"):
                if form in cap.get("forms", {}):
                    fields |= {f["name"] for f in cap["forms"][form]["fields"]}
            for governed in self._GOVERNED:
                self.assertNotIn(governed, fields, f"{name}.{governed}")

    def test_no_binary_or_secret_leaks_in_payload(self) -> None:
        with _As(*declared_permissions()):
            blob = json.dumps(client.get("/api/v1/resources").json())
        # No se filtran datos binarios ni columnas secretas. (``password`` sí es un campo
        # legítimo del formulario de alta de usuarios; lo que nunca debe aparecer es el
        # contenido binario ni el hash almacenado.)
        for needle in ("file_content", "hashed_password"):
            self.assertNotIn(needle, blob)


class MedicationTemplatesCapabilityTest(unittest.TestCase):
    _GOVERNED = (
        "id",
        "use_count",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "deleted_at",
        "deleted_by",
    )

    def _cap(self, *permissions: str) -> dict:
        with _As(*permissions):
            return client.get("/api/v1/resources/medication_templates").json()

    def test_visible_only_with_read(self) -> None:
        with _As("users:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertNotIn("medication_templates", names)
        with _As("medication_templates:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertIn("medication_templates", names)

    def test_resource_contract_is_renderable(self) -> None:
        cap = self._cap(
            "medication_templates:read",
            "medication_templates:create",
            "medication_templates:update",
            "medication_templates:delete",
        )
        self.assertEqual(cap["name"], "medication_templates")
        self.assertEqual(cap["label"], "Plantillas de medicamentos")
        self.assertEqual(cap["view"], "table")
        self.assertEqual(cap["api_path"], "/api/v1/medication-templates")
        self.assertEqual(
            cap["detail"]["url_template"], "/api/v1/medication-templates/{id}"
        )

        list_fields = {f["name"] for f in cap["list"]["fields"]}
        for expected in ("doctor_id", "medication_name", "use_count", "status"):
            self.assertIn(expected, list_fields)

        # El filtro de status publica opciones en español con operador eq.
        status_field = next(
            f for f in cap["list"]["filterable_fields"] if f["key"] == "status"
        )
        status_eq = next(o for o in status_field["operators"] if o["key"] == "eq")
        self.assertEqual(status_eq["widget"], "select")
        self.assertEqual(
            {o["value"] for o in (status_eq["options"] or [])}, {"active", "inactive"}
        )

        self.assertEqual(cap["forms"]["create"]["method"], "POST")
        self.assertEqual(
            cap["forms"]["create"]["url_template"], "/api/v1/medication-templates"
        )
        self.assertEqual(cap["forms"]["update"]["method"], "PATCH")
        self.assertEqual([a["name"] for a in cap["actions"]], ["delete"])
        delete = cap["actions"][0]
        self.assertEqual(delete["method"], "DELETE")
        self.assertTrue(delete["confirmation"]["destructive"])

    def test_form_select_publishes_status_options(self) -> None:
        cap = self._cap("medication_templates:read", "medication_templates:create")
        status_field = next(
            f for f in cap["forms"]["create"]["fields"] if f["name"] == "status"
        )
        self.assertEqual(status_field["widget"], "select")
        self.assertEqual(
            {o["value"]: o["label"] for o in status_field["options"]},
            {"active": "Activa", "inactive": "Inactiva"},
        )

    def test_forms_gated_by_permission(self) -> None:
        cap = self._cap("medication_templates:read")
        self.assertNotIn("forms", cap)
        self.assertEqual(cap["actions"], [])

    def test_forms_hide_server_governed_fields(self) -> None:
        cap = self._cap(
            "medication_templates:read",
            "medication_templates:create",
            "medication_templates:update",
        )
        fields: set[str] = set()
        for form in ("create", "update"):
            fields |= {f["name"] for f in cap["forms"][form]["fields"]}
        for governed in self._GOVERNED:
            self.assertNotIn(governed, fields)
        # doctor_id se declara sólo en el alta (inmutable): presente en create, no en update.
        create_fields = {f["name"] for f in cap["forms"]["create"]["fields"]}
        update_fields = {f["name"] for f in cap["forms"]["update"]["fields"]}
        self.assertIn("doctor_id", create_fields)
        self.assertNotIn("doctor_id", update_fields)


class RevokeSessionsRouteTest(unittest.TestCase):
    """La acción POST sin parámetros revoke_sessions acepta un cuerpo vacío {}."""

    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: session_user(
            "users:revoke_sessions"
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    def test_revoke_accepts_empty_body(self) -> None:
        with Session(self.engine) as session:
            user = User(
                name="Target",
                last_name="User",
                email="target@example.com",
                is_active=True,
                hashed_password="hash",
                token="token-before",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            user_id = str(user.id)

        response = self.client.post(
            f"/api/v1/users/{user_id}/revoke-sessions", json={}
        )
        # El cuerpo vacío {} es válido: nunca 422; la revocación responde 200.
        self.assertNotEqual(response.status_code, 422, response.text)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], user_id)


class ClinicalDocumentsActionBodyTest(unittest.TestCase):
    def test_archive_and_restore_send_empty_body(self) -> None:
        # archive/restore son POST sin parámetros: publican request.fixed_body == {}
        # (cuerpo vacío explícito) y nunca input_schema.
        with _As(
            "clinical_documents:read",
            "clinical_documents:archive",
            "clinical_documents:restore",
        ):
            cap = client.get("/api/v1/resources/clinical_documents").json()
        actions = {a["name"]: a for a in cap["actions"]}
        for name in ("archive", "restore"):
            self.assertIn(name, actions)
            self.assertEqual(actions[name]["method"], "POST")
            self.assertEqual(actions[name]["request"]["fixed_body"], {})
            self.assertNotIn("input_schema", actions[name])


if __name__ == "__main__":
    unittest.main()
