import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// Conciliación de medicación (gap case 26). Lectura (no gateada en cliente; FastAPI exige
// medication_reconciliation:read): GET /patients/{id}/medication-reconciliation. Devuelve la
// lista consolidada + discrepancias que el médico REVISA; el agente no actúa sobre ellas.

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("reconcile_medications: es lectura, sin metadata de aprobación", () => {
  const tool = getTool("clinical.reconcile_medications");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);
});

test("reconcile_medications: GET al endpoint de conciliación por paciente", async (t) => {
  let captured = "";
  const body = {
    patient_id: PATIENT_ID,
    consolidated: [
      { key: "ibuprofeno", display_name: "Ibuprofeno", ingredient_or_class: "ibuprofeno",
        resolver_status: "resolved", prescribed_refs: ["prescription_item:a"], reported_refs: [] },
    ],
    flags: [
      { kind: "prescribed_not_reported", message: "Ibuprofeno está PRESCRITO pero…",
        source_refs: ["prescription_item:a"], ingredient_or_class: "ibuprofeno",
        resolver_status: "resolved" },
    ],
    flag_count: 1,
    resolver_available: true,
  };
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, body);
  });
  const resolved = resolveToolCall("clinical.reconcile_medications", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, `/api/v1/patients/${PATIENT_ID}/medication-reconciliation`);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("reconcile_medications: requiere patient_id (uuid)", () => {
  assert.equal(resolveToolCall("clinical.reconcile_medications", {}).outcome, "invalid_args");
  assert.equal(
    resolveToolCall("clinical.reconcile_medications", { patient_id: "no-uuid" }).outcome,
    "invalid_args",
  );
  // Campo desconocido -> rechazado.
  assert.equal(
    resolveToolCall("clinical.reconcile_medications", { patient_id: PATIENT_ID, fix: true }).outcome,
    "invalid_args",
  );
});

test("reconcile_medications: refleja el estado 'no_disponible' del resolutor", async (t) => {
  const body = {
    patient_id: PATIENT_ID,
    consolidated: [
      { key: "ibuprofeno", display_name: "Ibuprofeno", ingredient_or_class: null,
        resolver_status: "no_disponible", prescribed_refs: ["prescription_item:a"], reported_refs: [] },
    ],
    flags: [],
    flag_count: 0,
    resolver_available: false,
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.reconcile_medications", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    const parsed = result.content as typeof body;
    assert.equal(parsed.resolver_available, false);
    assert.equal(parsed.consolidated[0].resolver_status, "no_disponible");
  }
});

test("reconcile_medications: propaga 403 del servidor (RBAC)", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(403, { code: "forbidden", message: "No autorizado" }),
  );
  const resolved = resolveToolCall("clinical.reconcile_medications", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
});

test("reconcile_medications: es lectura, no se gatea por rol en cliente", () => {
  const catalog = buildToolCatalog(listTools(), new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.reconcile_medications")?.status,
    "gated_out",
  );
});

test("reconcile_medications: descubrible vía tool_search", () => {
  const hits = searchTools(
    "conciliar medicación lista consolidada discrepancias prescrito reportado",
    listTools(),
    10,
  );
  assert.ok(hits.some((hit) => hit.name === "clinical.reconcile_medications"));
});
