import test from "node:test";
import assert from "node:assert/strict";

import {
  applyChecklistStatus,
  buildCloseChecklist,
  buildCloseChecklistSubmission,
  isReadyToClose,
  reviewContextFromCatalog,
  summarizeChecklist,
  type ChecklistEntry,
  type CloseChecklistInput,
  type ReviewContext,
} from "./close-checklist.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import { isUiSpec } from "./ui-spec.ts";

// CHECKLIST DE CIERRE (MP-CTRL-0131): orquestación read-only que cierra el flujo post-consulta. Se
// prueba la clasificación determinista (sin asumir 'hecho'), que los requeridos pendientes impiden
// "listo para cerrar", el bloqueo de ítems que nombran un recurso fuera del contrato, y que NADA se
// cierra/firma: el cierre instruye firmar+cerrar por el camino P1. La evaluación que produce los
// ítems es del agente (fuera de alcance): aquí entra una checklist hecha a mano.

// clinical_notes y prescriptions existen en el contrato (proyectado por permiso); 'foo' no.
const CTX: ReviewContext = reviewContextFromCatalog([
  { name: "clinical_notes", forms: { create: { fields: [{ name: "content" }] } } },
  { name: "prescriptions", forms: { create: null } },
]);

function input(items: CloseChecklistInput["items"], extra?: Partial<CloseChecklistInput>): CloseChecklistInput {
  return { consultation_id: "c1", items, ...extra };
}

// --- Clasificación determinista + listo-para-cerrar ---

test("buildCloseChecklist: estado ausente -> pendiente (nunca asume hecho)", () => {
  const result = buildCloseChecklist(input([{ id: "i1", label: "Firmar la nota" }]), CTX);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.checklist.entries[0].status, "pending");
  assert.equal(result.checklist.entries[0].requirement, "recommended");
});

test("buildCloseChecklist: requerido pendiente -> NO listo para cerrar", () => {
  const result = buildCloseChecklist(
    input([
      { id: "i1", label: "Firmar la nota", status: "pending", requirement: "required" },
      { id: "i2", label: "Agendar control", status: "done", requirement: "recommended" },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.checklist.ready_to_close, false);
  assert.equal(result.checklist.summary.required_pending, 1);
});

test("buildCloseChecklist: requeridos resueltos (hecho/no aplica) -> listo para cerrar", () => {
  const result = buildCloseChecklist(
    input([
      { id: "i1", label: "Firmar la nota", status: "done", requirement: "required" },
      { id: "i2", label: "Receta", status: "not_applicable", requirement: "required" },
      { id: "i3", label: "Recordatorio", status: "pending", requirement: "optional" },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.checklist.ready_to_close, true);
  assert.equal(result.checklist.summary.required_pending, 0);
});

// --- Validación contra el contrato: recurso desconocido -> bloqueado con motivo ---

test("buildCloseChecklist: ítem con recurso fuera del contrato -> BLOQUEADO con motivo", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "Algo", status: "done", requirement: "required", related_resource: "foo" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.checklist.entries[0];
  assert.equal(entry.status, "blocked");
  assert.match(entry.reason ?? "", /fuera del contrato o sin acceso/);
  // Un requerido bloqueado NO está resuelto -> no listo para cerrar.
  assert.equal(result.checklist.ready_to_close, false);
});

test("buildCloseChecklist: ítem con recurso conocido del contrato -> no se bloquea", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "Firmar nota", status: "done", related_resource: "clinical_notes" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.checklist.entries[0].status, "done");
  assert.equal(result.checklist.entries[0].reason, null);
});

test("buildCloseChecklist: status 'blocked' propuesto por el agente se ignora (lo fija la plataforma)", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "X", status: "blocked" as never }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Sin recurso inválido, un 'blocked' propuesto cae a 'pending' (no se puede autobloquear).
  assert.equal(result.checklist.entries[0].status, "pending");
});

// --- Resumen consolidado de acciones (post-confirm) ---

test("buildCloseChecklist: conserva el resumen de acciones (saneado a enteros >= 0)", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "X" }], {
      actions_summary: { saved: 2, pending: 1, discarded: 0, blocked: -5 as never },
    }),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.checklist.actions_summary, { saved: 2, pending: 1, discarded: 0, blocked: 0 });
});

