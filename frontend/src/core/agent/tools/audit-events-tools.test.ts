import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// AUDIT LOG READ (gaps 105/110-112): bitácora de auditoría. La tool de lectura arma el query
// string exacto que el backend honra (actor_user_id, action, entity_type, entity_id,
// rango->occurred_at_from/_to). Es SOLO lectura; el gate real es audit_events:read en el backend
// (403). No hay tool de escritura: la bitácora es append-only y nunca se muta desde el cliente.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_ID = "22222222-2222-2222-2222-222222222222";

async function captureUrl(
  t: { mock: { method: typeof import("node:test").mock.method } },
  args: Record<string, unknown>,
): Promise<string> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, { items: [], pagination: {} });
  });
  const resolved = resolveToolCall("clinical.list_audit_events", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  await executeTool(resolved.tool, resolved.args);
  return captured;
}

test("list_audit_events: actor + acción + rango -> query exacto", async (t) => {
  const url = await captureUrl(t, {
    actor_user_id: ACTOR_ID,
    action: "prescription_approved",
    date_from: "2024-01-01",
    date_to: "2024-06-30",
    limit: 50,
  });
  assert.equal(
    url,
    `/api/v1/audit-events?actor_user_id=${ACTOR_ID}&action=prescription_approved` +
      `&occurred_at_from=2024-01-01&occurred_at_to=2024-06-30&limit=50`,
  );
});

test("list_audit_events: rastro de un paciente por entity_type + entity_id", async (t) => {
  const url = await captureUrl(t, {
    entity_type: "patient",
    entity_id: PATIENT_ID,
  });
  assert.equal(
    url,
    `/api/v1/audit-events?entity_type=patient&entity_id=${PATIENT_ID}`,
  );
});

test("list_audit_events: sin filtros -> sin query string", async (t) => {
  const url = await captureUrl(t, {});
  assert.equal(url, "/api/v1/audit-events");
});

test("list_audit_events: parámetro no soportado -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_audit_events", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_audit_events: entity_id mal formado (no UUID) -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_audit_events", { entity_id: "no-uuid" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_audit_events: es lectura, descubrible y no se gatea en cliente", () => {
  const tools = listTools();
  const hits = searchTools("registros de auditoría quién accedió cambió bitácora", tools, 10);
  assert.ok(hits.some((h) => h.name === "clinical.list_audit_events"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.list_audit_events",
  );
  assert.notEqual(entry?.status, "gated_out");
});
