import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// EPIC DOCS fase 1: notas SOAP. La lectura (list_soap_notes) no se gatea en cliente (FastAPI
// exige clinical_notes:read). La escritura (create_soap_note_draft) pasa por el protocolo P1
// (plan canónico inmutable + gating por permiso de creación). La nota nace en BORRADOR; el
// servidor deriva el paciente de la consulta (el cliente no envía patient_id ni status).

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const CONSULTATION_ID = "22222222-2222-2222-2222-222222222222";

test("list_soap_notes: patient_id + status -> query exacto", async (t) => {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall("clinical.list_soap_notes", {
    patient_id: PATIENT_ID,
    status: "draft",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(captured, `/api/v1/clinical-notes?patient_id=${PATIENT_ID}&status=draft`);
});

test("list_soap_notes: status fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.list_soap_notes", { status: "finalized" }).outcome,
    "invalid_args",
  );
});

test("create_soap_note_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_soap_note_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    consultation_id: CONSULTATION_ID,
    subjective: "Dolor torácico de 2 horas.",
    objective: "TA 130/85.",
    assessment: "Probable angina.",
    plan: "ECG y troponinas.",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_soap_note_draft");
  assert.equal(plan.targetResource, "clinical_notes");
  assert.match(plan.humanReadableSummary, new RegExp(CONSULTATION_ID));
  assert.match(plan.humanReadableSummary, /borrador/i);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("create_soap_note_draft: requiere consultation_id; no acepta patient_id/status", () => {
  assert.equal(
    resolveToolCall("clinical.create_soap_note_draft", { subjective: "x" }).outcome,
    "invalid_args",
  );
  // patient_id y status los gobierna el servidor: no se aceptan en el cliente (extra forbid).
  assert.equal(
    resolveToolCall("clinical.create_soap_note_draft", {
      consultation_id: CONSULTATION_ID, patient_id: PATIENT_ID,
    }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_soap_note_draft", {
      consultation_id: CONSULTATION_ID, status: "approved",
    }).outcome,
    "invalid_args",
  );
});

test("create_soap_note_draft: POST a /clinical-notes con el payload", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", status: "draft" });
  });
  const args = { consultation_id: CONSULTATION_ID, subjective: "Dolor torácico." };
  const resolved = resolveToolCall("clinical.create_soap_note_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-notes");
  assert.deepEqual(capturedBody, args);
});

test("create_soap_note_draft: gated por permiso de creación en clinical_notes", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_soap_note_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["clinical_notes"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_soap_note_draft"));
});

test("soap notes: lectura no gateada + descubribles por tool_search", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.list_soap_notes")?.status,
    "gated_out",
  );
  for (const { query, name } of [
    { query: "notas SOAP guardadas del paciente", name: "clinical.list_soap_notes" },
    { query: "redactar nota SOAP de la consulta borrador", name: "clinical.create_soap_note_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(hits.some((hit) => hit.name === name), `tool_search('${query}') -> ${name}`);
  }
});
