import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// G5 fase 2: reportes agregados. Lectura (no gateada en cliente) que hace GET al endpoint
// correcto según report_type y devuelve la serie/agregado.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const DOCTOR_ID = "22222222-2222-2222-2222-222222222222";

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
  responseBody: unknown = [],
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, responseBody);
  });
  const resolved = resolveToolCall("clinical.get_report", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("get_report activity: GET /reports/activity con rango y doctor", async (t) => {
  const url = await captureUrl(t, {
    report_type: "activity",
    date_from: "2026-01-01",
    date_to: "2026-03-31",
    doctor_id: DOCTOR_ID,
  });
  assert.equal(
    url,
    `/api/v1/reports/activity?date_from=2026-01-01&date_to=2026-03-31&doctor_id=${DOCTOR_ID}`,
  );
});

test("get_report top_diagnoses: GET /reports/top-diagnoses con limit", async (t) => {
  const url = await captureUrl(t, {
    report_type: "top_diagnoses",
    date_from: "2026-01-01",
    date_to: "2026-01-31",
    limit: 5,
  });
  assert.equal(url, "/api/v1/reports/top-diagnoses?date_from=2026-01-01&date_to=2026-01-31&limit=5");
});

test("get_report unsigned_notes: GET /reports/unsigned-notes sin params -> sin query", async (t) => {
  const url = await captureUrl(t, { report_type: "unsigned_notes" });
  assert.equal(url, "/api/v1/reports/unsigned-notes");
});

test("get_report unsigned_notes: filtra por doctor", async (t) => {
  const url = await captureUrl(t, { report_type: "unsigned_notes", doctor_id: DOCTOR_ID });
  assert.equal(url, `/api/v1/reports/unsigned-notes?doctor_id=${DOCTOR_ID}`);
});

test("get_report attendance: GET /reports/attendance con rango", async (t) => {
  const url = await captureUrl(t, {
    report_type: "attendance",
    date_from: "2026-01-01",
    date_to: "2026-01-31",
  });
  assert.equal(url, "/api/v1/reports/attendance?date_from=2026-01-01&date_to=2026-01-31");
});

test("get_report: report_type fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.get_report", { report_type: "revenue" }).outcome,
    "invalid_args",
  );
});

test("get_report: report_type es requerido", () => {
  assert.equal(resolveToolCall("clinical.get_report", {}).outcome, "invalid_args");
});

test("get_report: devuelve la serie agregada al modelo", async (t) => {
  const series = [{ period: "2026-01", consultations: 2, appointments: 1 }];
  let body: unknown;
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, series));
  const resolved = resolveToolCall("clinical.get_report", {
    report_type: "activity",
    date_from: "2026-01-01",
    date_to: "2026-01-31",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") body = result.content;
  assert.deepEqual(body, series);
});

test("get_report: es una lectura, no se gatea por rol", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((entry) => entry.name === "clinical.get_report")?.status,
    "gated_out",
  );
});

test("get_report: descubrible vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools("reporte agregado actividad diagnósticos asistencia", tools, 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.get_report"));
});
