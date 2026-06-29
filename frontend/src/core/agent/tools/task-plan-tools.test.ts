import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTaskDecision,
  buildTaskPlan,
  buildTaskPlanSubmission,
  defaultDecision,
  dispositionForConfidence,
  reviewContextFromCatalog,
  summarizeTasks,
  TASK_RESOURCE,
  type ReviewContext,
  type TaskPlanEntry,
  type TaskPlanInput,
} from "./task-plan.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import { isUiSpec } from "./ui-spec.ts";

// PLAN DE TAREAS revisable (MP-CTRL-0129): hermano orientado a tareas del cierre 0120 con el reparto
// por confianza del 0118. Se prueba el reparto determinista (lista/sugerida/descartada), el bloqueo
// por RBAC/recurso con motivo (no descarta en silencio), el descarte de campos fuera del esquema, la
// marca de requeridos que faltan (ausencia ≠ negativo), y que NADA se persiste: al confirmar se
// instruye crear TAREA POR TAREA por la aprobación P1. La extracción que produce las tareas es del
// agente (fuera de alcance): aquí entra un conjunto hecho a mano.

// clinical_tasks creable, con title requerido (como el create_schema real); un recurso desconocido
// ausente; un recurso legible sin permiso de crear (forms.create null).
const CTX: ReviewContext = reviewContextFromCatalog([
  {
    name: "clinical_tasks",
    forms: {
      create: {
        fields: [
          { name: "title", required: true },
          { name: "description", required: false },
          { name: "due_at", required: false },
          { name: "priority", required: false },
          { name: "patient_id", required: false },
          { name: "status", required: false },
        ],
      },
    },
  },
  { name: "appointments", forms: { create: null } },
]);

function input(tasks: TaskPlanInput["tasks"]): TaskPlanInput {
  return { patient_id: "p1", tasks };
}

// --- Reparto determinista por confianza (idéntico al 0118) ---

test("dispositionForConfidence: umbrales 0.8 / 0.5 (lista / sugerida / descartada)", () => {
  assert.equal(dispositionForConfidence(0.9), "ready");
  assert.equal(dispositionForConfidence(0.8), "ready");
  assert.equal(dispositionForConfidence(0.7), "suggested");
  assert.equal(dispositionForConfidence(0.5), "suggested");
  assert.equal(dispositionForConfidence(0.4), "discarded");
  // Ausente/NaN: a confirmar (ni listo ni descartado).
  assert.equal(dispositionForConfidence(null), "suggested");
});

