import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// EPIC DOCS fase 2: constancia/justificante e incapacidad. Ambas escrituras pasan por P1 (plan
// canónico inmutable + gating por clinical_notes) y nacen como BORRADOR. La incapacidad EXIGE
// rest_days (≥1): el agente nunca lo inventa; el servidor toma paciente/médico de la consulta.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CONSULTATION_ID = "22222222-2222-2222-2222-222222222222";

test("create_medical_certificate_draft: escritura P1 -> /clinical-notes/medical-certificate", async (t) => {
  const tool = getTool("clinical.create_medical_certificate_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval);

  const args = { consultation_id: CONSULTATION_ID, motivo: "Cuadro gripal" };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_medical_certificate_draft");
  assert.equal(plan.targetResource, "clinical_notes");
  assert.match(plan.humanReadableSummary, /constancia/i);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));

  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", kind: "constancia", status: "draft" });
  });
  const resolved = resolveToolCall("clinical.create_medical_certificate_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-notes/medical-certificate");
  assert.deepEqual(capturedBody, args);
});

test("create_medical_certificate_draft: requiere consultation_id; no acepta paciente/médico", () => {
  assert.equal(
    resolveToolCall("clinical.create_medical_certificate_draft", { motivo: "x" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_medical_certificate_draft", {
      consultation_id: CONSULTATION_ID, patient_id: "p",
    }).outcome,
    "invalid_args",
  );
});

test("create_sick_leave_draft: escritura P1 -> /clinical-notes/sick-leave con rest_days", async (t) => {
  const tool = getTool("clinical.create_sick_leave_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.equal(tool.approval?.targetResource, "clinical_notes");

  const args = {
    consultation_id: CONSULTATION_ID,
    diagnosis: "Lumbalgia aguda",
    rest_start_date: "2026-01-02",
    rest_days: 5,
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_sick_leave_draft");
  assert.match(plan.humanReadableSummary, /5 día/);
  assert.deepEqual(plan.exactPayload, args);

  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", kind: "incapacidad", status: "draft" });
  });
  const resolved = resolveToolCall("clinical.create_sick_leave_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-notes/sick-leave");
  assert.deepEqual(capturedBody, args);
});

test("create_sick_leave_draft: rest_days es obligatorio (nunca inventado) y ≥1", () => {
  // Falta rest_days -> args inválidos: el agente debe pedirlo, no asumirlo.
  assert.equal(
    resolveToolCall("clinical.create_sick_leave_draft", {
      consultation_id: CONSULTATION_ID, diagnosis: "x", rest_start_date: "2026-01-02",
    }).outcome,
    "invalid_args",
  );
  // rest_days < 1 -> args inválidos.
  assert.equal(
    resolveToolCall("clinical.create_sick_leave_draft", {
      consultation_id: CONSULTATION_ID, diagnosis: "x", rest_start_date: "2026-01-02", rest_days: 0,
    }).outcome,
    "invalid_args",
  );
});

test("documentos médicos: ambas escrituras gated por clinical_notes", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  for (const name of ["clinical.create_medical_certificate_draft", "clinical.create_sick_leave_draft"]) {
    assert.equal(catalog.find((e) => e.name === name)?.status, "gated_out");
  }
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["clinical_notes"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_medical_certificate_draft"));
  assert.ok(effective.has("clinical.create_sick_leave_draft"));
});

test("documentos médicos: descubribles por tool_search", () => {
  const tools = listTools();
  for (const { query, name } of [
    { query: "constancia justificante de asistencia médica", name: "clinical.create_medical_certificate_draft" },
    { query: "incapacidad justificante de reposo días", name: "clinical.create_sick_leave_draft" },
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(hits.some((hit) => hit.name === name), `tool_search('${query}') -> ${name}`);
  }
});
