import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// EPIC ESCALAS fase 2: resultados de escalas persistidos. La lectura (list_scale_results) no
// se gatea en cliente (FastAPI exige scale_results:read). Las escrituras
// (create/update_scale_result_draft) pasan por el protocolo de aprobación P1 (plan canónico
// inmutable). Como scale_results NO publica forms.create/update en el catálogo (su insumo JSON
// no es un formulario genérico), el gating usa ``requiredPermissions`` con los permisos de la
// sesión. El servidor recomputa el puntaje; el cliente no lo provee.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

test("list_scale_results: patient_id + scale_id -> query exacto", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall("clinical.list_scale_results", {
    patient_id: PATIENT_ID,
    scale_id: "cha2ds2_vasc",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(
    captured,
    `/api/v1/scale-results?patient_id=${PATIENT_ID}&scale_id=cha2ds2_vasc`,
  );
});

test("list_scale_results: parámetro no soportado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_scale_results", { score: 5 });
  assert.equal(resolved.outcome, "invalid_args");
});

test("create_scale_result_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_scale_result_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    scale_id: "cha2ds2_vasc",
    inputs: { chf: false, hypertension: true, age: 80, diabetes: true,
      stroke_tia_thromboembolism: false, vascular_disease: false, sex: "female" },
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_scale_result_draft");
  assert.equal(plan.targetResource, "scale_results");
  assert.match(plan.humanReadableSummary, /cha2ds2_vasc/);
  // El payload exacto es inmutable (congelado) y coincide con los args (incluye inputs).
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("create_scale_result_draft: requiere patient_id, scale_id e inputs", () => {
  assert.equal(
    resolveToolCall("clinical.create_scale_result_draft", {
      patient_id: PATIENT_ID, scale_id: "cha2ds2_vasc",
    }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_scale_result_draft", {
      patient_id: PATIENT_ID, inputs: {},
    }).outcome,
    "invalid_args",
  );
});

test("create_scale_result_draft: POST a /scale-results con el payload", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", score: 5, interpretation_label: "Riesgo alto" });
  });
  const args = {
    patient_id: PATIENT_ID,
    scale_id: "cha2ds2_vasc",
    inputs: { chf: false, hypertension: true, age: 80, diabetes: true,
      stroke_tia_thromboembolism: false, vascular_disease: false, sex: "female" },
  };
  const resolved = resolveToolCall("clinical.create_scale_result_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/scale-results");
  assert.deepEqual(capturedBody, args);
});

test("create_scale_result_draft: gated por permiso de creación en scale_results", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_scale_result_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["scale_results"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_scale_result_draft"));
});

test("escrituras de escalas: el gate pasa por requiredPermissions (scale_results no publica forms)", () => {
  const tools = listTools();
  // Sin permisos en sesión y sin recurso creable: ambas gateadas, nombrando el permiso faltante.
  const closed = buildToolCatalog(tools, new Set<string>(), new Set<string>());
  const create = closed.find((e) => e.name === "clinical.create_scale_result_draft");
  const update = closed.find((e) => e.name === "clinical.update_scale_result_draft");
  assert.equal(create?.status, "gated_out");
  assert.match(String(create?.reason), /scale_results:create/);
  assert.equal(update?.status, "gated_out");
  assert.match(String(update?.reason), /scale_results:update/);

  // Con el permiso de sesión correspondiente, cada una se habilita por separado.
  const canCreate = new Set(
    effectiveTools(tools, new Set<string>(), new Set(["scale_results:create"])).map((t) => t.name),
  );
  assert.ok(canCreate.has("clinical.create_scale_result_draft"));
  assert.ok(!canCreate.has("clinical.update_scale_result_draft"));

  const canUpdate = new Set(
    effectiveTools(tools, new Set<string>(), new Set(["scale_results:update"])).map((t) => t.name),
  );
  assert.ok(canUpdate.has("clinical.update_scale_result_draft"));
  assert.ok(!canUpdate.has("clinical.create_scale_result_draft"));
});

test("update_scale_result_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.update_scale_result_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    result_id: "22222222-2222-2222-2222-222222222222",
    inputs: { chf: true, hypertension: true, age: 80, diabetes: true,
      stroke_tia_thromboembolism: false, vascular_disease: false, sex: "female" },
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "update_scale_result_draft");
  assert.equal(plan.targetResource, "scale_results");
  assert.match(plan.humanReadableSummary, /recomputa/);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("update_scale_result_draft: requiere result_id y rechaza campos extra", () => {
  assert.equal(
    resolveToolCall("clinical.update_scale_result_draft", { inputs: {} }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.update_scale_result_draft", {
      result_id: "22222222-2222-2222-2222-222222222222",
      score: 9, // el puntaje NUNCA se acepta del cliente
    }).outcome,
    "invalid_args",
  );
});

test("update_scale_result_draft: PATCH a /scale-results/{id} SIN result_id en el body", async (t) => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedMethod = String(init.method);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(200, { id: "x", score: 6, interpretation_label: "Riesgo alto" });
  });
  const inputs = { chf: true, hypertension: true, age: 80, diabetes: true,
    stroke_tia_thromboembolism: false, vascular_disease: false, sex: "female" };
  const resolved = resolveToolCall("clinical.update_scale_result_draft", {
    result_id: "22222222-2222-2222-2222-222222222222",
    inputs,
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/scale-results/22222222-2222-2222-2222-222222222222");
  assert.equal(capturedMethod, "PATCH");
  assert.deepEqual(capturedBody, { inputs });
});

test("scale results: lectura no gateada + descubribles por tool_search", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.list_scale_results")?.status,
    "gated_out",
  );
  for (const { query, name } of [
    { query: "resultados de escalas guardados del paciente", name: "clinical.list_scale_results" },
    { query: "guardar resultado de escala CHA2DS2-VASc", name: "clinical.create_scale_result_draft" },
    { query: "corregir insumo de un resultado de escala guardado", name: "clinical.update_scale_result_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(hits.some((hit) => hit.name === name), `tool_search('${query}') -> ${name}`);
  }
});
