import test from "node:test";
import assert from "node:assert/strict";

import { getTool, type ToolDefinition, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";
import { isUiSpec } from "./ui-spec.ts";

// QA DE INTEGRACIÓN del flujo agente-UI (MP-CTRL-0134). Los tests por rebanada cubren cada unidad por
// separado; ESTE prueba que las piezas COMPONEN como una sola tubería post-consulta bajo UN MISMO
// contexto de contrato + RBAC: acciones detectadas (0120) → plan de tareas (0129) → checklist de
// cierre (0131) → propuesta de promoción a plantilla (0132). Verifica que a lo largo de TODA la
// cadena se sostienen los invariantes: reparto determinista por confianza, gating RBAC con motivo,
// P1 (NADA se guarda: ninguna escritura en toda la tubería), descarte de campos fuera de esquema y
// "ausencia ≠ negativo". La extracción→prefill (0118) reparte la confianza en el SERVIDOR (fuera del
// alcance del frontend), así que la cadena del frontend arranca donde la plataforma gobierna.
//
// Reusa las tools REALES (executeTool) — sin renderizador paralelo, sin fixtures nuevas: un solo
// catálogo /api/v1/resources proyectado por permiso, compartido por todos los pasos, prueba que el
// RBAC es CONSISTENTE de punta a punta.

// Catálogo compartido (RBAC proyectado): el actor puede crear tareas, notas y pacientes, pero NO
// recetas (prescriptions: forms.create null = legible sin permiso de crear). clinical_tasks declara
// 'title' como requerido (como el create_schema real).
const SHARED_CATALOG = [
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
        ],
      },
    },
  },
  { name: "clinical_notes", forms: { create: { fields: [{ name: "content", required: true }] } } },
  // patients: creable Y editable (forms.update presente) → habilita la comparación de actualización (0137).
  {
    name: "patients",
    forms: {
      create: { fields: [{ name: "full_name", required: true }] },
      update: { fields: [{ name: "full_name" }, { name: "birth_date" }] },
    },
  },
  { name: "prescriptions", forms: { create: null } },
];

