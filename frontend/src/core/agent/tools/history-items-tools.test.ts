import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// STRUCTURED HISTORY (gap 6): antecedentes estructurados del paciente. La lectura
// (list_history_items) no se gatea en cliente (FastAPI exige patient_history_items:read). La
// escritura (create_history_item_draft) pasa por el protocolo de aprobación P1 (plan canónico
// inmutable + gating por permiso de creación). Nada se guarda de forma autónoma.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

test("list_history_items: patient_id + category -> query exacto", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall("clinical.list_history_items", {
    patient_id: PATIENT_ID,
    category: "familiar",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, `/api/v1/patient-history-items?patient_id=${PATIENT_ID}&category=familiar`);
});

test("list_history_items: categoría no permitida o campo desconocido -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.list_history_items", { patient_id: PATIENT_ID, category: "xxx" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.list_history_items", { foo: 1 }).outcome,
    "invalid_args",
  );
});

test("create_history_item_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_history_item_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    category: "familiar",
    description: "Diabetes mellitus en la madre",
    relationship_to_patient: "madre",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_history_item_draft");
  assert.equal(plan.targetResource, "patient_history_items");
  assert.match(plan.humanReadableSummary, /familiar/);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("create_history_item_draft: requiere patient_id, category y description", () => {
  assert.equal(
    resolveToolCall("clinical.create_history_item_draft", {
      patient_id: PATIENT_ID, category: "familiar",
    }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_history_item_draft", {
      patient_id: PATIENT_ID, description: "x",
    }).outcome,
    "invalid_args",
  );
  // category fuera del enum -> inválido.
  assert.equal(
    resolveToolCall("clinical.create_history_item_draft", {
      patient_id: PATIENT_ID, category: "no_existe", description: "x",
    }).outcome,
    "invalid_args",
  );
  // onset_age fuera de rango -> inválido.
  assert.equal(
    resolveToolCall("clinical.create_history_item_draft", {
      patient_id: PATIENT_ID, category: "quirurgico", description: "Apendicectomía", onset_age: 200,
    }).outcome,
    "invalid_args",
  );
});

test("create_history_item_draft: POST a /patient-history-items con el payload", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", category: "quirurgico" });
  });
  const args = {
    patient_id: PATIENT_ID,
    category: "quirurgico",
    description: "Apendicectomía",
    onset_age: 25,
    occurred_on: "2010-05-01",
  };
  const resolved = resolveToolCall("clinical.create_history_item_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/patient-history-items");
  assert.deepEqual(capturedBody, args);
});

test("create_history_item_draft: gated por permiso de creación en patient_history_items", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_history_item_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["patient_history_items"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_history_item_draft"));
});

test("history items: lectura no gateada + descubribles por tool_search", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.list_history_items")?.status,
    "gated_out",
  );
  for (const { query, name } of [
    { query: "antecedentes familiares quirúrgicos historia del paciente", name: "clinical.list_history_items" },
    { query: "guardar antecedente familiar de diabetes en la madre", name: "clinical.create_history_item_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(hits.some((hit) => hit.name === name), `tool_search('${query}') -> ${name}`);
  }
});
