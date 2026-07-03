import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFormSubmissionMessage,
  buttonActionToMessage,
  isUiSpec,
  parseChartSpec,
  parseFormSpec,
  parseResourceFormSpec,
  parseSuggestedRepliesSpec,
  isSafeButtonUrl,
} from "./ui-spec.ts";
import { getTool, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";

const ctx: ToolExecutionContext = {
  api: async () => {
    throw new Error("api no debe llamarse para tools de UI");
  },
  sandbox: async () => ({ ok: true, value: null, logs: [] }),
};

function uiTool(name: string) {
  const tool = getTool(name);
  if (!tool) throw new Error(`falta ${name}`);
  return tool;
}

test("parseFormSpec: normaliza campos y aplica defaults de submit", () => {
  const parsed = parseFormSpec({
    title: "Nueva nota",
    fields: [
      { name: "motivo", label: "Motivo", type: "text", required: true },
      { name: "sev", label: "Severidad", type: "select", options: [{ value: "alta" }] },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "form");
  assert.equal(parsed.spec.fields.length, 2);
  assert.equal(parsed.spec.submit_label, "Enviar");
  assert.equal(parsed.spec.submit_prompt, "Nueva nota");
  assert.deepEqual(parsed.spec.fields[1].options, [{ value: "alta", label: "alta" }]);
});

test("parseFormSpec: rechaza form sin campos", () => {
  const parsed = parseFormSpec({ fields: [] });
  assert.equal(parsed.ok, false);
});

test("parseResourceFormSpec: create con valores prellenados (sin exigir id)", () => {
  const parsed = parseResourceFormSpec({
    resource: "patients",
    mode: "create",
    values: { full_name: "Karen Magdalena Guzman Ferral", age: 30, active: true, bad: { x: 1 } },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "resource_form");
  assert.equal(parsed.spec.resource, "patients");
  assert.equal(parsed.spec.mode, "create");
  assert.equal(parsed.spec.values?.full_name, "Karen Magdalena Guzman Ferral");
  // Escalares se normalizan a string; estructuras se descartan (no se inventan).
  assert.equal(parsed.spec.values?.age, "30");
  assert.equal(parsed.spec.values?.active, "true");
  assert.equal(parsed.spec.values?.bad, undefined);
});

test("parseResourceFormSpec: update exige resource_id", () => {
  assert.equal(parseResourceFormSpec({ resource: "consultations", mode: "update" }).ok, false);
  const ok = parseResourceFormSpec({ resource: "consultations", mode: "update", resource_id: "abc" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.spec.resource_id, "abc");
});

test("parseResourceFormSpec: rechaza sin recurso o con modo inválido", () => {
  assert.equal(parseResourceFormSpec({ mode: "create" }).ok, false);
  assert.equal(parseResourceFormSpec({ resource: "patients", mode: "delete" }).ok, false);
});

test("isUiSpec reconoce resource_form", () => {
  assert.equal(isUiSpec({ kind: "resource_form", resource: "patients", mode: "create" }), true);
});

test("isSafeButtonUrl: lista blanca de contacto (WhatsApp/tel/mailto/sms), rechaza el resto", () => {
  assert.equal(isSafeButtonUrl("https://wa.me/5215551234567?text=Hola"), true);
  assert.equal(isSafeButtonUrl("https://api.whatsapp.com/send?phone=521555&text=Hola"), true);
  assert.equal(isSafeButtonUrl("tel:+525551234567"), true);
  assert.equal(isSafeButtonUrl("mailto:paciente@example.com"), true);
  // Rechazos: dominio arbitrario, http inseguro, esquemas peligrosos, basura.
  assert.equal(isSafeButtonUrl("https://evil.example.com"), false);
  assert.equal(isSafeButtonUrl("http://wa.me/123"), false);
  assert.equal(isSafeButtonUrl("javascript:alert(1)"), false);
  assert.equal(isSafeButtonUrl("data:text/html,x"), false);
  assert.equal(isSafeButtonUrl("no-es-url"), false);
});

test("parseFormSpec: conserva 'value' para prellenar el campo", () => {
  const parsed = parseFormSpec({
    title: "Nuevo paciente",
    fields: [
      { name: "full_name", label: "Nombre", type: "text", value: "Karen Magdalena Guzman Ferral" },
      { name: "phone", label: "Teléfono", type: "text" },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.fields[0].value, "Karen Magdalena Guzman Ferral");
  // Un campo sin 'value' no inventa uno.
  assert.equal(parsed.spec.fields[1].value, undefined);
});

test("parseFormSpec: select sin options es inválido", () => {
  const parsed = parseFormSpec({ fields: [{ name: "x", type: "select" }] });
  assert.equal(parsed.ok, false);
});

test("parseChartSpec: acepta barras con datos numéricos (serie única retrocompat)", () => {
  const parsed = parseChartSpec({ title: "T", data: [{ label: "Ene", value: 3 }] });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "chart");
  assert.equal(parsed.spec.chart_type, "bar");
  assert.equal(parsed.spec.data?.[0].value, 3);
});

test("parseChartSpec: rechaza value no numérico", () => {
  const parsed = parseChartSpec({ data: [{ label: "Ene", value: "x" }] });
  assert.equal(parsed.ok, false);
});

test("parseChartSpec: acepta líneas con unidad y rango de referencia", () => {
  const parsed = parseChartSpec({
    chart_type: "line",
    title: "Glucosa",
    unit: "mg/dL",
    reference_range: { low: 70, high: 100, label: "Normal" },
    data: [
      { label: "01-01", value: 95 },
      { label: "01-08", value: 180 },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.chart_type, "line");
  assert.equal(parsed.spec.unit, "mg/dL");
  assert.equal(parsed.spec.reference_range?.high, 100);
  assert.equal(parsed.spec.data?.length, 2);
});

test("parseChartSpec: acepta multi-serie (series manda sobre data)", () => {
  const parsed = parseChartSpec({
    chart_type: "line",
    unit: "mmHg",
    series: [
      { name: "Sistólica", data: [{ label: "L", value: 140 }, { label: "M", value: 135 }] },
      { name: "Diastólica", data: [{ label: "L", value: 90 }, { label: "M", value: 85 }] },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.series?.length, 2);
  assert.equal(parsed.spec.series?.[0].name, "Sistólica");
  assert.equal(parsed.spec.data, undefined);
});

test("parseChartSpec: rechaza chart_type desconocido", () => {
  assert.equal(parseChartSpec({ chart_type: "scatter", data: [{ label: "A", value: 1 }] }).ok, false);
});

test("parseChartSpec: rechaza reference_range invertido y vacío", () => {
  assert.equal(
    parseChartSpec({ data: [{ label: "A", value: 1 }], reference_range: { low: 100, high: 10 } }).ok,
    false,
  );
  assert.equal(
    parseChartSpec({ data: [{ label: "A", value: 1 }], reference_range: {} }).ok,
    false,
  );
});

test("parseChartSpec: rechaza más de 4 series", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ name: `S${i}`, data: [{ label: "A", value: i }] }));
  assert.equal(parseChartSpec({ chart_type: "line", series: many }).ok, false);
});

test("parseChartSpec: acepta pie, doughnut y area", () => {
  for (const chart_type of ["pie", "doughnut", "area"]) {
    const parsed = parseChartSpec({ chart_type, data: [{ label: "A", value: 3 }, { label: "B", value: 7 }] });
    assert.equal(parsed.ok, true, `esperaba ok para ${chart_type}`);
    if (parsed.ok) assert.equal(parsed.spec.chart_type, chart_type);
  }
});

test("parseChartSpec: gantt acepta tareas con fechas válidas", () => {
  const parsed = parseChartSpec({
    chart_type: "gantt",
    title: "Plan de cuidados",
    tasks: [
      { label: "Antibiótico", start: "2026-01-05", end: "2026-01-12", status: "done" },
      { label: "Control", start: "2026-01-12", end: "2026-01-20", status: "planned" },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.chart_type, "gantt");
  assert.equal(parsed.spec.tasks?.length, 2);
  assert.equal(parsed.spec.tasks?.[0].status, "done");
});

test("parseChartSpec: gantt rechaza fecha inválida, fin<inicio y estado desconocido", () => {
  assert.equal(
    parseChartSpec({ chart_type: "gantt", tasks: [{ label: "X", start: "no-fecha", end: "2026-01-10" }] }).ok,
    false,
  );
  assert.equal(
    parseChartSpec({ chart_type: "gantt", tasks: [{ label: "X", start: "2026-01-10", end: "2026-01-01" }] }).ok,
    false,
  );
  assert.equal(
    parseChartSpec({
      chart_type: "gantt",
      tasks: [{ label: "X", start: "2026-01-01", end: "2026-01-10", status: "urgente" }],
    }).ok,
    false,
  );
  assert.equal(parseChartSpec({ chart_type: "gantt", tasks: [] }).ok, false);
});

test("parseChartSpec: rechaza chart_type fuera del conjunto", () => {
  assert.equal(parseChartSpec({ chart_type: "radar", data: [{ label: "A", value: 1 }] }).ok, false);
});

test("buttonActionToMessage: traduce la acción configurada del botón", () => {
  assert.equal(buttonActionToMessage({ type: "message", prompt: "Hola" }), "Hola");
  assert.equal(
    buttonActionToMessage({ type: "tool", tool: "clinical.list_patients", args: { limit: 5 } }),
    'Usa la herramienta clinical.list_patients con argumentos {"limit":5}.',
  );
});

test("buildFormSubmissionMessage: arma el seguimiento con los valores", () => {
  const parsed = parseFormSpec({
    submit_prompt: "Registrar",
    fields: [{ name: "motivo", label: "Motivo", type: "text" }],
  });
  if (!parsed.ok) throw new Error("spec inválida");
  const message = buildFormSubmissionMessage(parsed.spec, { motivo: "Dolor" });
  assert.match(message, /Registrar/);
  assert.match(message, /- Motivo: Dolor/);
});

test("isUiSpec: detecta specs por su kind", () => {
  assert.equal(isUiSpec({ kind: "form" }), true);
  assert.equal(isUiSpec({ kind: "chart" }), true);
  assert.equal(isUiSpec({ kind: "nope" }), false);
  assert.equal(isUiSpec(null), false);
});

test("ui.render_form (tool): produce el spec normalizado", async () => {
  const result = await executeTool(
    uiTool("ui.render_form"),
    { fields: [{ name: "motivo", type: "text" }] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(isUiSpec(result.content));
  assert.equal((result.content as { kind: string }).kind, "form");
});

test("ui.render_chart (tool): produce el spec normalizado", async () => {
  const result = await executeTool(uiTool("ui.render_chart"), { data: [{ label: "A", value: 1 }] }, ctx);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal((result.content as { kind: string }).kind, "chart");
});

test("ui.render_buttons (tool): produce el spec gobernado (consulta el catálogo para RBAC)", async () => {
  // Tras MP-CTRL-0130 los botones se RESUELVEN contra el catálogo + RBAC, así que esta tool sí
  // consulta /api/v1/resources (a diferencia de form/chart). El gobierno completo se prueba en
  // button-actions-tools.test.ts; aquí sólo se verifica que produce un spec 'buttons' válido.
  const buttonsCtx: ToolExecutionContext = {
    api: (async (path: string) => {
      if (path === "/api/v1/resources") return [];
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  const result = await executeTool(
    uiTool("ui.render_buttons"),
    { buttons: [{ label: "Ok", action: { type: "message", prompt: "ok" } }] },
    buttonsCtx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal((result.content as { kind: string }).kind, "buttons");
  assert.equal((result.content as { buttons: Array<{ governance?: string }> }).buttons[0].governance, "read_only");
});

test("ui.render_form (tool): spec inválida -> error 'invalid_ui_spec'", async () => {
  const result = await executeTool(uiTool("ui.render_form"), { fields: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_ui_spec");
});

// --- Respuestas sugeridas (quick replies): texto plano que se envía como mensaje del médico ---

test("parseSuggestedRepliesSpec: normaliza (trim + dedupe) y conserva el título", () => {
  const parsed = parseSuggestedRepliesSpec({
    title: "Sugerencias",
    replies: ["  Muéstrame la agenda de hoy  ", "Busca un paciente", "Busca un paciente"],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "suggested_replies");
  assert.equal(parsed.spec.title, "Sugerencias");
  assert.deepEqual(parsed.spec.replies, ["Muéstrame la agenda de hoy", "Busca un paciente"]);
});

test("parseSuggestedRepliesSpec: rechaza vacías, no-texto, demasiadas o demasiado largas", () => {
  assert.equal(parseSuggestedRepliesSpec({ replies: [] }).ok, false);
  assert.equal(parseSuggestedRepliesSpec({ replies: ["ok", 5] }).ok, false);
  assert.equal(parseSuggestedRepliesSpec({ replies: ["   "] }).ok, false);
  assert.equal(parseSuggestedRepliesSpec({ replies: ["a", "b", "c", "d", "e", "f", "g"] }).ok, false);
  assert.equal(parseSuggestedRepliesSpec({ replies: ["x".repeat(141)] }).ok, false);
});

test("isUiSpec: detecta suggested_replies", () => {
  assert.equal(isUiSpec({ kind: "suggested_replies" }), true);
});

test("ui.suggest_replies (tool): produce el spec normalizado, sin tocar la API", async () => {
  const result = await executeTool(
    uiTool("ui.suggest_replies"),
    { replies: ["Busca al paciente Juan Pérez", "Muéstrame la agenda de hoy"] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal((result.content as { kind: string }).kind, "suggested_replies");
  assert.deepEqual((result.content as { replies: string[] }).replies, [
    "Busca al paciente Juan Pérez",
    "Muéstrame la agenda de hoy",
  ]);
});

test("ui.suggest_replies (tool): es lectura y spec inválida -> error 'invalid_ui_spec'", async () => {
  assert.equal(uiTool("ui.suggest_replies").kind, "read");
  const result = await executeTool(uiTool("ui.suggest_replies"), { replies: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_ui_spec");
});