// Contexto compartido por TODA la cadena: registra cada llamada a la API para probar que ningún paso
// escribe (P1). Cualquier verbo distinto de GET /api/v1/resources sería una violación.
function makeSharedCtx(): { ctx: ToolExecutionContext; calls: string[] } {
  const calls: string[] = [];
  const ctx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") return SHARED_CATALOG;
      throw new Error(`llamada inesperada en la tubería: ${init?.method ?? "GET"} ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  return { ctx, calls };
}

function tool(name: string): ToolDefinition {
  const found = getTool(name);
  if (!found) throw new Error(`falta la tool ${name}`);
  return found;
}

test("pipeline agente-UI: las 4 piezas componen bajo un mismo RBAC y NADA escribe (P1)", async () => {
  const { ctx, calls } = makeSharedCtx();

  // Las 4 tools de revisión/propuesta son de LECTURA y sin metadata de aprobación: ninguna es una
  // escritura por sí misma (las escrituras reales van por las tools clinical.create_* con P1).
  for (const name of [
    "ui.review_detected_actions",
    "ui.review_task_plan",
    "ui.review_close_checklist",
    "ui.propose_template_promotion",
  ]) {
    const t = tool(name);
    assert.equal(t.kind, "read", `${name} debe ser de lectura`);
    assert.equal(t.approval, undefined, `${name} no debe declarar aprobación`);
  }

  // 1) ACCIONES DETECTADAS (0120): una tarea aceptada (creable → save_draft) con un campo fuera de
  //    esquema (se descarta) y una receta aceptada (sin permiso → BLOQUEADA, no se guarda).
  const detected = await executeTool(
    tool("ui.review_detected_actions"),
    {
      patient_id: "p1",
      actions: [
        {
          id: "a1",
          type: "create_task",
          target_resource: "clinical_tasks",
          proposed_values: { title: "Agendar control", campo_inventado: "x" },
          status: "accepted",
        },
        {
          id: "a2",
          type: "create_prescription",
          target_resource: "prescriptions",
          status: "accepted",
        },
      ],
    },
    ctx,
  );
  assert.equal(detected.status, "success");
  if (detected.status !== "success") return;
  assert.ok(isUiSpec(detected.content));
  const dPlan = (detected.content as unknown as { plan: { entries: Array<{ id: string; disposition: string; dropped_fields: string[] }>; summary: Record<string, number> } }).plan;
  const dTask = dPlan.entries.find((e) => e.id === "a1");
  const dRx = dPlan.entries.find((e) => e.id === "a2");
  assert.equal(dTask?.disposition, "save_draft"); // creable + aceptada
  assert.ok(dTask?.dropped_fields.includes("campo_inventado")); // fuera de esquema → descartado
  assert.equal(dRx?.disposition, "blocked"); // sin permiso de crear receta → bloqueada con motivo
  assert.equal(dPlan.summary.save_draft, 1);
  assert.equal(dPlan.summary.blocked, 1);

  // 2) PLAN DE TAREAS (0129): reparto por confianza 0.8/0.5 + bloqueo RBAC (recurso sin permiso).
  const taskPlan = await executeTool(
    tool("ui.review_task_plan"),
    {
      tasks: [
        { id: "t1", confidence: 0.9, proposed_values: { title: "Control en 2 semanas" } },
        { id: "t2", confidence: 0.6, proposed_values: { title: "Laboratorios de seguimiento" } },
        { id: "t3", confidence: 0.3, proposed_values: { title: "Quizá llamar" } },
        { id: "t4", confidence: 0.95, target_resource: "prescriptions", proposed_values: { x: 1 } },
      ],
    },
    ctx,
  );
  assert.equal(taskPlan.status, "success");
  if (taskPlan.status !== "success") return;
  assert.ok(isUiSpec(taskPlan.content));
  const tEntries = (taskPlan.content as unknown as { plan: { entries: Array<{ id: string; disposition: string }> } }).plan.entries;
  assert.equal(tEntries.find((e) => e.id === "t1")?.disposition, "ready"); // >= 0.8
  assert.equal(tEntries.find((e) => e.id === "t2")?.disposition, "suggested"); // >= 0.5
  assert.equal(tEntries.find((e) => e.id === "t3")?.disposition, "discarded"); // < 0.5
  assert.equal(tEntries.find((e) => e.id === "t4")?.disposition, "blocked"); // RBAC: prescriptions

  // 3) CHECKLIST DE CIERRE (0131): estado determinista (sin asumir 'hecho'), RBAC por recurso,
  //    "listo para cerrar" sólo si no quedan requeridos pendientes; el resumen de acciones del paso 1
  //    se consolida aquí (continuidad de la tubería).
  const checklist = await executeTool(
    tool("ui.review_close_checklist"),
    {
      consultation_id: "c1",
      actions_summary: { saved: dPlan.summary.save_draft, pending: 0, discarded: 0, blocked: dPlan.summary.blocked },
      items: [
        { id: "i1", label: "Firmar la nota", requirement: "required", related_resource: "clinical_notes" },
        { id: "i2", label: "Registrar en recurso inexistente", related_resource: "foo" },
        { id: "i3", label: "Agendar control", status: "done", requirement: "recommended" },
      ],
    },
    ctx,
  );
  assert.equal(checklist.status, "success");
  if (checklist.status !== "success") return;
  assert.ok(isUiSpec(checklist.content));
  const cl = (checklist.content as unknown as { checklist: { entries: Array<{ id: string; status: string; reason: string | null }>; ready_to_close: boolean; actions_summary?: { saved: number } } }).checklist;
  assert.equal(cl.entries.find((e) => e.id === "i1")?.status, "pending"); // requerido sin marcar → pendiente (no se asume hecho)
  assert.equal(cl.entries.find((e) => e.id === "i2")?.status, "blocked"); // recurso fuera del contrato → bloqueado
  assert.ok(cl.entries.find((e) => e.id === "i2")?.reason); // con motivo
  assert.equal(cl.ready_to_close, false); // hay un requerido pendiente
  assert.equal(cl.actions_summary?.saved, 1); // resumen consolidado del paso 1

  // 4) PROMOCIÓN DINÁMICA→PLANTILLA (0132): una UI dinámica con campos regulados CALIFICA; es sólo
  //    propuesta, jamás registra (no muta nada).
  const promotion = await executeTool(
    tool("ui.propose_template_promotion"),
    {
      spec: {
        title: "Solicitud excepcional de medicamento",
        widgets: [
          { type: "text", name: "medicamento", label: "Medicamento", required: true },
          { type: "number", name: "dosis", label: "Dosis (mg)", min: 0 },
        ],
      },
    },
    ctx,
  );
  assert.equal(promotion.status, "success");
  if (promotion.status !== "success") return;
  assert.ok(isUiSpec(promotion.content));
  const proposal = (promotion.content as unknown as { proposal: { qualifies: boolean; suggested_template_shape?: { fields: Array<{ name: string; regulated: boolean }> } } }).proposal;
  assert.equal(proposal.qualifies, true);
  assert.ok(proposal.suggested_template_shape?.fields.find((f) => f.name === "medicamento")?.regulated);

  // INVARIANTE P1 DE PUNTA A PUNTA: en TODA la tubería sólo se consultó el catálogo (lectura);
  // ninguna escritura (POST/PATCH/DELETE). Las escrituras reales son tarea-por-tarea con P1, fuera
  // de estas tools de revisión.
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c === "GET /api/v1/resources"), `hubo una escritura en la tubería: ${calls.join(", ")}`);
});

test("pipeline agente-UI: todas las kinds de UiSpec generadas pasan el reconocedor del renderizador único", async () => {
  // Cada tool de UI produce una kind que GeneratedUi sabe pintar (isUiSpec en sincronía con el
  // switch del renderizador). Esto ancla que no haya una kind huérfana fuera del renderizador único.
  const { ctx } = makeSharedCtx();
  const cases: Array<{ name: string; args: Record<string, unknown>; kind: string }> = [
    { name: "ui.review_detected_actions", args: { actions: [{ id: "a1", type: "create_task", target_resource: "clinical_tasks", proposed_values: { title: "X" }, status: "accepted" }] }, kind: "detected_actions" },
    { name: "ui.review_task_plan", args: { tasks: [{ id: "t1", confidence: 0.9, proposed_values: { title: "X" } }] }, kind: "task_plan" },
    { name: "ui.review_close_checklist", args: { items: [{ id: "i1", label: "X" }] }, kind: "close_checklist" },
    { name: "ui.propose_template_promotion", args: { spec: { widgets: [{ type: "text", name: "x", label: "X" }] } }, kind: "template_promotion_proposal" },
    { name: "ui.review_record_update", args: { target_resource: "patients", resource_id: "p1", current_values: { full_name: "A" }, proposed_values: { full_name: "B" } }, kind: "record_update" },
    { name: "ui.open_record", args: { patient_id: "p1", patient_label: "Juan López" }, kind: "open_record" },
    { name: "ui.review_wizard", args: { steps: [{ id: "s1", title: "Registrar paciente", target_resource: "patients", proposed_values: { full_name: "Juan" } }] }, kind: "wizard" },
  ];
  for (const c of cases) {
    const result = await executeTool(tool(c.name), c.args, ctx);
    assert.equal(result.status, "success", `${c.name} falló`);
    if (result.status !== "success") continue;
    assert.ok(isUiSpec(result.content), `${c.name} no produjo una UiSpec válida`);
    assert.equal((result.content as { kind: string }).kind, c.kind);
  }
});