test("buildTaskPlan: alta confianza -> lista; media -> sugerida; baja -> descartada", () => {
  const result = buildTaskPlan(
    input([
      { id: "t1", confidence: 0.9, proposed_values: { title: "Agendar control en 2 semanas" } },
      { id: "t2", confidence: 0.6, proposed_values: { title: "Solicitar laboratorios de seguimiento" } },
      { id: "t3", confidence: 0.2, proposed_values: { title: "Quizá llamar al paciente" } },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.resource, TASK_RESOURCE);
  assert.equal(result.plan.entries[0].disposition, "ready");
  assert.equal(result.plan.entries[1].disposition, "suggested");
  assert.equal(result.plan.entries[2].disposition, "discarded");
  assert.deepEqual(result.plan.summary, { ready: 1, suggested: 1, discarded: 1, blocked: 0 });
});

// --- Validación contra catálogo + RBAC: bloquea con motivo, NO descarta en silencio ---

test("buildTaskPlan: recurso sin permiso de crear -> BLOQUEADA con motivo", () => {
  const result = buildTaskPlan(
    input([{ id: "t1", confidence: 0.95, target_resource: "appointments", proposed_values: { reason: "x" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.equal(entry.disposition, "blocked");
  assert.match(entry.reason ?? "", /permiso para crear/);
  assert.match(entry.reason ?? "", /appointments/);
  assert.equal(result.plan.summary.ready, 0); // no se crea pese a la alta confianza
});

test("buildTaskPlan: recurso desconocido -> BLOQUEADA nombrándolo", () => {
  const result = buildTaskPlan(
    input([{ id: "t1", confidence: 0.95, target_resource: "foo", proposed_values: { title: "x" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.entries[0].disposition, "blocked");
  assert.match(result.plan.entries[0].reason ?? "", /desconocido/);
});

// --- Campos fuera del esquema: se descartan, no se inventan ---

test("buildTaskPlan: campo ajeno al esquema -> dropped_fields (no se inventa)", () => {
  const result = buildTaskPlan(
    input([
      {
        id: "t1",
        confidence: 0.9,
        proposed_values: { title: "Llamar al paciente", campo_inventado: "x" },
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.ok(entry.dropped_fields.includes("campo_inventado"));
  assert.equal(entry.values.campo_inventado, undefined);
  assert.equal(entry.values.title, "Llamar al paciente");
});

// --- Campos requeridos que faltan: se marcan; ausencia != negativo ---

test("buildTaskPlan: requerido faltante se marca en missing_required (no se inventa)", () => {
  const result = buildTaskPlan(
    input([{ id: "t1", confidence: 0.9, proposed_values: { description: "sin título" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const entry = result.plan.entries[0];
  assert.ok(entry.missing_required.includes("title"));
  assert.equal(entry.values.title, undefined); // no se inventa
});

test("buildTaskPlan: con title presente no hay requeridos faltantes", () => {
  const result = buildTaskPlan(
    input([{ id: "t1", confidence: 0.9, proposed_values: { title: "Control en 2 semanas" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.entries[0].missing_required, []);
});

// --- label por defecto + validación de entrada ---

test("buildTaskPlan: label cae al title propuesto si no se da label", () => {
  const result = buildTaskPlan(
    input([{ id: "t1", confidence: 0.9, proposed_values: { title: "Agendar control" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.entries[0].label, "Agendar control");
});

test("buildTaskPlan: tasks vacío / duplicado / confidence no numérico -> error", () => {
  assert.equal(buildTaskPlan(input([]), CTX).ok, false);
  assert.equal(
    buildTaskPlan(input([{ id: "t1" }, { id: "t1" }]), CTX).ok,
    false,
  );
  const bad = buildTaskPlan(
    input([{ id: "t1", confidence: "alta" as unknown as number }]),
    CTX,
  );
  assert.equal(bad.ok, false);
});

// --- summarize / applyTaskDecision / defaultDecision (lógica del panel) ---

test("summarizeTasks: cuenta por disposición", () => {
  assert.deepEqual(
    summarizeTasks([
      { disposition: "ready" },
      { disposition: "ready" },
      { disposition: "suggested" },
      { disposition: "blocked" },
    ]),
    { ready: 2, suggested: 1, discarded: 0, blocked: 1 },
  );
});

test("defaultDecision: lista->aceptar, sugerida->posponer, descartada/bloqueada->rechazar", () => {
  assert.equal(defaultDecision("ready"), "accept");
  assert.equal(defaultDecision("suggested"), "later");
  assert.equal(defaultDecision("discarded"), "reject");
  assert.equal(defaultDecision("blocked"), "reject");
});

test("applyTaskDecision: el médico acepta una sugerida -> ready; bloqueada no cambia", () => {
  const entry: TaskPlanEntry = {
    id: "t1", label: "Control", target_resource: TASK_RESOURCE, confidence: 0.6,
    disposition: "suggested", reason: null, values: { title: "Control" },
    dropped_fields: [], missing_required: [],
  };
  const accepted = applyTaskDecision(entry, "accept");
  assert.equal(accepted.disposition, "ready");

  const edited = applyTaskDecision(entry, "accept", { title: "Control en 2 semanas" });
  assert.equal(edited.values.title, "Control en 2 semanas");

  const blocked: TaskPlanEntry = { ...entry, disposition: "blocked", reason: "sin permiso" };
  assert.deepEqual(applyTaskDecision(blocked, "accept"), blocked); // no se puede forzar
});

// --- Mensaje del plan: NADA en lote; crea tarea por tarea vía P1 ---

test("buildTaskPlanSubmission: agrupa por disposición e instruye crear tarea por tarea (P1)", () => {
  const result = buildTaskPlan(
    input([
      { id: "t1", confidence: 0.9, label: "Agendar control", proposed_values: { title: "Agendar control" } },
      { id: "t2", confidence: 0.6, label: "Pedir laboratorios", proposed_values: { title: "Pedir laboratorios" } },
      { id: "t3", confidence: 0.95, label: "Cita externa", target_resource: "appointments", proposed_values: { reason: "x" } },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const message = buildTaskPlanSubmission("Plan revisado:", result.plan.entries);
  assert.match(message, /Plan revisado:/);
  assert.match(message, /Crear como borrador \(1\)/);
  assert.match(message, /Agendar control/);
  assert.match(message, /Sugeridas.*\(1\)/);
  assert.match(message, /Bloqueadas \(1\)/); // la cita sin permiso
  assert.match(message, /clinical\.create_task_draft/);
  assert.match(message, /aprobación \(P1\)/);
  assert.match(message, /No crees nada en lote/);
});

// --- Tool: lectura, no aprobación, no escribe; valida y produce el spec del panel ---

test("ui.review_task_plan: es lectura, sin aprobación, y NO llama a ninguna escritura", async () => {
  const tool = getTool("ui.review_task_plan");
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
          { name: "clinical_tasks", forms: { create: { fields: [{ name: "title", required: true }] } } },
        ];
      }
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    tool,
    { tasks: [{ id: "t1", confidence: 0.9, proposed_values: { title: "Agendar control" } }] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const spec = result.content as { kind: string };
  assert.equal(spec.kind, "task_plan");
  assert.ok(isUiSpec(spec)); // se renderiza por GeneratedUi (gate ui.* + isUiSpec)
  // Sólo se consultó el catálogo (lectura); ninguna escritura (POST/PATCH/DELETE).
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});

test("ui.review_task_plan: entrada inválida -> error 'invalid_task_plan'", async () => {
  const tool = getTool("ui.review_task_plan");
  if (!tool) throw new Error("falta ui.review_task_plan");
  const ctx: ToolExecutionContext = {
    api: (async () => []) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  const result = await executeTool(tool, { tasks: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_task_plan");
});

test("ui.review_task_plan: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.review_task_plan", { tasks: [] });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("revisar plan de tareas de seguimiento agendar control", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.review_task_plan"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "ui.review_task_plan",
  );
  assert.notEqual(entry?.status, "gated_out");
});
