import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDecision,
  buildCloseOutPlan,
  buildCloseOutSubmission,
  reviewContextFromCatalog,
  summarize,
  type CloseOutEntry,
  type DetectedActionsInput,
  type ReviewContext,
} from "./detected-actions.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import { isUiSpec } from "./ui-spec.ts";

// CIERRE CONSCIENTE POST-TRANSCRIPCIÓN (MP-CTRL-0120): orquestación read-only sobre el camino P1.
// Se prueba el reparto aceptar/editar/rechazar/bloquear, el diff contra el expediente, que NADA se
// persiste (la tool no llama a ninguna escritura) y que el cierre instruye proceder acción por
// acción por la aprobación P1. La extracción que produce las acciones es del agente (fuera de
// alcance): aquí entra un conjunto de acciones hecho a mano.

// Catálogo de recursos derivado a contexto: patients creable (con esquema), appointments creable,
// consultations NO creable (legible sin permiso de crear), y un recurso desconocido ausente.
const CTX: ReviewContext = reviewContextFromCatalog([
  {
    name: "patients",
    forms: { create: { fields: [{ name: "full_name" }, { name: "birth_date" }, { name: "phone" }] } },
  },
  { name: "appointments", forms: { create: { fields: [{ name: "scheduled_at" }, { name: "reason" }] } } },
  { name: "consultations", forms: { create: null } },
]);

function input(actions: DetectedActionsInput["actions"]): DetectedActionsInput {
  return { patient_id: "p1", actions };
}

// --- Reparto del plan de cierre ---

