import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFormSubmissionMessage,
  buttonActionToMessage,
  isUiSpec,
  parseButtonsSpec,
  parseChartSpec,
  parseFormSpec,
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

test("parseFormSpec: select sin options es inválido", () => {
  const parsed = parseFormSpec({ fields: [{ name: "x", type: "select" }] });
  assert.equal(parsed.ok, false);
});

test("parseChartSpec: acepta barras con datos numéricos", () => {
  const parsed = parseChartSpec({ title: "T", data: [{ label: "Ene", value: 3 }] });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "chart");
  assert.equal(parsed.spec.data[0].value, 3);
});

test("parseChartSpec: rechaza value no numérico", () => {
  const parsed = parseChartSpec({ data: [{ label: "Ene", value: "x" }] });
  assert.equal(parsed.ok, false);
});

test("parseButtonsSpec: valida acciones message y tool", () => {
  const parsed = parseButtonsSpec({
    buttons: [
      { label: "Seguir", action: { type: "message", prompt: "Continúa" } },
      { label: "Listar", action: { type: "tool", tool: "clinical.list_patients" } },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.buttons.length, 2);
});

test("parseButtonsSpec: rechaza acción inválida", () => {
  const parsed = parseButtonsSpec({ buttons: [{ label: "X", action: { type: "nope" } }] });
  assert.equal(parsed.ok, false);
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
