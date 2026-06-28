import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// G5 fase 4: codificación clínica. Lectura (no gateada en cliente; FastAPI exige
// clinical_codes:read) que hace GET al catálogo CIE-10/LOINC/ATC por sistema + término.
// Es una ayuda a la codificación que el médico confirma: un término desconocido devuelve
// vacío y el agente nunca debe inventar un código.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
  responseBody: unknown = { items: [], pagination: {} },
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, responseBody);
  });
  const resolved = resolveToolCall("clinical.search_codes", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("search_codes: construye system + q", async (t) => {
  const url = await captureUrl(t, { system: "cie10", query: "diabetes" });
  assert.equal(url, "/api/v1/clinical-codes?system=cie10&q=diabetes");
});

test("search_codes: busca un código LOINC por término del analito", async (t) => {
  const url = await captureUrl(t, { system: "loinc", query: "HbA1c" });
  assert.equal(url, "/api/v1/clinical-codes?system=loinc&q=HbA1c");
});

test("search_codes: incluye limit/offset cuando se indican", async (t) => {
  const url = await captureUrl(t, { system: "atc", query: "metformina", limit: 5, offset: 10 });
  assert.equal(url, "/api/v1/clinical-codes?system=atc&q=metformina&limit=5&offset=10");
});

test("search_codes: requiere system y query", () => {
  assert.equal(resolveToolCall("clinical.search_codes", { query: "x" }).outcome, "invalid_args");
  assert.equal(resolveToolCall("clinical.search_codes", { system: "cie10" }).outcome, "invalid_args");
});

test("search_codes: system fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.search_codes", { system: "snomed", query: "x" }).outcome,
    "invalid_args",
  );
});

test("search_codes: término desconocido -> resultado vacío (sin fabricar)", async (t) => {
  const body = { items: [], pagination: { total: 0 } };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.search_codes", {
    system: "cie10",
    query: "padecimiento-inexistente-999",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("search_codes: devuelve las coincidencias al modelo", async (t) => {
  const body = {
    items: [{ system: "cie10", code: "E11.9", display_term: "Diabetes mellitus tipo 2 sin complicaciones" }],
    pagination: { total: 1 },
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.search_codes", { system: "cie10", query: "diabetes" });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("search_codes: es una lectura, no se gatea por rol en cliente", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((entry) => entry.name === "clinical.search_codes")?.status,
    "gated_out",
  );
});

test("search_codes: descubrible vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools("código clínico CIE-10 LOINC diagnóstico codificación", tools, 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.search_codes"));
});
