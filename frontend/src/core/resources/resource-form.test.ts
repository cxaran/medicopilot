import test from "node:test";
import assert from "node:assert/strict";

import type {
  ResourceFormCapability,
  ResourceFormFieldCapability,
} from "@/core/api/contracts";

import {
  FormContractError,
  assertSupportedCreateForm,
  assertSupportedUpdateForm,
  buildCreatePayload,
  buildUpdatePayload,
} from "./resource-form.ts";

function field(
  name: string,
  widget: ResourceFormFieldCapability["widget"],
  overrides: Partial<ResourceFormFieldCapability> = {},
): ResourceFormFieldCapability {
  return {
    name,
    label: name || "campo",
    type: "string",
    required: false,
    editable: true,
    widget,
    ...overrides,
  };
}

function form(
  method: ResourceFormCapability["method"],
  fields: ResourceFormFieldCapability[],
): ResourceFormCapability {
  return {
    method,
    url_template: "/api/v1/things",
    fields,
    transport: "json",
  };
}

// --- assertSupportedCreateForm ---

test("assertSupportedCreateForm acepta POST con widgets soportados (incluye password, select y date)", () => {
  const f = form("POST", [
    field("name", "text"),
    field("email", "email"),
    field("password", "password"),
    field("bio", "textarea"),
    field("active", "switch"),
    field("sex", "select"),
    field("birth_date", "date"),
  ]);
  assert.doesNotThrow(() => assertSupportedCreateForm(f));
});

test("assertSupportedCreateForm rechaza método distinto de POST", () => {
  assert.throws(
    () => assertSupportedCreateForm(form("PATCH", [field("name", "text")])),
    FormContractError,
  );
});

test("assertSupportedCreateForm rechaza widget no soportado", () => {
  // datetime es un WidgetType válido pero no está permitido en formularios de creación.
  assert.throws(
    () => assertSupportedCreateForm(form("POST", [field("when", "datetime")])),
    FormContractError,
  );
});

test("assertSupportedCreateForm rechaza widget ausente (null)", () => {
  assert.throws(
    () => assertSupportedCreateForm(form("POST", [field("name", null)])),
    FormContractError,
  );
});

test("assertSupportedCreateForm rechaza nombre de campo vacío", () => {
  assert.throws(
    () => assertSupportedCreateForm(form("POST", [field("", "text")])),
    FormContractError,
  );
});

test("assertSupportedCreateForm rechaza nombres de campo duplicados", () => {
  assert.throws(
    () =>
      assertSupportedCreateForm(
        form("POST", [field("name", "text"), field("name", "email")]),
      ),
    FormContractError,
  );
});

// --- assertSupportedUpdateForm ---

test("assertSupportedUpdateForm acepta PATCH y PUT con widgets soportados (incluye select y date)", () => {
  const fields = [
    field("name", "text"),
    field("email", "email"),
    field("bio", "textarea"),
    field("active", "switch"),
    field("sex", "select"),
    field("birth_date", "date"),
  ];
  assert.doesNotThrow(() => assertSupportedUpdateForm(form("PATCH", fields)));
  assert.doesNotThrow(() => assertSupportedUpdateForm(form("PUT", fields)));
});

test("assertSupportedUpdateForm rechaza método que no sea PATCH/PUT", () => {
  assert.throws(
    () => assertSupportedUpdateForm(form("POST", [field("name", "text")])),
    FormContractError,
  );
});

test("assertSupportedUpdateForm rechaza widget password (soportado en create, no en update)", () => {
  // Diferencia clave entre create y update: el cambio de contraseña tiene su propio
  // contrato/flujo separado, por lo que 'password' no es válido en actualización.
  assert.doesNotThrow(() =>
    assertSupportedCreateForm(form("POST", [field("password", "password")])),
  );
  assert.throws(
    () => assertSupportedUpdateForm(form("PATCH", [field("password", "password")])),
    FormContractError,
  );
});

// --- buildUpdatePayload (allowlist por editable) ---

test("buildUpdatePayload excluye campos no editables (editable === false)", () => {
  const fd = new FormData();
  fd.set("name", "Nuevo");
  fd.set("record_number", "999");
  const payload = buildUpdatePayload(
    [field("name", "text"), field("record_number", "text", { editable: false })],
    fd,
  );
  assert.deepEqual(payload, { name: "Nuevo" });
  assert.equal("record_number" in payload, false);
});

test("buildUpdatePayload mapea switch->boolean, string->string y opcional vacío->null", () => {
  const fd = new FormData();
  fd.set("name", "Ana");
  fd.set("active", "on");
  // 'phone' está declarado y es editable pero ausente del FormData (opcional, vacío).
  const payload = buildUpdatePayload(
    [field("name", "text"), field("active", "switch"), field("phone", "text")],
    fd,
  );
  assert.deepEqual(payload, { name: "Ana", active: true, phone: null });
});

test("buildUpdatePayload conserva '' en un campo requerido vacío", () => {
  const fd = new FormData();
  // 'full_name' requerido pero vacío: se envía '' para que el backend lo valide (no null).
  const payload = buildUpdatePayload([field("full_name", "text", { required: true })], fd);
  assert.deepEqual(payload, { full_name: "" });
});

// --- buildCreatePayload ---

test("buildCreatePayload incluye select/date y convierte opcionales vacíos a null", () => {
  const fd = new FormData();
  fd.set("full_name", "Ana López");
  fd.set("sex", "female");
  fd.set("birth_date", "1990-05-20");
  // 'email' opcional y ausente -> null (evita 422 de EmailStr con cadena vacía).
  const payload = buildCreatePayload(
    [
      field("full_name", "text", { required: true }),
      field("sex", "select", { required: true }),
      field("birth_date", "date", { required: true }),
      field("email", "email"),
    ],
    fd,
  );
  assert.deepEqual(payload, {
    full_name: "Ana López",
    sex: "female",
    birth_date: "1990-05-20",
    email: null,
  });
});
