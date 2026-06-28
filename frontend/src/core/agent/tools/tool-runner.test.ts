import test from "node:test";
import assert from "node:assert/strict";

import {
  executeTool,
  rejectedByUserResult,
  resolveToolCall,
} from "./tool-runner.ts";
import { getTool } from "./registry.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("resolveToolCall: tool 'read' válida queda lista para ejecutar", () => {
  const resolved = resolveToolCall("clinical.list_patients", { limit: 5 });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  assert.equal(resolved.tool.kind, "read");
});

test("resolveToolCall: tool desconocida -> tool_result de error", () => {
  const resolved = resolveToolCall("clinical.nope", {});
  assert.equal(resolved.outcome, "unknown_tool");
  assert.equal(resolved.result.status, "error");
  if (resolved.result.status === "error") {
    assert.equal(resolved.result.code, "unknown_tool");
  }
});

test("resolveToolCall: args inválidos (uuid requerido faltante) -> error", () => {
  const resolved = resolveToolCall("clinical.get_patient", {});
  assert.equal(resolved.outcome, "invalid_args");
  assert.equal(resolved.result.status, "error");
  if (resolved.result.status === "error") {
    assert.equal(resolved.result.code, "invalid_arguments");
  }
});

test("resolveToolCall: uuid mal formado -> error de validación", () => {
  const resolved = resolveToolCall("clinical.get_patient", { patient_id: "no-es-uuid" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("executeTool: list_patients hace GET al endpoint correcto con paginación", async (t) => {
  let captured: { url: unknown; init: RequestInit } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = { url, init };
    return jsonResponse(200, { items: [], pagination: { limit: 5, offset: 0, total: 0, has_next: false } });
  });

  const resolved = resolveToolCall("clinical.list_patients", { limit: 5 });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;

  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  assert.ok(captured);
  assert.equal(captured.url, "/api/v1/patients?limit=5");
  assert.equal((captured.init.method ?? "GET").toUpperCase(), "GET");
  assert.equal(captured.init.credentials, "include");
});

test("executeTool: get_patient hace GET al detalle por id", async (t) => {
  let captured: { url: unknown } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    captured = { url };
    return jsonResponse(200, { id: "11111111-1111-1111-1111-111111111111" });
  });

  const resolved = resolveToolCall("clinical.get_patient", {
    patient_id: "11111111-1111-1111-1111-111111111111",
  });
  if (resolved.outcome !== "ready") throw new Error("esperado ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  assert.equal(captured?.url, "/api/v1/patients/11111111-1111-1111-1111-111111111111");
});

test("executeTool: 403 -> error estructurado 'forbidden'", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(403, { code: "forbidden", message: "no" }),
  );
  const resolved = resolveToolCall("clinical.list_prescriptions", {});
  if (resolved.outcome !== "ready") throw new Error("esperado ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "forbidden");
});

test("executeTool: 404 -> error estructurado 'not_found'", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(404, { code: "resource_not_found", message: "no existe" }),
  );
  const resolved = resolveToolCall("clinical.get_patient", {
    patient_id: "11111111-1111-1111-1111-111111111111",
  });
  if (resolved.outcome !== "ready") throw new Error("esperado ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "not_found");
});

test("tool 'write': es de kind write y NO se ejecuta solo al resolver (gating)", async (t) => {
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    return jsonResponse(201, { id: "c1" });
  });

  const resolved = resolveToolCall("clinical.create_consultation_draft", {
    patient_id: "11111111-1111-1111-1111-111111111111",
    attending_doctor_id: "22222222-2222-2222-2222-222222222222",
    reason_for_visit: "Control",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  assert.equal(resolved.tool.kind, "write");
  // resolver NO ejecuta: el fetch no se llamó (la confirmación del médico es aparte).
  assert.equal(called, false);

  // Al aprobar (ejecutar explícitamente) hace el POST con el body.
  let captured: { url: unknown; init: RequestInit } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = { url, init };
    return jsonResponse(201, { id: "c1", status: "draft" });
  });
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  assert.equal(captured?.url, "/api/v1/consultations");
  assert.equal(captured?.init.method, "POST");
  const body = JSON.parse(String(captured?.init.body)) as Record<string, unknown>;
  assert.equal(body.reason_for_visit, "Control");
});

test("rejectedByUserResult: error 'rejected_by_user' para devolver al modelo", () => {
  const result = rejectedByUserResult();
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "rejected_by_user");
});

test("getTool: expone las tools del registry por nombre", () => {
  assert.ok(getTool("clinical.list_patients"));
  assert.ok(getTool("clinical.create_consultation_draft"));
  assert.equal(getTool("inexistente"), undefined);
});
