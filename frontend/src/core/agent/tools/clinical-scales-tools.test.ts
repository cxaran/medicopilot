import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// EPIC ESCALAS fase 1: escalas clínicas validadas. Lectura (no gateada en cliente; FastAPI
// exige clinical_scales:read): list_scales hace GET y compute_scale hace POST {inputs}. El
// puntaje es apoyo a la decisión que el médico confirma; si faltan insumos el servidor
// responde 422 y el agente debe preguntar el dato, nunca asumirlo.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("list_scales: hace GET al catálogo de escalas", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, []);
  });
  const resolved = resolveToolCall("clinical.list_scales", {});
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, "/api/v1/clinical-scales");
});

test("list_scales: devuelve las escalas con insumos y fuente al modelo", async (t) => {
  const body = [
    {
      id: "cha2ds2_vasc",
      name: "CHA₂DS₂-VASc",
      source: "Hindricks G, et al. 2020 ESC Guidelines... Eur Heart J. 2021.",
      inputs: [{ key: "sex", label: "Sexo", type: "enum", allowed_values: ["female", "male"] }],
    },
  ];
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.list_scales", {});
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("compute_scale: hace POST {inputs} con content-type JSON", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  let capturedMethod = "";
  let capturedContentType: string | null = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedMethod = String(init.method);
    capturedBody = JSON.parse(String(init.body));
    capturedContentType = new Headers(init.headers).get("content-type");
    return jsonResponse(200, {
      scale_id: "wells_dvt",
      score: 3,
      interpretation_label: "Probabilidad alta",
      interpretation_detail: "Puntaje ≥3.",
      sources: ["Wells PS, et al. Lancet. 1997."],
    });
  });
  const inputs = { active_cancer: true, localized_tenderness: true, entire_leg_swollen: true };
  const resolved = resolveToolCall("clinical.compute_scale", { scale_id: "wells_dvt", inputs });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-scales/wells_dvt/compute");
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedContentType, "application/json");
  assert.deepEqual(capturedBody, { inputs });
  assert.equal(result.status, "success");
});

test("compute_scale: requiere scale_id e inputs", () => {
  assert.equal(resolveToolCall("clinical.compute_scale", { inputs: {} }).outcome, "invalid_args");
  assert.equal(
    resolveToolCall("clinical.compute_scale", { scale_id: "cha2ds2_vasc" }).outcome,
    "invalid_args",
  );
});

test("compute_scale: propaga el 422 del servidor (no fabrica puntaje)", async (t) => {
  const errorBody = {
    code: "scale_inputs_invalid",
    message: "Insumos de la escala faltantes o inválidos.",
    errors: [{ field: "age", message: "Falta el insumo requerido: Edad (años)." }],
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(422, errorBody));
  const resolved = resolveToolCall("clinical.compute_scale", {
    scale_id: "cha2ds2_vasc",
    inputs: { chf: true },
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.code, "scale_inputs_invalid");
});

test("scales: son lecturas, no se gatean por rol en cliente", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  for (const name of ["clinical.list_scales", "clinical.compute_scale"]) {
    assert.notEqual(catalog.find((entry) => entry.name === name)?.status, "gated_out");
  }
});

test("scales: descubribles vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools("escala clínica CHA2DS2-VASc Wells riesgo puntaje", tools, 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.list_scales"));
  assert.ok(hits.some((hit) => hit.name === "clinical.compute_scale"));
});
