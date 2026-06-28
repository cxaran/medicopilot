import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// F-MEDIOS fase 2: transcribir audio de consulta para proponer una nota EN BORRADOR.
// get_audio_transcript es una LECTURA (no gateada en cliente; el backend exige
// clinical_documents:read) y la composición termina en create_consultation_draft (P1).

const DOC_ID = "44444444-4444-4444-4444-444444444444";
const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const DOCTOR_ID = "22222222-2222-2222-2222-222222222222";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
  responseBody: unknown = { available: true, transcript: "hola", provider: "stub" },
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, responseBody);
  });
  const resolved = resolveToolCall("clinical.get_audio_transcript", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("get_audio_transcript: GET al endpoint de transcripción por id", async (t) => {
  const url = await captureUrl(t, { clinical_document_id: DOC_ID });
  assert.equal(url, `/api/v1/clinical-documents/${DOC_ID}/transcript`);
});

test("get_audio_transcript: requiere clinical_document_id", () => {
  assert.equal(resolveToolCall("clinical.get_audio_transcript", {}).outcome, "invalid_args");
});

test("get_audio_transcript: uuid mal formado -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.get_audio_transcript", { clinical_document_id: "no-uuid" }).outcome,
    "invalid_args",
  );
});

test("get_audio_transcript: 'no disponible' se entrega tal cual (sin fabricar)", async (t) => {
  const body = { available: false, transcript: null, provider: null, notes: "no disponible" };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.get_audio_transcript", { clinical_document_id: DOC_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("get_audio_transcript: es una lectura, no se gatea por rol en cliente", () => {
  const catalog = buildToolCatalog(listTools(), new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.get_audio_transcript")?.status,
    "gated_out",
  );
});

test("get_audio_transcript: descubrible vía tool_search", () => {
  const hits = searchTools("transcribir audio consulta nota voz a texto", listTools(), 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.get_audio_transcript"));
});

test("composición: la nota fundamentada en la transcripción pasa por P1", () => {
  const tool = getTool("clinical.create_consultation_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    attending_doctor_id: DOCTOR_ID,
    reason_for_visit: "Cefalea de tres días (de la transcripción)",
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_consultation_draft");
  assert.equal(plan.targetResource, "consultations");
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("composición: la nota queda gateada por permiso de creación en consultations", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_consultation_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["consultations"])).map((t) => t.name),
  );
  assert.ok(effective.has("clinical.create_consultation_draft"));
});
