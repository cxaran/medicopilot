import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// G4 (slice B): órdenes de estudio y tareas clínicas. Las lecturas arman el query string exacto y
// las escrituras pasan por el protocolo de aprobación P1.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const DOCTOR_ID = "22222222-2222-2222-2222-222222222222";
const OWNER_ID = "33333333-3333-3333-3333-333333333333";

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

test("list_study_orders: patient_id + ordered_by + status + rango -> ordered_at_from/to", async (t) => {
  const url = await captureUrl(t, "clinical.list_study_orders", {
    patient_id: PATIENT_ID,
    ordered_by: DOCTOR_ID,
    status: "resulted",
    date_from: "2026-01-01",
    date_to: "2026-06-30",
  });
  assert.equal(
    url,
    `/api/v1/study-orders?patient_id=${PATIENT_ID}&ordered_by=${DOCTOR_ID}` +
      `&status=resulted&ordered_at_from=2026-01-01&ordered_at_to=2026-06-30`,
  );
});

test("list_study_orders: status fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.list_study_orders", { status: "done" }).outcome,
    "invalid_args",
  );
});

test("list_tasks: owner_id + patient_id + status + priority + rango -> due_at_from/to", async (t) => {
  const url = await captureUrl(t, "clinical.list_tasks", {
    owner_id: OWNER_ID,
    patient_id: PATIENT_ID,
    status: "open",
    priority: "high",
    date_from: "2026-01-01",
    date_to: "2026-03-31",
  });
  assert.equal(
    url,
    `/api/v1/clinical-tasks?owner_id=${OWNER_ID}&patient_id=${PATIENT_ID}` +
      `&status=open&priority=high&due_at_from=2026-01-01&due_at_to=2026-03-31`,
  );
});

test("list_tasks: priority fuera del enum -> args inválidos", () => {
  assert.equal(
    resolveToolCall("clinical.list_tasks", { priority: "urgent" }).outcome,
    "invalid_args",
  );
});

test("create_study_order_draft: escritura por aprobación P1 (plan canónico)", () => {
  const tool = getTool("clinical.create_study_order_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  const args = { patient_id: PATIENT_ID, ordered_by: DOCTOR_ID, study_name: "Biometría hemática" };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_study_order_draft");
  assert.equal(plan.targetResource, "study_orders");
  assert.match(plan.humanReadableSummary, /Biometría hemática/);
  assert.deepEqual(plan.exactPayload, args);
});

test("create_study_order_draft: requiere patient_id, ordered_by y study_name", () => {
  assert.equal(
    resolveToolCall("clinical.create_study_order_draft", { patient_id: PATIENT_ID }).outcome,
    "invalid_args",
  );
});

test("create_task_draft: escritura por aprobación P1 (plan canónico)", () => {
  const tool = getTool("clinical.create_task_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  const args = { title: "Llamar al paciente", patient_id: PATIENT_ID, due_at: "2026-03-01T10:00" };
  const plan = buildClinicalActionPlan(tool, args);
  assert.equal(plan.actionType, "create_task_draft");
  assert.equal(plan.targetResource, "clinical_tasks");
  assert.match(plan.humanReadableSummary, /Llamar al paciente/);
  assert.deepEqual(plan.exactPayload, args);
});

test("create_task_draft: requiere title", () => {
  assert.equal(resolveToolCall("clinical.create_task_draft", {}).outcome, "invalid_args");
});

test("gating: las escrituras quedan gated_out sin permiso y disponibles con él", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  for (const name of ["clinical.create_study_order_draft", "clinical.create_task_draft"]) {
    assert.equal(catalog.find((e) => e.name === name)?.status, "gated_out");
  }
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["study_orders", "clinical_tasks"])).map((t) => t.name),
  );
  assert.ok(effective.has("clinical.create_study_order_draft"));
  assert.ok(effective.has("clinical.create_task_draft"));
});

test("tool_search: las lecturas de órdenes y tareas son descubribles y no se gatean", () => {
  const tools = listTools();
  assert.ok(searchTools("órdenes de estudio laboratorio", tools, 10).some((h) => h.name === "clinical.list_study_orders"));
  assert.ok(searchTools("tareas pendientes seguimiento", tools, 10).some((h) => h.name === "clinical.list_tasks"));
  const catalog = buildToolCatalog(tools, new Set());
  for (const name of ["clinical.list_study_orders", "clinical.list_tasks"]) {
    assert.notEqual(catalog.find((e) => e.name === name)?.status, "gated_out");
  }
});
