import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// VACCINATION TRACKING: inmunizaciones del paciente. La lectura (list_immunizations) no se gatea
// en cliente (FastAPI exige patient_immunizations:read). La escritura (create_immunization_draft)
// pasa por el protocolo de aprobación P1 (plan canónico inmutable + gating por permiso de
// creación). Nada se guarda de forma autónoma.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

test("list_immunizations: patient_id + status -> query exacto", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall("clinical.list_immunizations", {
    patient_id: PATIENT_ID,
    status: "aplicada",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, `/api/v1/patient-immunizations?patient_id=${PATIENT_ID}&status=aplicada`);
});

test("list_immunizations: estado no permitido o campo desconocido -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.list_immunizations", { patient_id: PATIENT_ID, status: "xxx" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.list_immunizations", { foo: 1 }).outcome,
    "invalid_args",
  );
});

test("create_immunization_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_immunization_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    vaccine_name: "Influenza estacional",
    dose_number: 2,
    route: "intramuscular",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_immunization_draft");
  assert.equal(plan.targetResource, "patient_immunizations");
  assert.match(plan.humanReadableSummary, /Influenza/);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("create_immunization_draft: requiere patient_id y vaccine_name", () => {
  assert.equal(
    resolveToolCall("clinical.create_immunization_draft", {
      patient_id: PATIENT_ID,
    }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_immunization_draft", {
      vaccine_name: "Influenza estacional",
    }).outcome,
    "invalid_args",
  );
  // status fuera del enum -> inválido.
  assert.equal(
    resolveToolCall("clinical.create_immunization_draft", {
      patient_id: PATIENT_ID, vaccine_name: "x", status: "no_existe",
    }).outcome,
    "invalid_args",
  );
  // route fuera del enum -> inválido.
  assert.equal(
    resolveToolCall("clinical.create_immunization_draft", {
      patient_id: PATIENT_ID, vaccine_name: "x", route: "intravenosa",
    }).outcome,
    "invalid_args",
  );
  // dose_number fuera de rango -> inválido.
  assert.equal(
    resolveToolCall("clinical.create_immunization_draft", {
      patient_id: PATIENT_ID, vaccine_name: "x", dose_number: 200,
    }).outcome,
    "invalid_args",
  );
});

test("create_immunization_draft: POST a /patient-immunizations con el payload", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", vaccine_name: "Influenza estacional" });
  });
  const args = {
    patient_id: PATIENT_ID,
    vaccine_name: "Influenza estacional",
    dose_number: 2,
    administered_on: "2024-10-01",
    route: "intramuscular",
    lot_number: "ABC123",
  };
  const resolved = resolveToolCall("clinical.create_immunization_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/patient-immunizations");
  assert.deepEqual(capturedBody, args);
});

test("create_immunization_draft: gated por permiso de creación en patient_immunizations", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_immunization_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["patient_immunizations"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_immunization_draft"));
});

test("immunizations: lectura no gateada + descubribles por tool_search", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.list_immunizations")?.status,
    "gated_out",
  );
  for (const { query, name } of [
    { query: "vacunas inmunizaciones aplicadas del paciente", name: "clinical.list_immunizations" },
    { query: "guardar vacuna de influenza aplicada al paciente", name: "clinical.create_immunization_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(hits.some((hit) => hit.name === name), `tool_search('${query}') -> ${name}`);
  }
});