// --- Validación de entrada ---

test("buildCloseChecklist: items vacío / duplicado / sin label -> error", () => {
  assert.equal(buildCloseChecklist(input([]), CTX).ok, false);
  assert.equal(buildCloseChecklist(input([{ id: "i1", label: "A" }, { id: "i1", label: "B" }]), CTX).ok, false);
  assert.equal(buildCloseChecklist(input([{ id: "i1", label: "" }]), CTX).ok, false);
});

// --- summarize / applyChecklistStatus / isReadyToClose (lógica del panel) ---

test("summarizeChecklist + isReadyToClose: cuenta y requeridos pendientes", () => {
  const entries = [
    { status: "done" as const, requirement: "required" as const },
    { status: "pending" as const, requirement: "required" as const },
    { status: "not_applicable" as const, requirement: "optional" as const },
  ];
  const summary = summarizeChecklist(entries);
  assert.equal(summary.done, 1);
  assert.equal(summary.required_pending, 1);
  assert.equal(isReadyToClose(entries), false);
});

test("applyChecklistStatus: el médico marca hecho un pendiente; bloqueado no cambia", () => {
  const entry: ChecklistEntry = {
    id: "i1", label: "Firmar", status: "pending", requirement: "required", reason: null,
  };
  assert.equal(applyChecklistStatus(entry, "done").status, "done");

  const blocked: ChecklistEntry = { ...entry, status: "blocked", reason: "sin acceso" };
  assert.deepEqual(applyChecklistStatus(blocked, "done"), blocked); // no se puede forzar
});

// --- Mensaje de cierre: NADA se cierra/firma solo; firmar+cerrar por P1 ---

test("buildCloseChecklistSubmission: listo -> recuerda firmar+cerrar por P1, sin cerrar solo", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "Firmar la nota", status: "done", requirement: "required" }], {
      actions_summary: { saved: 3, pending: 1, discarded: 0, blocked: 0 },
    }),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const message = buildCloseChecklistSubmission("Cierre revisado:", result.checklist);
  assert.match(message, /Cierre revisado:/);
  assert.match(message, /Resumen de acciones: 3 guardadas/);
  assert.match(message, /camino de aprobación/);
  assert.match(message, /nada se cierra ni se firma de forma\s+automática|nada se cierra/);
});

test("buildCloseChecklistSubmission: requerido pendiente -> NO cerrar todavía", () => {
  const result = buildCloseChecklist(
    input([{ id: "i1", label: "Firmar la nota", status: "pending", requirement: "required" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const message = buildCloseChecklistSubmission("Cierre:", result.checklist);
  assert.match(message, /NO cierres la consulta todavía/);
  assert.match(message, /requerido/);
});

// --- Tool: lectura, no aprobación, no escribe; valida y produce el spec del panel ---

test("ui.review_close_checklist: es lectura, sin aprobación, y NO llama a ninguna escritura", async () => {
  const tool = getTool("ui.review_close_checklist");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);

  const calls: string[] = [];
  const ctx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") {
        return [{ name: "clinical_notes", forms: { create: { fields: [{ name: "content" }] } } }];
      }
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    tool,
    { items: [{ id: "i1", label: "Firmar la nota", status: "done", requirement: "required" }] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const spec = result.content as { kind: string; checklist: { ready_to_close: boolean } };
  assert.equal(spec.kind, "close_checklist");
  assert.ok(isUiSpec(spec));
  assert.equal(spec.checklist.ready_to_close, true);
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});

test("ui.review_close_checklist: entrada inválida -> error 'invalid_close_checklist'", async () => {
  const tool = getTool("ui.review_close_checklist");
  if (!tool) throw new Error("falta ui.review_close_checklist");
  const ctx: ToolExecutionContext = {
    api: (async () => []) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  const result = await executeTool(tool, { items: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_close_checklist");
});

test("ui.review_close_checklist: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.review_close_checklist", { items: [] });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("checklist de cierre de la consulta firmar nota", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.review_close_checklist"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "ui.review_close_checklist",
  );
  assert.notEqual(entry?.status, "gated_out");
});
