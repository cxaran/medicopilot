import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDynamicFormSubmission,
  validateDynamicForm,
  DF_LIMITS,
  type DynamicFormSpec,
} from "./dynamic-form.ts";
import { getTool, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// UI DINÁMICA EN LISTA BLANCA (MP-CTRL-0117): la frontera de seguridad para que el agente componga
// UI a la medida SOLO para casos sin plantilla. El validador acepta una lista blanca estricta de
// widgets/props y RECHAZA tipos desconocidos, props prohibidas, contenido ejecutable (HTML/script/
// URL) y specs por encima de los límites de complejidad. Nada se ejecuta ni se guarda: los valores
// continúan la conversación y las acciones clínicas siguen pasando por la aprobación (P1).

const ctx: ToolExecutionContext = {
  api: async () => {
    throw new Error("la UI dinámica no debe llamar a la API");
  },
  sandbox: async () => ({ ok: true, value: null, logs: [] }),
};

// --- Validador: caso válido ---

test("validateDynamicForm: una spec de lista blanca (con anidación) valida y normaliza", () => {
  const result = validateDynamicForm({
    title: "Detalle a la medida",
    widgets: [
      { type: "heading", text: "Datos del episodio" },
      { type: "info_card", text: "Revisa antes de continuar.", tone: "warn" },
      {
        type: "section",
        title: "Síntomas",
        children: [
          { type: "text", name: "motivo", label: "Motivo", required: true },
          {
            type: "select",
            name: "severidad",
            label: "Severidad",
            options: [{ value: "leve" }, { value: "grave", label: "Grave" }],
          },
        ],
      },
      {
        type: "decision_list",
        name: "propuestas",
        label: "Propuestas",
        items: [{ value: "p1", text: "Solicitar biometría" }],
      },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.kind, "dynamic_form");
  assert.equal(result.spec.widgets.length, 4);
  assert.equal(result.spec.submit_label, "Enviar");
  assert.equal(result.spec.submit_prompt, "Detalle a la medida");
  // Las opciones se normalizan (label cae al value si falta).
  const section = result.spec.widgets[2];
  assert.equal(section.type, "section");
  if (section.type !== "section") return;
  const select = section.children[1];
  assert.equal(select.type, "select");
  if (select.type !== "select") return;
  assert.deepEqual(select.options, [
    { value: "leve", label: "leve" },
    { value: "grave", label: "Grave" },
  ]);
});

test("validateDynamicForm: requiere al menos un widget", () => {
  assert.equal(validateDynamicForm({ widgets: [] }).ok, false);
  assert.equal(validateDynamicForm({}).ok, false);
});

// --- Validador: rechazos de seguridad ---

test("validateDynamicForm: tipo de widget desconocido -> rechazado nombrándolo", () => {
  const result = validateDynamicForm({ widgets: [{ type: "iframe", name: "x" }] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /no permitido/);
  assert.match(result.error, /iframe/);
});

test("validateDynamicForm: prop prohibida (onclick/src/html) -> rechazada", () => {
  for (const prop of ["onclick", "src", "url", "href", "html", "style"]) {
    const result = validateDynamicForm({
      widgets: [{ type: "text", name: "x", label: "X", [prop]: "lo-que-sea" }],
    });
    assert.equal(result.ok, false, `debió rechazar la prop '${prop}'`);
    if (result.ok) continue;
    assert.match(result.error, /Prop no permitida/);
    assert.match(result.error, new RegExp(prop));
  }
});

test("validateDynamicForm: contenido HTML/script/URL en una cadena -> rechazado", () => {
  const html = validateDynamicForm({
    widgets: [{ type: "info_card", text: "<script>alert(1)</script>" }],
  });
  assert.equal(html.ok, false);
  if (!html.ok) assert.match(html.error, /HTML/);

  const url = validateDynamicForm({
    widgets: [{ type: "text", name: "x", label: "Ver https://malicioso.example" }],
  });
  assert.equal(url.ok, false);
  if (!url.ok) assert.match(url.error, /URL/);

  const handler = validateDynamicForm({
    widgets: [{ type: "heading", text: 'algo onerror=alert(1)' }],
  });
  assert.equal(handler.ok, false);
  if (!handler.ok) assert.match(handler.error, /eventos/);
});

// --- Validador: límites de complejidad ---

test("validateDynamicForm: demasiados widgets -> rechazado con la causa", () => {
  const widgets = Array.from({ length: DF_LIMITS.maxWidgets + 1 }, (_, i) => ({
    type: "text",
    name: `c${i}`,
    label: `Campo ${i}`,
  }));
  const result = validateDynamicForm({ widgets });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Demasiados widgets/);
});

test("validateDynamicForm: anidación demasiado profunda -> rechazada", () => {
  // Construye secciones anidadas más allá de maxDepth.
  let node: Record<string, unknown> = { type: "text", name: "hoja", label: "Hoja" };
  for (let i = 0; i < DF_LIMITS.maxDepth + 1; i += 1) {
    node = { type: "section", title: `Nivel ${i}`, children: [node] };
  }
  const result = validateDynamicForm({ widgets: [node] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /profund/);
});

test("validateDynamicForm: demasiadas opciones en un select -> rechazado", () => {
  const options = Array.from({ length: DF_LIMITS.maxOptions + 1 }, (_, i) => ({ value: `o${i}` }));
  const result = validateDynamicForm({
    widgets: [{ type: "select", name: "s", label: "S", options }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /opciones/);
});

// --- Builder de envío: continúa la conversación, no auto-ejecuta ni persiste ---

test("buildDynamicFormSubmission: arma el seguimiento con los valores recolectados", () => {
  const spec: DynamicFormSpec = {
    kind: "dynamic_form",
    submit_prompt: "Registrar episodio",
    submit_label: "Enviar",
    widgets: [
      {
        type: "section",
        children: [{ type: "text", name: "motivo", label: "Motivo" }],
      },
      {
        type: "decision_list",
        name: "props",
        items: [{ value: "p1", text: "Solicitar biometría" }],
      },
    ],
  };
  const message = buildDynamicFormSubmission(spec, {
    motivo: "Dolor torácico",
    "props.p1": "aceptar",
  });
  assert.match(message, /Registrar episodio/);
  assert.match(message, /- Motivo: Dolor torácico/);
  assert.match(message, /- Solicitar biometría: aceptar/);
});

// --- Tool ---

test("ui.render_dynamic_form: es lectura, no requiere aprobación y produce el spec validado", async () => {
  const tool = getTool("ui.render_dynamic_form");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read"); // produce una UI, no una escritura auto-guardada
  assert.equal(tool.approval, undefined);

  const result = await executeTool(
    tool,
    { widgets: [{ type: "text", name: "motivo", label: "Motivo" }] },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal((result.content as { kind: string }).kind, "dynamic_form");
});

test("ui.render_dynamic_form: spec maliciosa/ inválida -> error 'invalid_ui_spec'", async () => {
  const tool = getTool("ui.render_dynamic_form");
  if (!tool) throw new Error("falta ui.render_dynamic_form");
  const result = await executeTool(
    tool,
    { widgets: [{ type: "text", name: "x", label: "X", onclick: "robar()" }] },
    ctx,
  );
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_ui_spec");
});

test("ui.render_dynamic_form: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.render_dynamic_form", {
    widgets: [{ type: "heading", text: "Hola" }],
  });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("componer formulario a la medida widgets sin plantilla", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.render_dynamic_form"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "ui.render_dynamic_form",
  );
  assert.notEqual(entry?.status, "gated_out");
});