test("buildCloseOutPlan: una acción aceptada entra al plan de guardado (save_draft)", () => {
  const result = buildCloseOutPlan(
    input([
      {
        id: "a1",
        type: "create_patient",
        target_resource: "patients",
        proposed_values: { full_name: "Ana Ruiz", birth_date: "1990-01-01" },
        status: "accepted",
        source_fragment: "la paciente Ana Ruiz",
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.equal(entry.disposition, "save_draft");
  assert.equal(entry.values.full_name, "Ana Ruiz");
  assert.equal(result.plan.summary.save_draft, 1);
  // Alta: el diff es todo "added" contra un expediente vacío.
  assert.ok(entry.diff.some((d) => d.field === "full_name" && d.change === "added"));
});

test("buildCloseOutPlan: una acción rechazada se EXCLUYE (discarded)", () => {
  const result = buildCloseOutPlan(
    input([{ id: "a1", type: "create_patient", target_resource: "patients", status: "rejected" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.entries[0].disposition, "discarded");
  assert.equal(result.plan.summary.discarded, 1);
  assert.equal(result.plan.summary.save_draft, 0);
});

test("buildCloseOutPlan: una acción editada usa los valores editados (no los propuestos)", () => {
  const result = buildCloseOutPlan(
    input([
      {
        id: "a1",
        type: "create_patient",
        target_resource: "patients",
        proposed_values: { full_name: "Ana" },
        edited_values: { full_name: "Ana Ruiz" },
        status: "edited",
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.equal(entry.disposition, "save_draft");
  assert.equal(entry.values.full_name, "Ana Ruiz"); // editado, no "Ana"
});

test("buildCloseOutPlan: status pendiente/ausente -> pending (necesita confirmación)", () => {
  const result = buildCloseOutPlan(
    input([
      { id: "a1", type: "create_patient", target_resource: "patients", proposed_values: { full_name: "X" } },
      { id: "a2", type: "create_patient", target_resource: "patients", status: "pending" },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.entries[0].disposition, "pending");
  assert.equal(result.plan.entries[1].disposition, "pending");
  assert.equal(result.plan.summary.pending, 2);
});

// --- Validación contra catálogo + RBAC: bloquea con motivo, NO descarta en silencio ---

test("buildCloseOutPlan: recurso sin permiso de crear -> BLOQUEADA con motivo (no descartada)", () => {
  const result = buildCloseOutPlan(
    input([{ id: "a1", type: "create_consultation", target_resource: "consultations", status: "accepted" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.equal(entry.disposition, "blocked");
  assert.match(entry.reason ?? "", /permiso para crear/);
  assert.match(entry.reason ?? "", /consultations/);
  assert.equal(result.plan.summary.blocked, 1);
  assert.equal(result.plan.summary.save_draft, 0); // no se guarda pese al status accepted
});

test("buildCloseOutPlan: recurso desconocido -> BLOQUEADA nombrándolo", () => {
  const result = buildCloseOutPlan(
    input([{ id: "a1", type: "create_foo", target_resource: "foo", status: "accepted" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.entries[0].disposition, "blocked");
  assert.match(result.plan.entries[0].reason ?? "", /desconocido/);
});

test("buildCloseOutPlan: open_template sin id de plantilla -> bloqueada", () => {
  const result = buildCloseOutPlan(
    input([{ id: "a1", type: "open_template:", target_resource: "patients", status: "accepted" }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.plan.entries[0].reason ?? "", /plantilla/);
});

// --- Campos fuera del esquema: se descartan, no se inventan ---

test("buildCloseOutPlan: campo ajeno al esquema -> dropped_fields (no se inventa)", () => {
  const result = buildCloseOutPlan(
    input([
      {
        id: "a1",
        type: "create_patient",
        target_resource: "patients",
        proposed_values: { full_name: "Ana", campo_inventado: "x" },
        status: "accepted",
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.ok(entry.dropped_fields.includes("campo_inventado"));
  assert.equal(entry.values.campo_inventado, undefined);
  assert.equal(entry.values.full_name, "Ana");
});

// --- Diff contra el expediente actual ---

test("buildCloseOutPlan: diff correcto contra el estado actual (added/changed; ausencia != negativo)", () => {
  const result = buildCloseOutPlan(
    input([
      {
        id: "a1",
        type: "open_template:patients",
        template_id: "patients",
        target_resource: "patients",
        proposed_values: { full_name: "Ana Ruiz", phone: "5512345678" },
        current_values: { full_name: "Ana", birth_date: "1990-01-01" },
        status: "accepted",
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const diff = result.plan.entries[0].diff;
  assert.ok(diff.some((d) => d.field === "phone" && d.change === "added"));
  assert.ok(diff.some((d) => d.field === "full_name" && d.change === "changed"));
  // birth_date está en el expediente pero NO en la propuesta: no se toca (la ausencia no es negativo).
  assert.ok(!diff.some((d) => d.field === "birth_date"));
});

// --- summarize / applyDecision (lógica del panel) ---

test("summarize: cuenta por disposición", () => {
  const entries = [
    { disposition: "save_draft" as const },
    { disposition: "save_draft" as const },
    { disposition: "pending" as const },
    { disposition: "blocked" as const },
  ];
  assert.deepEqual(summarize(entries), { save_draft: 2, pending: 1, discarded: 0, blocked: 1 });
});

test("applyDecision: el médico rechaza una aceptada -> discarded sin diff", () => {
  const entry: CloseOutEntry = {
    id: "a1", type: "create_patient", label: "Alta", target_resource: "patients",
    category: "clinical", disposition: "save_draft", reason: null,
    values: { full_name: "Ana" }, dropped_fields: [], diff: [{ field: "full_name", before: undefined, after: "Ana", change: "added" }],
  };
  const next = applyDecision(entry, "discarded");
  assert.equal(next.disposition, "discarded");
  assert.deepEqual(next.diff, []);
});

test("applyDecision: editar en el panel recomputa valores y diff; bloqueada no cambia", () => {
  const entry: CloseOutEntry = {
    id: "a1", type: "create_patient", label: "Alta", target_resource: "patients",
    category: "clinical", disposition: "pending", reason: null,
    values: { full_name: "Ana" }, dropped_fields: [], diff: [],
    current_values: { full_name: "Ana" },
  };
  const edited = applyDecision(entry, "save_draft", { full_name: "Ana Ruiz" });
  assert.equal(edited.values.full_name, "Ana Ruiz");
  assert.ok(edited.diff.some((d) => d.field === "full_name" && d.change === "changed"));

  const blocked: CloseOutEntry = { ...entry, disposition: "blocked", reason: "sin permiso" };
  assert.deepEqual(applyDecision(blocked, "save_draft"), blocked); // no se puede forzar
});

// --- Mensaje de cierre: NADA en lote; procede por acción vía P1 ---

test("buildCloseOutSubmission: agrupa por disposición e instruye proceder por acción (P1)", () => {
  const result = buildCloseOutPlan(
    input([
      { id: "a1", type: "create_patient", label: "Alta de paciente", target_resource: "patients", proposed_values: { full_name: "Ana" }, status: "accepted" },
      { id: "a2", type: "create_consultation", label: "Consulta", target_resource: "consultations", status: "accepted" },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const message = buildCloseOutSubmission("Cierre revisado:", result.plan.entries);
  assert.match(message, /Cierre revisado:/);
  assert.match(message, /Guardar como borrador \(1\)/);
  assert.match(message, /Alta de paciente/);
  assert.match(message, /Bloqueadas \(1\)/); // la consulta sin permiso
  assert.match(message, /acción por acción/);
  assert.match(message, /aprobación \(P1\)/);
  assert.match(message, /No guardes nada en lote/);
});

// --- Tool: lectura, no aprobación, no escribe; valida y produce el spec del panel ---

test("ui.review_detected_actions: es lectura, sin aprobación, y NO llama a ninguna escritura", async () => {
  const tool = getTool("ui.review_detected_actions");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);

  const calls: string[] = [];
  const ctx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") {
        return [
          { name: "patients", forms: { create: { fields: [{ name: "full_name" }] } } },
        ];
      }
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    tool,
    { actions: [{ id: "a1", type: "create_patient", target_resource: "patients", proposed_values: { full_name: "Ana" }, status: "accepted" }] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const spec = result.content as { kind: string };
  assert.equal(spec.kind, "detected_actions");
  assert.ok(isUiSpec(spec)); // se renderiza por GeneratedUi (gate ui.* + isUiSpec)
  // Sólo se consultó el catálogo (lectura); ninguna escritura (POST/PATCH/DELETE).
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});

test("ui.review_detected_actions: entrada inválida -> error 'invalid_detected_actions'", async () => {
  const tool = getTool("ui.review_detected_actions");
  if (!tool) throw new Error("falta ui.review_detected_actions");
  const ctx: ToolExecutionContext = {
    api: (async () => []) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  const result = await executeTool(tool, { actions: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_detected_actions");
});

test("ui.review_detected_actions: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.review_detected_actions", { actions: [] });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("revisar acciones detectadas cierre de la consulta", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.review_detected_actions"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "ui.review_detected_actions",
  );
  assert.notEqual(entry?.status, "gated_out");
});
