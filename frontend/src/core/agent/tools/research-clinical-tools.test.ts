import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";

// Tools de B13: investigación PubMed (proxy server-side) y acceso clínico estilo FHIR
// (navegador->FastAPI con cookie). Se mockea globalThis.fetch y se verifica el mapeo de
// endpoints, credentials:"include", la composición del resumen y los args inválidos.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

test("pubmed.search: GET al proxy con query y limit, cookie incluida", async (t) => {
  let captured: { url: unknown; init: RequestInit } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = { url, init };
    return jsonResponse(200, { query: "aspirin", count: 1, articles: [{ pmid: "111" }] });
  });

  const resolved = resolveToolCall("pubmed.search", { query: "aspirin", limit: 5 });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  assert.equal(resolved.tool.kind, "read");

  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  assert.equal(captured?.url, "/api/v1/research/pubmed?query=aspirin&limit=5");
  assert.equal((captured?.init.method ?? "GET").toUpperCase(), "GET");
  assert.equal(captured?.init.credentials, "include");
});

test("pubmed.search: sin query -> args inválidos", () => {
  const resolved = resolveToolCall("pubmed.search", {});
  assert.equal(resolved.outcome, "invalid_args");
  assert.equal(resolved.result.status, "error");
  if (resolved.result.status === "error") {
    assert.equal(resolved.result.code, "invalid_arguments");
  }
});

test("pubmed.get_article: GET al detalle por pmid", async (t) => {
  let captured: { url: unknown } | undefined;
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    captured = { url };
    return jsonResponse(200, { pmid: "333", title: "T", citation: "c" });
  });

  const resolved = resolveToolCall("pubmed.get_article", { pmid: "333" });
  if (resolved.outcome !== "ready") throw new Error("esperado ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  assert.equal(captured?.url, "/api/v1/research/pubmed/333");
});

test("pubmed.get_article: sin pmid -> args inválidos", () => {
  const resolved = resolveToolCall("pubmed.get_article", {});
  assert.equal(resolved.outcome, "invalid_args");
});

test("clinical.patient_summary: compone paciente + datos clínicos vía FastAPI con cookie", async (t) => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    const u = String(url);
    urls.push(u);
    assert.equal(init.credentials, "include");
    if (u.startsWith("/api/v1/patients/")) {
      return jsonResponse(200, { id: PATIENT_ID, full_name: "Paciente Demo" });
    }
    if (u.startsWith("/api/v1/patient-clinical-items")) {
      return jsonResponse(200, { items: [{ id: "ci1", title: "Alergia" }], pagination: {} });
    }
    throw new Error(`url inesperada: ${u}`);
  });

  const resolved = resolveToolCall("clinical.patient_summary", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  assert.equal(resolved.tool.kind, "read");

  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const content = result.content as { patient: { id: string }; clinical_items: unknown[] };
  assert.equal(content.patient.id, PATIENT_ID);
  assert.equal(content.clinical_items.length, 1);
  assert.ok(urls.includes(`/api/v1/patients/${PATIENT_ID}`));
  assert.ok(urls.includes(`/api/v1/patient-clinical-items?patient_id=${PATIENT_ID}`));
});

test("clinical.patient_summary: uuid mal formado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.patient_summary", { patient_id: "no-es-uuid" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("clinical.patient_summary: 403 del expediente -> error 'forbidden'", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse(403, { code: "forbidden", message: "no" }));
  const resolved = resolveToolCall("clinical.patient_summary", { patient_id: PATIENT_ID });
  if (resolved.outcome !== "ready") throw new Error("esperado ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "forbidden");
});
