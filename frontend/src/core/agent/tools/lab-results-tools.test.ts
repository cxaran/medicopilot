import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// G2: resultados de laboratorio estructurados. Verifica que las tools de lectura arman el
// query string EXACTO que el backend honra (patient_id, analyte->analyte_name_contains,
// rango->measured_at_from/_to, abnormal_only->abnormal_flag_in repetido), que get_lab_result
// valida el uuid, y que create_lab_result_draft es una escritura que pasa por el protocolo de
// aprobación P1 (plan canónico inmutable + gating por permiso de creación).

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const LAB_RESULT_ID = "22222222-2222-2222-2222-222222222222";

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall(name, args);
  assert.equal(resolved.outcome, "ready", `esperado ready para ${name}`);
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("list_lab_results: patient_id + analyte (contains) + rango -> measured_at_from/to", async (t) => {
  const url = await captureUrl(t, "clinical.list_lab_results", {
    patient_id: PATIENT_ID,
    analyte: "HbA1c",
    date_from: "2026-01-01",
    date_to: "2026-06-30",
    limit: 50,
  });
  assert.equal(
    url,
    `/api/v1/lab-results?patient_id=${PATIENT_ID}&analyte_name_contains=HbA1c` +
      `&measured_at_from=2026-01-01&measured_at_to=2026-06-30&limit=50`,
  );
});

test("list_lab_results: abnormal_only=true -> abnormal_flag_in repetido (low,high,critical)", async (t) => {
  const url = await captureUrl(t, "clinical.list_lab_results", {
    patient_id: PATIENT_ID,
    abnormal_only: true,
  });
  assert.equal(
    url,
    `/api/v1/lab-results?patient_id=${PATIENT_ID}` +
      `&abnormal_flag_in=low&abnormal_flag_in=high&abnormal_flag_in=critical`,
  );
});

test("list_lab_results: abnormal_only ausente -> sin abnormal_flag_in", async (t) => {
  const url = await captureUrl(t, "clinical.list_lab_results", { patient_id: PATIENT_ID });
  assert.equal(url, `/api/v1/lab-results?patient_id=${PATIENT_ID}`);
  assert.ok(!url.includes("abnormal_flag_in"));
});

test("list_lab_results: sin filtros -> sin query string", async (t) => {
  const url = await captureUrl(t, "clinical.list_lab_results", {});
  assert.equal(url, "/api/v1/lab-results");
});

test("list_lab_results: parámetro no soportado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_lab_results", { value_numeric: 5 });
  assert.equal(resolved.outcome, "invalid_args");
});

test("get_lab_result: GET al detalle por id", async (t) => {
  const url = await captureUrl(t, "clinical.get_lab_result", { lab_result_id: LAB_RESULT_ID });
  assert.equal(url, `/api/v1/lab-results/${LAB_RESULT_ID}`);
});

test("get_lab_result: uuid mal formado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.get_lab_result", { lab_result_id: "no-uuid" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("create_lab_result_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_lab_result_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    analyte_name: "HbA1c",
    value_numeric: 9.1,
    unit: "%",
    abnormal_flag: "high",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_lab_result_draft");
  assert.equal(plan.targetResource, "lab_results");
  // El resumen en español describe el dato exacto que se guardaría.
  assert.match(plan.humanReadableSummary, /HbA1c/);
  assert.match(plan.humanReadableSummary, /9\.1 %/);
  assert.match(plan.humanReadableSummary, /high/);
  // El payload exacto es inmutable (congelado) y coincide con los args.
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("create_lab_result_draft: requiere patient_id y analyte_name", () => {
  assert.equal(
    resolveToolCall("clinical.create_lab_result_draft", { patient_id: PATIENT_ID }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_lab_result_draft", { analyte_name: "HbA1c" }).outcome,
    "invalid_args",
  );
});

test("create_lab_result_draft: gated por permiso de creación en lab_results", () => {
  const tools = listTools();
  // Sin permiso de creación: la escritura queda gated_out (no se ofrece al modelo).
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_lab_result_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  // Con permiso de creación en lab_results: queda disponible (efectiva).
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["lab_results"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_lab_result_draft"));
});

test("tool_search: las tools de laboratorio son descubribles por intención", () => {
  const tools = listTools();
  for (const { query, name } of [
    { query: "resultados laboratorio HbA1c", name: "clinical.list_lab_results" },
    { query: "registrar resultado laboratorio", name: "clinical.create_lab_result_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(
      hits.some((hit) => hit.name === name),
      `tool_search('${query}') debería incluir ${name}`,
    );
  }
  // Las lecturas de laboratorio NO se gatean por rol en el cliente.
  const catalog = buildToolCatalog(tools, new Set<string>());
  for (const name of ["clinical.list_lab_results", "clinical.get_lab_result"]) {
    const entry = catalog.find((e) => e.name === name);
    assert.notEqual(entry?.status, "gated_out", `${name} (lectura) no debe gatearse`);
  }
});
