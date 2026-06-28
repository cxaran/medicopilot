import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// G5 fase 3: configuración institucional. Lectura (no gateada en cliente) que hace GET al
// CRUD de configuración, filtrando por categoría o búsqueda por clave/descripción.

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
  const resolved = resolveToolCall("clinical.get_institutional_config", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("get_institutional_config: filtra por categoría", async (t) => {
  const url = await captureUrl(t, { category: "vital_threshold" });
  assert.equal(url, "/api/v1/institutional-settings?category=vital_threshold");
});

test("get_institutional_config: busca por clave (search -> q)", async (t) => {
  const url = await captureUrl(t, { search: "vital_redflag.systolic_bp" });
  assert.equal(url, "/api/v1/institutional-settings?q=vital_redflag.systolic_bp");
});

test("get_institutional_config: sin parámetros -> lista completa", async (t) => {
  const url = await captureUrl(t, {});
  assert.equal(url, "/api/v1/institutional-settings");
});

test("get_institutional_config: categoría fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.get_institutional_config", { category: "otro" }).outcome,
    "invalid_args",
  );
});

test("get_institutional_config: devuelve la configuración al modelo", async (t) => {
  const body = { items: [{ key: "lab_target.hba1c", value: { target_max: 7.0 } }], pagination: {} };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.get_institutional_config", { category: "lab_target" });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("get_institutional_config: es una lectura, no se gatea por rol", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((entry) => entry.name === "clinical.get_institutional_config")?.status,
    "gated_out",
  );
});

test("get_institutional_config: descubrible vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools("configuración institucional umbral meta", tools, 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.get_institutional_config"));
});
