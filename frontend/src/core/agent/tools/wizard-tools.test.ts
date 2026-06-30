import test from "node:test";
import assert from "node:assert/strict";

import { reviewContextFromCatalog, type CatalogResourceLike } from "./detected-actions.ts";
import { buildWizardPlan, buildWizardSubmission } from "./wizard.ts";
import { getTool, type ToolDefinition, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";
import { isUiSpec } from "./ui-spec.ts";

// ASISTENTE MULTI-PASO GUIADO (MP-CTRL-0139). Módulo PURO: ordena pasos heterogéneos, valida cada uno
// contra el catálogo + RBAC, respeta dependencias entre entidades y resuelve el PASO ACTUAL. NADA
// escribe; el agente avanza un paso a la vez por la aprobación P1.

// Catálogo proyectado por permiso: puede crear pacientes (full_name requerido) y consultas, pero NO
// recetas (forms.create null = legible sin permiso de crear).
const CATALOG: CatalogResourceLike[] = [
  { name: "patients", forms: { create: { fields: [{ name: "full_name", required: true }] } } },
  { name: "consultations", forms: { create: { fields: [{ name: "reason_for_visit", required: false }] } } },
  { name: "prescriptions", forms: { create: null } },
];
const ctx = reviewContextFromCatalog(CATALOG);

test("buildWizardPlan: paso actual = primer pendiente con dependencias hechas; bloqueo RBAC con motivo", () => {
  const result = buildWizardPlan(
    {
      patient_id: "p1",
      steps: [
        { id: "s1", title: "Registrar paciente", type: "create_patient", target_resource: "patients", status: "done" },
        {
          id: "s2",
          title: "Abrir consulta",
          type: "create_consultation",
          target_resource: "consultations",
          depends_on: ["s1"],
          proposed_values: { reason_for_visit: "dolor de garganta" },
        },
        { id: "s3", title: "Emitir receta", type: "create_prescription", target_resource: "prescriptions" },
      ],
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const { plan } = result;
  const byId = (id: string) => plan.steps.find((s) => s.id === id);
  assert.equal(byId("s1")?.state, "done");
  assert.equal(byId("s2")?.state, "current"); // paciente hecho → dependencias cumplidas
  assert.equal(byId("s3")?.state, "blocked"); // sin permiso para crear recetas
  assert.match(byId("s3")?.reason ?? "", /permiso para crear/);
  assert.equal(plan.current_step_id, "s2");
  assert.deepEqual(plan.summary, { total: 3, done: 1, pending: 1, blocked: 1 });
});

test("buildWizardPlan: dependencia no cumplida → no es el paso actual (queda a la espera)", () => {
  const result = buildWizardPlan(
    {
      steps: [
        { id: "s1", title: "Registrar paciente", target_resource: "patients", proposed_values: { full_name: "Juan" } },
        { id: "s2", title: "Abrir consulta", target_resource: "consultations", depends_on: ["s1"] },
      ],
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const { plan } = result;
  assert.equal(plan.current_step_id, "s1"); // s1 pendiente sin deps → actual
  const s2 = plan.steps.find((s) => s.id === "s2");
  assert.equal(s2?.state, "pending");
  assert.deepEqual(s2?.blocked_by, ["s1"]); // espera a que s1 se complete
});

test("buildWizardPlan: marca requeridos faltantes y descarta campos fuera del esquema", () => {
  const result = buildWizardPlan(
    {
      steps: [
        {
          id: "s1",
          title: "Registrar paciente",
          target_resource: "patients",
          proposed_values: { inventado: "x" }, // sin full_name (requerido) y con campo ajeno
        },
      ],
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const s1 = result.plan.steps[0];
  assert.ok(s1.missing_required.includes("full_name"));
  assert.ok(s1.dropped_fields.includes("inventado"));
  assert.ok(!("inventado" in s1.values));
});

test("buildWizardPlan: open_template sin id → bloqueado con motivo", () => {
  const result = buildWizardPlan(
    { steps: [{ id: "s1", type: "open_template:", target_resource: "patients" }] },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.plan.steps[0].state, "blocked");
  assert.match(result.plan.steps[0].reason ?? "", /id de la plantilla/);
});

test("buildWizardPlan: validaciones (vacío, id duplicado, dependencia inexistente, sin recurso)", () => {
  assert.ok(!buildWizardPlan({ steps: [] }, ctx).ok);
  assert.ok(
    !buildWizardPlan(
      { steps: [{ id: "s1", target_resource: "patients" }, { id: "s1", target_resource: "consultations" }] },
      ctx,
    ).ok,
  );
  assert.ok(
    !buildWizardPlan(
      { steps: [{ id: "s1", target_resource: "patients", depends_on: ["nope"] }] },
      ctx,
    ).ok,
  );
  assert.ok(!buildWizardPlan({ steps: [{ id: "s1", target_resource: "" }] }, ctx).ok);
});

test("buildWizardSubmission: nombra el paso actual y exige avanzar uno a uno por P1", () => {
  const result = buildWizardPlan(
    {
      steps: [
        { id: "s1", title: "Registrar paciente", target_resource: "patients", status: "done" },
        { id: "s2", title: "Abrir consulta", target_resource: "consultations", depends_on: ["s1"] },
      ],
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const msg = buildWizardSubmission("Asistente:", result.plan);
  assert.match(msg, /Abrir consulta/);
  assert.match(msg, /paso actual/);
  assert.match(msg, /aprobación \(P1\)/);
  assert.match(msg, /no ejecutes pasos en lote/);
});

test("ui.review_wizard: tool de LECTURA que produce un wizard reconocido por el renderizador", async () => {
  const found = getTool("ui.review_wizard");
  assert.ok(found, "falta la tool ui.review_wizard");
  if (!found) return;
  assert.equal(found.kind, "read");
  assert.equal(found.approval, undefined, "una tool ui.* no debe declarar aprobación");

  const calls: string[] = [];
  const toolCtx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") return CATALOG;
      throw new Error(`llamada inesperada: ${init?.method ?? "GET"} ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    found as ToolDefinition,
    {
      steps: [
        { id: "s1", title: "Registrar paciente", target_resource: "patients", proposed_values: { full_name: "Juan" } },
        { id: "s2", title: "Abrir consulta", target_resource: "consultations", depends_on: ["s1"] },
      ],
    },
    toolCtx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(isUiSpec(result.content));
  assert.equal((result.content as { kind: string }).kind, "wizard");
  assert.deepEqual(calls, ["GET /api/v1/resources"]); // solo lectura
});
