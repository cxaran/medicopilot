import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPromotionProposal,
  buildPromotionSubmission,
  FREQUENT_REUSE_THRESHOLD,
  type PromotionContext,
} from "./template-promotion.ts";
import { validateDynamicForm, type DynamicFormSpec } from "./dynamic-form.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import { isUiSpec } from "./ui-spec.ts";

// PROMOCIÓN DINÁMICA→PLANTILLA (MP-CTRL-0132, sección 13). Se prueba que califica por criterios
// estructurales (regulados / recetas-órdenes / legal) o por señal explícita del caller (reuso/
// multiespecialidad/institucional), que NO califica una UI puntual trivial, que NUNCA registra nada
// (la tool es read-only y sólo consulta el catálogo), y que la salida pasa el renderizador (isUiSpec).
// El sistema NO persiste frecuencia de reuso: la ausencia de señal no cuenta como cumplimiento.

// Helper: valida una spec dinámica cruda con la lista blanca 0117 (como hace la tool) y la devuelve.
function dyn(spec: Record<string, unknown>): DynamicFormSpec {
  const result = validateDynamicForm(spec);
  if (!result.ok) throw new Error(`spec inválida en el test: ${result.error}`);
  return result.spec;
}

// UI con campos REGULADOS (medicamento/dosis) → criterio fuerte estructural.
const REGULATED_SPEC = dyn({
  title: "Solicitud excepcional de medicamento",
  widgets: [
    { type: "text", name: "medicamento", label: "Medicamento solicitado", required: true },
    { type: "number", name: "dosis", label: "Dosis (mg)", min: 0 },
    { type: "textarea", name: "justificacion", label: "Justificación clínica" },
  ],
});

// UI puntual TRIVIAL: elegir qué problema atender hoy. Sin regulados/órdenes/legal/señal.
const TRIVIAL_SPEC = dyn({
  title: "Priorizar problema de hoy",
  widgets: [
    {
      type: "radio",
      name: "foco",
      label: "¿Qué atendemos primero?",
      options: [
        { value: "a", label: "Control de presión" },
        { value: "b", label: "Dolor de rodilla" },
      ],
    },
  ],
});

// --- Califica por criterios estructurales ---

