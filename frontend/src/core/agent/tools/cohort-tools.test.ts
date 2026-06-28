import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// G5 fase 1: consulta de cohorte poblacional. Es una lectura (no gateada en cliente) que hace
// POST con criterios anidados y devuelve { count, sample }.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

async function captureRequest(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
  responseBody: unknown = { count: 0, sample: [] },
): Promise<{ url: string; init: RequestInit }> {
  let captured: { url: string; init: RequestInit } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = { url: String(url), init };
    assert.equal(init.credentials, "include");
    return jsonResponse(200, responseBody);
  });
  const resolved = resolveToolCall("clinical.query_cohort", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (!captured) throw new Error("fetch no fue invocado");
  return captured;
}

test("query_cohort: POST a /population/cohort con el body de criterios", async (t) => {
  const captured = await captureRequest(t, {
    pregnancy_status: "pregnant",
    age_range: { min_age: 30, max_age: 40 },
    lab_abnormal: { analyte: "HbA1c", date_from: "2026-01-01", date_to: "2026-06-30" },
    limit: 10,
    offset: 0,
  });
  assert.equal(captured.url, "/api/v1/population/cohort");
  assert.equal(captured.init.method, "POST");
  const body = JSON.parse(String(captured.init.body)) as Record<string, unknown>;
  assert.deepEqual(body, {
    pregnancy_status: "pregnant",
    age_range: { min_age: 30, max_age: 40 },
    lab_abnormal: { analyte: "HbA1c", date_from: "2026-01-01", date_to: "2026-06-30" },
    limit: 10,
    offset: 0,
  });
});

test("query_cohort: devuelve { count, sample } al modelo", async (t) => {
  const captured = await captureRequest(
    t,
    { pregnancy_status: "pregnant" },
    { count: 2, sample: [{ patient_id: PATIENT_ID, full_name: "Ana" }] },
  );
  // El cuerpo solo lleva el criterio enviado.
  assert.deepEqual(JSON.parse(String(captured.init.body)), { pregnancy_status: "pregnant" });

  const resolved = resolveToolCall("clinical.query_cohort", { pregnancy_status: "pregnant" });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
});

test("query_cohort: ignora claves no reconocidas en el body", async (t) => {
  const captured = await captureRequest(t, {
    pregnancy_status: "pregnant",
    inventado: "x",
    has_diagnosis: "no-es-objeto",
  });
  const body = JSON.parse(String(captured.init.body)) as Record<string, unknown>;
  assert.deepEqual(body, { pregnancy_status: "pregnant" });
});

test("query_cohort: criterio de umbral de signo vital se reenvía anidado", async (t) => {
  const captured = await captureRequest(t, {
    vital_threshold: { vital: "heart_rate_bpm", comparator: "gte", value: 140 },
  });
  const body = JSON.parse(String(captured.init.body)) as Record<string, unknown>;
  assert.deepEqual(body, {
    vital_threshold: { vital: "heart_rate_bpm", comparator: "gte", value: 140 },
  });
});

test("query_cohort: es una lectura, no se gatea por rol", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((entry) => entry.name === "clinical.query_cohort")?.status,
    "gated_out",
  );
});

test("query_cohort: descubrible vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools("cuántos pacientes cohorte población", tools, 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.query_cohort"));
});
