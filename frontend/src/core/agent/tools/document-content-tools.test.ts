import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// F-MEDIOS fase 1: leer el contenido de un documento clínico para proponer resultados de
// laboratorio EN BORRADOR. read_document_content es una LECTURA (no gateada en cliente; el
// backend exige clinical_documents:read) y la composición termina en create_lab_result_draft,
// que sigue pasando por el protocolo de aprobación P1 (nada se guarda solo).

const DOC_ID = "33333333-3333-3333-3333-333333333333";
const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
  responseBody: unknown = { content_kind: "text", text: "HbA1c 7.2 %", patient_id: PATIENT_ID },
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, responseBody);
  });
  const resolved = resolveToolCall("clinical.read_document_content", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("read_document_content: GET al endpoint de contenido por id", async (t) => {
  const url = await captureUrl(t, { clinical_document_id: DOC_ID });
  assert.equal(url, `/api/v1/clinical-documents/${DOC_ID}/content`);
});

test("read_document_content: requiere clinical_document_id", () => {
  assert.equal(resolveToolCall("clinical.read_document_content", {}).outcome, "invalid_args");
});

test("read_document_content: uuid mal formado -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.read_document_content", { clinical_document_id: "no-uuid" }).outcome,
    "invalid_args",
  );
});

test("read_document_content: devuelve el contenido al modelo", async (t) => {
  const body = { document_type: "pdf", patient_id: PATIENT_ID, content_kind: "text", text: "HbA1c 7.2 %" };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.read_document_content", { clinical_document_id: DOC_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("read_document_content: es una lectura, no se gatea por rol en cliente", () => {
  const catalog = buildToolCatalog(listTools(), new Set<string>());
  assert.notEqual(
    catalog.find((e) => e.name === "clinical.read_document_content")?.status,
    "gated_out",
  );
});

test("read_document_content: descubrible vía tool_search", () => {
  const hits = searchTools("leer documento reporte laboratorio extraer resultados", listTools(), 10);
  assert.ok(hits.some((hit) => hit.name === "clinical.read_document_content"));
});

test("composición: el borrador con LOINC + documento fuente sigue pasando por P1", () => {
  // El paso final de la extracción es una ESCRITURA que requiere aprobación del médico.
  const tool = getTool("clinical.create_lab_result_draft");
  assert.ok(tool, "la tool debe existir");
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval, "debe declarar metadata de aprobación");

  const args = {
    patient_id: PATIENT_ID,
    analyte_name: "HbA1c",
    analyte_code: "4548-4",
    value_numeric: 7.2,
    unit: "%",
    clinical_document_id: DOC_ID,
  };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_lab_result_draft");
  assert.equal(plan.targetResource, "lab_results");
  // El payload exacto (inmutable) conserva el LOINC y el documento fuente.
  assert.deepEqual(plan.exactPayload, args);
  assert.ok(Object.isFrozen(plan.exactPayload));
});

test("composición: el borrador queda gateado por permiso de creación en lab_results", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_lab_result_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["lab_results"])).map((tool) => tool.name),
  );
  assert.ok(effective.has("clinical.create_lab_result_draft"));
});

test("create_lab_result_draft: acepta analyte_code (LOINC) en el esquema", () => {
  const resolved = resolveToolCall("clinical.create_lab_result_draft", {
    patient_id: PATIENT_ID,
    analyte_name: "HbA1c",
    analyte_code: "4548-4",
  });
  assert.equal(resolved.outcome, "ready");
});
