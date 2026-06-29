"""Tests del catálogo de plantillas del agente (arquitectura de UI híbrida, MP-CTRL-0115).

Proyección READ-ONLY sobre el RESOURCE_REGISTRY + capabilities. Se verifica: lista las plantillas
registradas esperadas con id/modos/contrato-de-prellenado/acciones; el RBAC filtra las plantillas
que el usuario no puede usar (ausentes); y es de sólo lectura (no muta). No requiere base de datos:
el catálogo es una función pura sobre el registry y el usuario.
"""

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

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.agent_templates import (  # noqa: E402
    TemplateResolutionError,
    build_template_catalog,
    resolve_open_template,
)
from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.schemas.agent_template import OpenTemplateRequest  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


def session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


class AgentTemplatesCatalogTest(unittest.TestCase):
    def _by_id(self, templates):
        return {t.id: t for t in templates}

    def test_full_permission_lists_expected_templates(self) -> None:
        catalog = build_template_catalog(session_user(*declared_permissions()))
        ids = {t.id for t in catalog}
        # Mapean a los ids del registry (recursos con create/edit).
        for expected in ("patients", "consultations", "prescriptions", "vital_signs"):
            self.assertIn(expected, ids)
        # Recursos SÓLO lectura (sin create/edit) NO son plantillas prellenables.
        self.assertNotIn("audit_events", ids)
        self.assertNotIn("permissions", ids)

    def test_template_shape_modes_and_prefill_contract(self) -> None:
        catalog = build_template_catalog(session_user(*declared_permissions()))
        patients = self._by_id(catalog)["patients"]
        self.assertEqual(patients.resource, "patients")
        self.assertIn("create", patients.modes)
        self.assertIn("edit", patients.modes)
        self.assertIn("review", patients.modes)  # tiene detalle
        self.assertEqual(patients.create_path, "/api/v1/patients")
        # El contrato de prellenado refleja el esquema YA declarado de PatientCreate.
        self.assertIn("full_name", patients.prefill.prefillable_fields)
        self.assertIn("birth_date", patients.prefill.prefillable_fields)
        # full_name/birth_date/sex son obligatorios -> a confirmar.
        for required in ("full_name", "birth_date", "sex"):
            self.assertIn(required, patients.prefill.fields_requiring_confirmation)
        # Campos opcionales no son obligatorios.
        self.assertNotIn("phone", patients.prefill.fields_requiring_confirmation)

    def test_rbac_filters_out_templates_user_cannot_use(self) -> None:
        # Sólo lectura de pacientes: sin create/edit -> la plantilla NO aparece.
        read_only = build_template_catalog(session_user("patients:read"))
        self.assertNotIn("patients", {t.id for t in read_only})

        # Lectura + creación: aparece, en modo create (no edit, sin update).
        creator = build_template_catalog(session_user("patients:read", "patients:create"))
        patients = self._by_id(creator).get("patients")
        self.assertIsNotNone(patients)
        assert patients is not None
        self.assertIn("create", patients.modes)
        self.assertNotIn("edit", patients.modes)

        # Sin ningún permiso de pacientes: ni siquiera es visible.
        none = build_template_catalog(session_user("doctors:read"))
        self.assertNotIn("patients", {t.id for t in none})

    def test_actions_are_rbac_filtered(self) -> None:
        # Un creador de consultas sin permiso de finalizar no ve la acción 'finalize'.
        partial = build_template_catalog(
            session_user("consultations:read", "consultations:create")
        )
        consultations = self._by_id(partial).get("consultations")
        self.assertIsNotNone(consultations)
        assert consultations is not None
        self.assertNotIn("finalize", consultations.actions)


