import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// EPIC DOCS fase 3: referencia/contrarreferencia. Un solo tool con discriminador kind. Ambas
// escrituras pasan por P1 (plan canónico inmutable + gating por clinical_notes) y nacen como
// BORRADOR. El servidor toma paciente/médico de la consulta; el agente nunca inventa el destino.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CONSULTATION_ID = "22222222-2222-2222-2222-222222222222";

test("create_referral_draft (referencia): escritura P1 -> /clinical-notes/referral", async (t) => {
  const tool = getTool("clinical.create_referral_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.equal(tool.approval?.targetResource, "clinical_notes");

  const args = {
    consultation_id: CONSULTATION_ID,
    kind: "referencia",
    destination: "Cardiología, Hospital General",
    reason: "Soplo en estudio",
    clinical_summary: "Disnea de esfuerzo; ECG normal.",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_referral_draft");
  assert.equal(plan.targetResource, "clinical_notes");
  assert.match(plan.humanReadableSummary, /referencia/i);
  assert.match(plan.humanReadableSummary, /Cardiología, Hospital General/);
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));

  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", kind: "referencia", status: "draft" });
  });
  const resolved = resolveToolCall("clinical.create_referral_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-notes/referral");
  assert.deepEqual(capturedBody, args);
});

test("create_referral_draft (contrarreferencia): escritura P1 con hallazgos/recomendaciones", async (t) => {
  const tool = getTool("clinical.create_referral_draft");
  assert.ok(tool);
  if (!tool) return;

  const args = {
    consultation_id: CONSULTATION_ID,
    kind: "contrarreferencia",
    findings: "Ecocardiograma normal.",
    recommendations: "Control con su médico.",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_referral_draft");
  assert.match(plan.humanReadableSummary, /contrarreferencia/i);
  assert.deepEqual(plan.exactPayload, args);

  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return jsonResponse(201, { id: "x", kind: "contrarreferencia", status: "draft" });
  });
  const resolved = resolveToolCall("clinical.create_referral_draft", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/clinical-notes/referral");
  assert.deepEqual(capturedBody, args);
});

test("create_referral_draft: consultation_id y kind son obligatorios; kind acotado", () => {
  // Falta kind.
  assert.equal(
    resolveToolCall("clinical.create_referral_draft", { consultation_id: CONSULTATION_ID }).outcome,
    "invalid_args",
  );
  // Falta consultation_id.
  assert.equal(
    resolveToolCall("clinical.create_referral_draft", { kind: "referencia", destination: "x" }).outcome,
    "invalid_args",
  );
  // kind fuera del enum.
  assert.equal(
    resolveToolCall("clinical.create_referral_draft", {
      consultation_id: CONSULTATION_ID, kind: "otra",
    }).outcome,
    "invalid_args",
  );
  // Campo desconocido -> rechazado (additionalProperties: false).
  assert.equal(
    resolveToolCall("clinical.create_referral_draft", {
      consultation_id: CONSULTATION_ID, kind: "referencia", patient_id: "p",
    }).outcome,
    "invalid_args",
  );
});

test("referencia: escritura gated por clinical_notes", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.equal(
    catalog.find((e) => e.name === "clinical.create_referral_draft")?.status,
    "gated_out",
  );
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["clinical_notes"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_referral_draft"));
});

test("referencia: descubrible por tool_search", () => {
  const tools = listTools();
  for (const query of [
    "referencia envío a otra especialidad unidad",
    "contrarreferencia respuesta de vuelta del especialista",
  ]) {
    const hits = searchTools(query, tools, 10);
    assert.ok(
      hits.some((hit) => hit.name === "clinical.create_referral_draft"),
      `tool_search('${query}') -> clinical.create_referral_draft`,
    );
  }
});
