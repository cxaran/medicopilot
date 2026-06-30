import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// FOLLOW-UP & TASKS (gap 57-62). Lectura (no gateada en cliente; FastAPI exige follow_ups:read):
// list_follow_ups hace GET /follow-ups/summary y devuelve tres grupos (tareas pendientes/vencidas,
// citas no asistidas, labs anormales sin revisar) que el médico REVISA; el agente no actúa sobre
// ellos.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const SUMMARY = {
  generated_at: "2026-06-28T10:00:00",
  appointment_lookback_days: 30,
  pending_tasks_count: 1,
  pending_tasks: [
    { task_id: "11111111-1111-1111-1111-111111111111", title: "Revisar TSH",
      patient_id: "22222222-2222-2222-2222-222222222222", patient_label: "Juan Pérez",
      priority: "high", status: "open", due_at: "2026-06-20T10:00:00", overdue: true },
  ],
  missed_appointments_count: 1,
  missed_appointments: [
    { appointment_id: "33333333-3333-3333-3333-333333333333",
      patient_id: "22222222-2222-2222-2222-222222222222", patient_label: "Juan Pérez",
      doctor_id: "44444444-4444-4444-4444-444444444444", scheduled_date: "2026-06-25",
      scheduled_time: "09:00:00", status: "no_show", reason: "Control" },
  ],
  unreviewed_abnormal_labs_count: 1,
  unreviewed_abnormal_labs: [
    { lab_result_id: "55555555-5555-5555-5555-555555555555",
      patient_id: "22222222-2222-2222-2222-222222222222", patient_label: "Juan Pérez",
      analyte_name: "Potasio", abnormal_flag: "critical", value_numeric: 6.5, value_text: null,
      unit: "mmol/L", measured_at: "2026-06-27T08:00:00" },
  ],
};

test("list_follow_ups: es lectura, sin metadata de aprobación", () => {
  const tool = getTool("clinical.list_follow_ups");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);
});

test("list_follow_ups: GET a /follow-ups/summary sin parámetros", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, SUMMARY);
  });
  const resolved = resolveToolCall("clinical.list_follow_ups", {});
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, "/api/v1/follow-ups/summary");
  assert.equal(result.status, "success");
  if (result.status === "success") {
    const body = result.content as typeof SUMMARY;
    assert.equal(body.pending_tasks_count, 1);
    assert.equal(body.missed_appointments[0].status, "no_show");
    assert.equal(body.unreviewed_abnormal_labs[0].abnormal_flag, "critical");
  }
});

test("list_follow_ups: pasa appointment_lookback_days como query", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    captured = String(url);
    return jsonResponse(200, SUMMARY);
  });
  const resolved = resolveToolCall("clinical.list_follow_ups", { appointment_lookback_days: 7 });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, "/api/v1/follow-ups/summary?appointment_lookback_days=7");
});

test("list_follow_ups: rechaza ventana fuera de rango o campo desconocido", () => {
  assert.equal(
    resolveToolCall("clinical.list_follow_ups", { appointment_lookback_days: 0 }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.list_follow_ups", { appointment_lookback_days: 999 }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.list_follow_ups", { foo: true }).outcome,
    "invalid_args",
  );
});

test("list_follow_ups: propaga el 403 del servidor (RBAC follow_ups:read)", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(403, { code: "forbidden", message: "No autorizado" }),
  );
  const resolved = resolveToolCall("clinical.list_follow_ups", {});
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
});

test("list_follow_ups: es lectura, no se gatea por rol en cliente", () => {
  const catalog = buildToolCatalog(listTools(), new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.list_follow_ups")?.status,
    "gated_out",
  );
});

test("list_follow_ups: descubrible vía tool_search", () => {
  const hits = searchTools(
    "pendientes seguimiento tareas vencidas citas no asistidas laboratorios sin revisar",
    listTools(),
    10,
  );
  assert.ok(hits.some((hit) => hit.name === "clinical.list_follow_ups"));
});
