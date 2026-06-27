import test from "node:test";
import assert from "node:assert/strict";

import type {
  ResourceActionCapability,
  ResourceFormFieldCapability,
} from "@/core/api/contracts";

import {
  ActionContractError,
  ADMIN_COVERAGE_MESSAGE,
  actionBody,
  actionErrorMessage,
  actionHasInputSchema,
  actionInputFields,
  actionRequiresConfirmation,
  buildActionPayload,
  resolveActionUrl,
  shouldOpenDialog,
} from "./resource-action.ts";

function field(
  name: string,
  widget: ResourceFormFieldCapability["widget"],
  overrides: Partial<ResourceFormFieldCapability> = {},
): ResourceFormFieldCapability {
  return {
    name,
    label: name,
    type: "string",
    required: false,
    editable: true,
    widget,
    ...overrides,
  };
}

// Acción tipo appointments.reschedule: input_schema sin cuerpo fijo. Sólo confirmación
// no requerida para verificar que igual abre diálogo por tener input_schema.
function rescheduleAction(
  overrides: Partial<ResourceActionCapability> = {},
): ResourceActionCapability {
  return {
    name: "reschedule",
    label: "Reagendar",
    method: "POST" as const,
    url_template: "/api/v1/appointments/{id}/reschedule",
    scope: "item" as const,
    danger: false,
    input_schema: {
      fields: [
        field("doctor_id", "text"),
        field("scheduled_at", "datetime"),
        field("reason", "textarea"),
        field("notify", "switch", { type: "boolean" }),
      ],
    },
    confirmation: {
      required: false,
      title: "Reagendar cita",
      message: "Se creará la cita reprogramada con los datos indicados.",
      confirm_label: "Reagendar",
      destructive: false,
    },
    success_behavior: "refresh" as const,
    ...overrides,
  };
}

function deactivateAction() {
  return {
    name: "deactivate",
    label: "Desactivar",
    method: "PATCH" as const,
    url_template: "/api/v1/users/{id}",
    scope: "item" as const,
    danger: true,
    request: { content_type: "application/json", fixed_body: { is_active: false } },
    confirmation: {
      required: true,
      title: "Desactivar usuario",
      message: "El usuario perderá acceso inmediatamente.",
      confirm_label: "Desactivar",
      destructive: true,
    },
    success_behavior: "refresh" as const,
  };
}

function revokeAction() {
  return {
    name: "revoke_sessions",
    label: "Revocar sesiones",
    method: "POST" as const,
    url_template: "/api/v1/users/{id}/revoke-sessions",
    scope: "item" as const,
    danger: true,
    success_behavior: "refresh" as const,
  };
}

test("resolveActionUrl usa el placeholder declarado, no asume id", () => {
  const url = resolveActionUrl(deactivateAction(), "id", "abc-123");
  assert.equal(url, "/api/v1/users/abc-123");
});

test("actionBody envía exactamente fixed_body", () => {
  assert.deepEqual(actionBody(deactivateAction()), { is_active: false });
});

test("actionBody es una copia: no muta el contrato compartido", () => {
  const action = deactivateAction();
  const body = actionBody(action) as Record<string, unknown>;
  body.injected = true;
  assert.deepEqual(action.request.fixed_body, { is_active: false });
});

test("actionBody es undefined sin request", () => {
  assert.equal(actionBody(revokeAction()), undefined);
});

test("actionRequiresConfirmation refleja el contrato", () => {
  assert.equal(actionRequiresConfirmation(deactivateAction()), true);
  assert.equal(actionRequiresConfirmation(revokeAction()), false);
});

test("actionErrorMessage muestra mensaje seguro para admin_coverage_required", () => {
  assert.equal(actionErrorMessage(409, "admin_coverage_required"), ADMIN_COVERAGE_MESSAGE);
  assert.notEqual(actionErrorMessage(409, "resource_conflict"), ADMIN_COVERAGE_MESSAGE);
  assert.ok(actionErrorMessage(500, undefined).length > 0);
});

test("actionInputFields devuelve los campos declarados o lista vacía", () => {
  assert.equal(actionInputFields(deactivateAction()).length, 0);
  assert.equal(actionInputFields(revokeAction()).length, 0);
  assert.deepEqual(
    actionInputFields(rescheduleAction()).map((f) => f.name),
    ["doctor_id", "scheduled_at", "reason", "notify"],
  );
});

test("actionHasInputSchema distingue acciones con formulario de entrada", () => {
  assert.equal(actionHasInputSchema(rescheduleAction()), true);
  assert.equal(actionHasInputSchema(deactivateAction()), false);
  assert.equal(actionHasInputSchema(revokeAction()), false);
});

test("shouldOpenDialog: confirmación requerida abre diálogo", () => {
  assert.equal(shouldOpenDialog(deactivateAction()), true);
});

test("shouldOpenDialog: input_schema abre diálogo aunque confirmation.required sea false", () => {
  const action = rescheduleAction();
  // confirmation.required es false en esta acción; igual debe abrir por input_schema.
  assert.equal(actionRequiresConfirmation(action), false);
  assert.equal(shouldOpenDialog(action), true);
});

test("shouldOpenDialog: acción sin confirmación ni input_schema no abre diálogo", () => {
  assert.equal(shouldOpenDialog(revokeAction()), false);
});

test("buildActionPayload allowlista los campos declarados (string y switch)", () => {
  const formData = new FormData();
  formData.set("doctor_id", "doc-1");
  formData.set("scheduled_at", "2026-07-01T10:30");
  formData.set("reason", "Cambio de agenda");
  formData.set("notify", "on"); // switch marcado
  // Campo no declarado: debe ignorarse (allowlist).
  formData.set("status", "approved");

  const payload = buildActionPayload(rescheduleAction(), formData);
  assert.deepEqual(payload, {
    doctor_id: "doc-1",
    scheduled_at: "2026-07-01T10:30",
    reason: "Cambio de agenda",
    notify: true,
  });
  assert.equal("status" in payload, false);
});

test("buildActionPayload: switch ausente se envía como false", () => {
  const formData = new FormData();
  formData.set("doctor_id", "doc-1");
  const payload = buildActionPayload(rescheduleAction(), formData);
  assert.equal(payload.notify, false);
  // Campos string ausentes se envían como cadena vacía (misma semántica que create).
  assert.equal(payload.reason, "");
});

test("actionBody con input_schema toma sólo los campos declarados del payload", () => {
  const body = actionBody(rescheduleAction(), {
    doctor_id: "doc-1",
    reason: "x",
    notify: true,
    injected: "no-debe-ir", // clave no declarada
  });
  assert.deepEqual(body, { doctor_id: "doc-1", reason: "x", notify: true });
});

test("actionBody con input_schema sin payload devuelve cuerpo vacío", () => {
  assert.deepEqual(actionBody(rescheduleAction()), {});
});

test("actionBody rechaza un contrato con request e input_schema simultáneos", () => {
  const corrupt = rescheduleAction({
    request: { content_type: "application/json", fixed_body: { a: 1 } },
  });
  assert.throws(() => actionBody(corrupt), ActionContractError);
});