class OpenTemplateResolveTest(unittest.TestCase):
    def _full(self) -> SessionUser:
        return session_user(*declared_permissions())

    def test_known_template_prefill_validates_and_marks(self) -> None:
        req = OpenTemplateRequest(
            mode="create",
            prefilled={"full_name": "María López", "birth_date": "1990-01-01"},
            suggested={"sex": "female"},
            source_fragments={"full_name": "la paciente María López", "birth_date": "nació en 1990"},
        )
        resolved = resolve_open_template(self._full(), "patients", req)
        self.assertEqual(resolved.resource, "patients")
        self.assertEqual(resolved.method, "POST")
        self.assertEqual(resolved.url_template, "/api/v1/patients")
        self.assertEqual(resolved.values["full_name"], "María López")
        self.assertIn("full_name", resolved.prefilled_fields)
        self.assertIn("sex", resolved.suggested_fields)  # marcado como sugerencia
        # full_name/birth_date/sex obligatorios -> a confirmar.
        for req_field in ("full_name", "birth_date", "sex"):
            self.assertIn(req_field, resolved.fields_requiring_confirmation)
        # Fragmentos de origen sólo de campos aceptados.
        self.assertIn("full_name", resolved.source_fragments)

    def test_unknown_template_rejected_naming_it(self) -> None:
        with self.assertRaises(TemplateResolutionError) as ctx:
            resolve_open_template(
                self._full(), "no_existe", OpenTemplateRequest(mode="create")
            )
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("no_existe", ctx.exception.message)  # nombra la plantilla

    def test_field_not_in_schema_is_dropped_not_invented(self) -> None:
        req = OpenTemplateRequest(
            mode="create",
            prefilled={"full_name": "Ana", "campo_inventado": "x"},
        )
        resolved = resolve_open_template(self._full(), "patients", req)
        self.assertIn("campo_inventado", resolved.dropped_fields)  # descartado, no inventado
        self.assertNotIn("campo_inventado", resolved.values)
        self.assertIn("full_name", resolved.values)

    def test_rbac_forbids_template_user_cannot_use(self) -> None:
        # Sólo lectura de pacientes: no puede crear -> plantilla no disponible (403).
        with self.assertRaises(TemplateResolutionError) as ctx:
            resolve_open_template(
                session_user("patients:read"), "patients", OpenTemplateRequest(mode="create")
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_mode_not_allowed_rejected(self) -> None:
        # Creador (sin update): modo edit no permitido.
        with self.assertRaises(TemplateResolutionError) as ctx:
            resolve_open_template(
                session_user("patients:read", "patients:create"),
                "patients", OpenTemplateRequest(mode="edit"),
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_allowed_actions_filtered_by_rbac(self) -> None:
        # El agente sugiere 'delete' pero el creador no lo tiene -> se filtra.
        resolved = resolve_open_template(
            session_user("patients:read", "patients:create"),
            "patients",
            OpenTemplateRequest(mode="create", allowed_actions=["delete"]),
        )
        self.assertNotIn("delete", resolved.allowed_actions)


class AgentTemplatesEndpointTest(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: session_user(*permissions)

    def test_endpoint_returns_catalog_filtered_by_rbac(self) -> None:
        client = TestClient(app)
        self._as(*declared_permissions())
        full = client.get("/api/v1/agent/templates")
        self.assertEqual(full.status_code, 200)
        ids = {t["id"] for t in full.json()}
        self.assertIn("patients", ids)

        # Usuario limitado: sólo lectura de pacientes -> patients ausente.
        self._as("patients:read")
        limited = client.get("/api/v1/agent/templates")
        self.assertEqual(limited.status_code, 200)
        self.assertNotIn("patients", {t["id"] for t in limited.json()})

    def test_endpoint_is_read_only_get(self) -> None:
        client = TestClient(app)
        self._as(*declared_permissions())
        # El catálogo no expone métodos de escritura.
        self.assertEqual(client.post("/api/v1/agent/templates").status_code, 405)

    def test_prefill_endpoint_resolves_known_template(self) -> None:
        client = TestClient(app)
        self._as(*declared_permissions())
        resp = client.post(
            "/api/v1/agent/templates/patients/prefill",
            json={"mode": "create", "prefilled": {"full_name": "Ana Ruiz"}},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["resource"], "patients")
        self.assertEqual(body["values"]["full_name"], "Ana Ruiz")

    def test_prefill_endpoint_unknown_template_404(self) -> None:
        client = TestClient(app)
        self._as(*declared_permissions())
        resp = client.post(
            "/api/v1/agent/templates/no_existe/prefill", json={"mode": "create"}
        )
        self.assertEqual(resp.status_code, 404)
        self.assertIn("no_existe", resp.json()["message"])

    def test_prefill_endpoint_rbac_forbidden(self) -> None:
        client = TestClient(app)
        self._as("patients:read")  # sin create -> plantilla no disponible
        resp = client.post(
            "/api/v1/agent/templates/patients/prefill", json={"mode": "create"}
        )
        self.assertEqual(resp.status_code, 403)


if __name__ == "__main__":
    unittest.main()
