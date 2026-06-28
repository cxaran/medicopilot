import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// G4 (slice A): eventos clínicos. La tool de lectura arma el query string exacto que el backend
// honra (patient_id, event_type, status, rango->started_at_from/_to) y la de escritura pasa por
// el protocolo de aprobación P1.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";

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

test("list_clinical_events: patient_id + tipo + estado + rango -> started_at_from/to", async (t) => {
  const url = await captureUrl(t, "clinical.list_clinical_events", {
    patient_id: PATIENT_ID,
    event_type: "hospitalization",
    status: "active",
    date_from: "2026-01-01",
    date_to: "2026-06-30",
    limit: 50,
  });
  assert.equal(
    url,
    `/api/v1/clinical-events?patient_id=${PATIENT_ID}&event_type=hospitalization` +
      `&status=active&started_at_from=2026-01-01&started_at_to=2026-06-30&limit=50`,
  );
});

test("list_clinical_events: sin filtros -> sin query string", async (t) => {
  const url = await captureUrl(t, "clinical.list_clinical_events", {});
  assert.equal(url, "/api/v1/clinical-events");
});

test("list_clinical_events: event_type fuera del enum -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_clinical_events", { event_type: "boda" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_clinical_events: parámetro no soportado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_clinical_events", { title: "x" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("create_clinical_event_draft: escritura por aprobación P1 (plan canónico)", () => {
  const tool = getTool("clinical.create_clinical_event_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  const args = { patient_id: PATIENT_ID, event_type: "referral", title: "Referencia a cardiología" };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_clinical_event_draft");
  assert.equal(plan.targetResource, "clinical_events");
  assert.match(plan.humanReadableSummary, /referral/);
  assert.match(plan.humanReadableSummary, /Referencia a cardiología/);
  assert.deepEqual(plan.exactPayload, args);
});

test("create_clinical_event_draft: requiere patient_id, event_type y title", () => {
  assert.equal(
    resolveToolCall("clinical.create_clinical_event_draft", { patient_id: PATIENT_ID }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_clinical_event_draft", {
      patient_id: PATIENT_ID,
      event_type: "fiesta",
      title: "x",
    }).outcome,
    "invalid_args",
  );
});

test("create_clinical_event_draft: gated por permiso de creación en clinical_events", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_clinical_event_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["clinical_events"])).map((t) => t.name),
  );
  assert.ok(effective.has("clinical.create_clinical_event_draft"));
});

test("tool_search: la lectura de eventos clínicos es descubrible y no se gatea", () => {
  const tools = listTools();
  const hits = searchTools("eventos clínicos línea de tiempo hospitalización", tools, 10);
  assert.ok(hits.some((h) => h.name === "clinical.list_clinical_events"));
  const entry = buildToolCatalog(tools, new Set()).find(
    (e) => e.name === "clinical.list_clinical_events",
  );
  assert.notEqual(entry?.status, "gated_out");
});
