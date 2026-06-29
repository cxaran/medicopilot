import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// CONVERSACIÓN→EXPEDIENTE (keystone): búsqueda/emparejamiento de pacientes. La tool de lectura
// arma el query string exacto que el backend honra (name/phone/curp/birth_date/email/limit). Es
// SOLO lectura; el gate real es patients:read en el backend. No hay escritura: nunca crea ni abre
// un expediente.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { count: 0, has_strong_match: false, candidates: [] });
  });
  const resolved = resolveToolCall("clinical.search_patients", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("search_patients: nombre + fecha + teléfono -> query exacto", async (t) => {
  const url = await captureUrl(t, {
    name: "Juan Perez",
    birth_date: "1980-05-10",
    phone: "5512345678",
    limit: 5,
  });
  assert.equal(
    url,
    "/api/v1/patients/search?name=Juan+Perez&phone=5512345678&birth_date=1980-05-10&limit=5",
  );
});

test("search_patients: por CURP", async (t) => {
  const url = await captureUrl(t, { curp: "PEGJ800510HDFRRN01" });
  assert.equal(url, "/api/v1/patients/search?curp=PEGJ800510HDFRRN01");
});

test("search_patients: sin criterios -> sin query string (el backend valida 422)", async (t) => {
  const url = await captureUrl(t, {});
  assert.equal(url, "/api/v1/patients/search");
});

test("search_patients: parámetro no soportado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.search_patients", { address: "x" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("search_patients: limit fuera de rango -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.search_patients", { name: "x", limit: 99 }).outcome,
    "invalid_args",
  );
});

test("search_patients: es lectura, descubrible y no se gatea en cliente", () => {
  const tools = listTools();
  const hits = searchTools(
    "buscar paciente coincidencias por nombre teléfono curp duplicado", tools, 10,
  );
  assert.ok(hits.some((h) => h.name === "clinical.search_patients"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.search_patients",
  );
  assert.notEqual(entry?.status, "gated_out");
});