test("buildPromotionProposal: UI con campos regulados CALIFICA (criterio estructural)", () => {
  const result = buildPromotionProposal(REGULATED_SPEC, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const p = result.proposal;
  assert.equal(p.qualifies, true);
  assert.ok(p.matched_criteria.some((c) => c.key === "regulated_fields"));
  assert.ok(p.suggested_template_shape);
  // El nombre de recurso se deriva del título en snake_case.
  assert.equal(p.suggested_template_shape?.suggested_resource_name, "solicitud_excepcional_de_medicamento");
  // El campo 'medicamento' se marca regulado; 'dosis' es número.
  const fields = p.suggested_template_shape?.fields ?? [];
  assert.ok(fields.find((f) => f.name === "medicamento")?.regulated);
  assert.equal(fields.find((f) => f.name === "dosis")?.suggested_type, "number");
});

test("buildPromotionProposal: UI que involucra órdenes/diagnósticos CALIFICA", () => {
  const spec = dyn({
    title: "Captura de estudio de laboratorio",
    widgets: [{ type: "text", name: "estudio", label: "Estudio de laboratorio a ordenar", required: true }],
  });
  const result = buildPromotionProposal(spec, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, true);
  assert.ok(result.proposal.matched_criteria.some((c) => c.key === "involves_clinical_orders"));
});

// --- Califica por señal EXPLÍCITA del caller ---

test("buildPromotionProposal: reuso frecuente aportado por el caller CALIFICA", () => {
  const result = buildPromotionProposal(TRIVIAL_SPEC, {
    signals: { reuse_count: FREQUENT_REUSE_THRESHOLD },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, true);
  assert.ok(result.proposal.matched_criteria.some((c) => c.key === "frequent_reuse"));
});

test("buildPromotionProposal: multiespecialidad/institucional aportados CALIFICAN", () => {
  const a = buildPromotionProposal(TRIVIAL_SPEC, { signals: { multi_specialty: true } });
  assert.equal(a.ok && a.proposal.qualifies, true);
  const b = buildPromotionProposal(TRIVIAL_SPEC, { signals: { institutional: true } });
  assert.equal(b.ok && b.proposal.qualifies, true);
});

// --- NO califica una UI puntual trivial; ausencia de señal ≠ cumplimiento ---

test("buildPromotionProposal: UI puntual trivial NO califica (ausencia de señal no cuenta)", () => {
  const result = buildPromotionProposal(TRIVIAL_SPEC, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, false);
  assert.equal(result.proposal.matched_criteria.length, 0);
  assert.equal(result.proposal.suggested_template_shape, undefined);
  assert.ok((result.proposal.reasons ?? []).length > 0);
});

test("buildPromotionProposal: reuso por DEBAJO del umbral NO califica por frecuencia", () => {
  const result = buildPromotionProposal(TRIVIAL_SPEC, {
    signals: { reuse_count: FREQUENT_REUSE_THRESHOLD - 1 },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, false);
});

test("buildPromotionProposal: validaciones/estructura SOLAS son apoyo, no califican", () => {
  // 4+ campos obligatorios/opciones pero ningún criterio fuerte → apoyo, no califica.
  const spec = dyn({
    title: "Cuestionario de hábitos",
    widgets: [
      { type: "text", name: "a", label: "Hábito A", required: true },
      { type: "text", name: "b", label: "Hábito B", required: true },
      { type: "text", name: "c", label: "Hábito C", required: true },
      { type: "text", name: "d", label: "Hábito D", required: true },
    ],
  });
  const result = buildPromotionProposal(spec, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, false);
  assert.ok(result.proposal.supporting_criteria.some((c) => c.key === "requires_validations"));
  assert.ok(result.proposal.supporting_criteria.some((c) => c.key === "must_persist_structured"));
});

// --- Colisión de nombre con un recurso existente ---

test("buildPromotionProposal: marca name_collision si el recurso ya existe", () => {
  const ctx: PromotionContext = { knownResources: new Set(["solicitud_excepcional_de_medicamento"]) };
  const result = buildPromotionProposal(REGULATED_SPEC, ctx);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.suggested_template_shape?.name_collision, true);
});

// --- decision_list no mapea a campo persistible: se anota ---

test("buildPromotionProposal: decision_list genera una nota (no es campo persistible)", () => {
  const spec = dyn({
    title: "Receta: elegir fármacos",
    widgets: [
      {
        type: "decision_list",
        name: "farmacos",
        items: [
          { value: "x", text: "Paracetamol" },
          { value: "y", text: "Ibuprofeno" },
        ],
      },
    ],
  });
  const result = buildPromotionProposal(spec, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposal.qualifies, true); // 'receta'/'farmac' → regulado + órdenes
  assert.ok((result.proposal.suggested_template_shape?.notes ?? []).some((n) => /decision_list/.test(n)));
});

// --- Mensaje de seguimiento: NUNCA registra; deja claro que es cambio de código ---

test("buildPromotionSubmission: deja explícito que NO se registra solo (cambio de código)", () => {
  const result = buildPromotionProposal(REGULATED_SPEC, {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const message = buildPromotionSubmission("Propuesta:", result.proposal);
  assert.match(message, /Propuesta:/);
  assert.match(message, /promover esta UI dinámica/i);
  assert.match(message, /cambio de código/i);
  assert.match(message, /NO se registra de forma automática/i);
});

// --- Tool: lectura, no aprobación, no muta; valida la spec y produce el panel ---

test("ui.propose_template_promotion: es lectura, sin aprobación, y NO muta (sólo consulta catálogo)", async () => {
  const tool = getTool("ui.propose_template_promotion");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);

  const calls: string[] = [];
  const ctx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") return [{ name: "patients" }];
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    tool,
    {
      spec: {
        title: "Solicitud excepcional de medicamento",
        widgets: [{ type: "text", name: "medicamento", label: "Medicamento", required: true }],
      },
    },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const spec = result.content as { kind: string; proposal: { qualifies: boolean } };
  assert.equal(spec.kind, "template_promotion_proposal");
  assert.ok(isUiSpec(spec));
  assert.equal(spec.proposal.qualifies, true);
  // Sólo se consultó el catálogo (lectura); ninguna escritura/registro.
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});

test("ui.propose_template_promotion: spec dinámica inválida (HTML) -> error 'invalid_ui_spec'", async () => {
  const tool = getTool("ui.propose_template_promotion");
  if (!tool) throw new Error("falta ui.propose_template_promotion");
  const ctx: ToolExecutionContext = {
    api: (async () => []) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  // Un label con HTML lo rechaza la lista blanca 0117 ANTES de evaluar promoción.
  const result = await executeTool(
    tool,
    { spec: { widgets: [{ type: "text", name: "x", label: "<script>alert(1)</script>" }] } },
    ctx,
  );
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_ui_spec");
});

test("ui.propose_template_promotion: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.propose_template_promotion", {
    spec: { widgets: [{ type: "text", name: "x", label: "X" }] },
  });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("convertir UI dinámica en plantilla registrada promoción", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.propose_template_promotion"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "ui.propose_template_promotion",
  );
  assert.notEqual(entry?.status, "gated_out");
});
