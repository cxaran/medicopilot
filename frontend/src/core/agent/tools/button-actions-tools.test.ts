import test from "node:test";
import assert from "node:assert/strict";

import {
  buildButtonsModel,
  isButtonBlocked,
  type ButtonReviewContext,
  type ButtonToolEntry,
  type ButtonsInput,
} from "./button-actions.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import { isUiSpec } from "./ui-spec.ts";

// GOBIERNO DE BOTONES ACCIONABLES (MP-CTRL-0130): el punto permisivo de la UI generativa eran los
// botones que disparaban una tool con argumentos ARBITRARIOS. Se prueba que cada botón se RESUELVE
// contra el catálogo de tools + RBAC: mensaje/lectura = sólo lectura; escritura permitida = accionable
// (pasa por P1); tool desconocida o escritura sin permiso = bloqueada con motivo; argumentos fuera
// del esquema = descartados (no se inventan). NADA se ejecuta ni se despacha directamente.

// Catálogo de tools de prueba: una lectura, una escritura sobre 'clinical_tasks' (con esquema), una
// escritura owner-scoped (memorias) y una escritura sobre un recurso que el actor NO puede crear.
const TOOLS = new Map<string, ButtonToolEntry>([
  ["clinical.list_patients", { name: "clinical.list_patients", kind: "read", schemaProps: new Set(["limit", "offset"]) }],
  [
    "clinical.create_task_draft",
    {
      name: "clinical.create_task_draft",
      kind: "write",
      targetResource: "clinical_tasks",
      schemaProps: new Set(["title", "description", "patient_id", "due_at", "priority", "status"]),
    },
  ],
  [
    "clinical.create_prescription_draft",
    {
      name: "clinical.create_prescription_draft",
      kind: "write",
      targetResource: "prescriptions",
      schemaProps: new Set(["consultation_id", "notes"]),
    },
  ],
  [
    "memory.remember",
    { name: "memory.remember", kind: "write", targetResource: "agent_memories", ownerScoped: true, schemaProps: new Set(["title", "content"]) },
  ],
]);

// El actor puede crear tareas, pero NO recetas (RBAC).
const CTX: ButtonReviewContext = { tools: TOOLS, creatable: new Set(["clinical_tasks"]) };

function input(buttons: ButtonsInput["buttons"]): ButtonsInput {
  return { buttons };
}

// --- Clasificación de gobierno ---

test("buildButtonsModel: acción de mensaje -> sólo lectura", () => {
  const result = buildButtonsModel(
    input([{ label: "Ver más", action: { type: "message", prompt: "muéstrame más" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.buttons[0].governance, "read_only");
});

test("buildButtonsModel: tool de LECTURA -> sólo lectura (no puede mutar)", () => {
  const result = buildButtonsModel(
    input([{ label: "Recargar", action: { type: "tool", tool: "clinical.list_patients" } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.buttons[0].governance, "read_only");
});

test("buildButtonsModel: tool de ESCRITURA con permiso -> ACCIONABLE (pasa por P1)", () => {
  const result = buildButtonsModel(
    input([
      {
        label: "Crear tarea",
        action: { type: "tool", tool: "clinical.create_task_draft", args: { title: "Control en 2 semanas" } },
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const button = result.spec.buttons[0];
  assert.equal(button.governance, "actionable");
  assert.equal(button.reason, undefined);
  assert.deepEqual(button.action, {
    type: "tool",
    tool: "clinical.create_task_draft",
    args: { title: "Control en 2 semanas" },
  });
});

test("buildButtonsModel: escritura SIN permiso -> BLOQUEADA con motivo (no descartada)", () => {
  const result = buildButtonsModel(
    input([
      {
        label: "Emitir receta",
        action: { type: "tool", tool: "clinical.create_prescription_draft", args: { consultation_id: "c1" } },
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const button = result.spec.buttons[0];
  assert.equal(button.governance, "blocked");
  assert.match(button.reason ?? "", /permiso para crear/);
  assert.match(button.reason ?? "", /prescriptions/);
});

test("buildButtonsModel: escritura OWNER-SCOPED (memorias) -> accionable aunque no sea recurso RBAC", () => {
  const result = buildButtonsModel(
    input([
      { label: "Recordar", action: { type: "tool", tool: "memory.remember", args: { title: "x", content: "y" } } },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.buttons[0].governance, "actionable");
});

// --- Tool desconocida y argumentos arbitrarios ---

test("buildButtonsModel: tool DESCONOCIDA -> BLOQUEADA nombrándola (nunca llamada arbitraria)", () => {
  const result = buildButtonsModel(
    input([{ label: "Hacer algo", action: { type: "tool", tool: "system.delete_everything", args: { all: true } } }]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const button = result.spec.buttons[0];
  assert.equal(button.governance, "blocked");
  assert.match(button.reason ?? "", /desconocida/);
});

test("buildButtonsModel: argumentos fuera del esquema -> descartados (no se inventan)", () => {
  const result = buildButtonsModel(
    input([
      {
        label: "Crear tarea",
        action: {
          type: "tool",
          tool: "clinical.create_task_draft",
          args: { title: "Control", campo_inventado: "x", owner_id: "intruso" },
        },
      },
    ]),
    CTX,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const button = result.spec.buttons[0];
  assert.equal(button.governance, "actionable");
  assert.deepEqual(button.dropped_args?.sort(), ["campo_inventado", "owner_id"]);
  if (button.action.type !== "tool") throw new Error("se esperaba acción de tool");
  assert.deepEqual(button.action.args, { title: "Control" });
});

// --- Validación estructural ---

test("buildButtonsModel: lista vacía / sin label / acción inválida -> error", () => {
  assert.equal(buildButtonsModel(input([]), CTX).ok, false);
  assert.equal(buildButtonsModel(input([{ action: { type: "message", prompt: "x" } }]), CTX).ok, false);
  assert.equal(
    buildButtonsModel(input([{ label: "X", action: { type: "tool" } }]), CTX).ok,
    false,
  );
  // type desconocido en la acción -> inválida.
  assert.equal(
    buildButtonsModel(input([{ label: "X", action: { type: "navigate", url: "http://x" } }]), CTX).ok,
    false,
  );
});

test("isButtonBlocked: helper de render", () => {
  assert.equal(isButtonBlocked({ governance: "blocked" }), true);
  assert.equal(isButtonBlocked({ governance: "actionable" }), false);
  assert.equal(isButtonBlocked({ governance: "read_only" }), false);
});

// --- Tool ui.render_buttons: lectura, sin aprobación, gobierna de punta a punta ---

test("ui.render_buttons: es lectura, sin aprobación, y sólo consulta el catálogo (no escribe)", async () => {
  const tool = getTool("ui.render_buttons");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);

  const calls: string[] = [];
  const ctx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") {
        // clinical_tasks creable; prescriptions legible pero NO creable.
        return [
          { name: "clinical_tasks", forms: { create: { fields: [{ name: "title", required: true }] } } },
          { name: "prescriptions", forms: { create: null } },
        ];
      }
      throw new Error(`llamada inesperada: ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    tool,
    {
      buttons: [
        { label: "Crear tarea", action: { type: "tool", tool: "clinical.create_task_draft", args: { title: "Control", hack: 1 } } },
        { label: "Emitir receta", action: { type: "tool", tool: "clinical.create_prescription_draft", args: { consultation_id: "c1" } } },
        { label: "Tool arbitraria", action: { type: "tool", tool: "system.rm_rf", args: { path: "/" } } },
        { label: "Ver más", action: { type: "message", prompt: "más" } },
      ],
    },
    ctx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const spec = result.content as { kind: string; buttons: Array<{ governance?: string; reason?: string; dropped_args?: string[]; action: unknown }> };
  assert.equal(spec.kind, "buttons");
  assert.ok(isUiSpec(spec));
  // 1) tarea: accionable, con arg 'hack' descartado.
  assert.equal(spec.buttons[0].governance, "actionable");
  assert.deepEqual(spec.buttons[0].dropped_args, ["hack"]);
  // 2) receta: bloqueada (sin permiso de crear prescriptions).
  assert.equal(spec.buttons[1].governance, "blocked");
  // 3) tool arbitraria: bloqueada (desconocida) — nunca una llamada arbitraria.
  assert.equal(spec.buttons[2].governance, "blocked");
  // 4) mensaje: sólo lectura.
  assert.equal(spec.buttons[3].governance, "read_only");
  // Sólo se consultó el catálogo (lectura); ninguna escritura.
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});

test("ui.render_buttons: entrada inválida -> error 'invalid_ui_spec'", async () => {
  const tool = getTool("ui.render_buttons");
  if (!tool) throw new Error("falta ui.render_buttons");
  const ctx: ToolExecutionContext = {
    api: (async () => []) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };
  const result = await executeTool(tool, { buttons: [] }, ctx);
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "invalid_ui_spec");
});

test("ui.render_buttons: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const resolved = resolveToolCall("ui.render_buttons", { buttons: [] });
  assert.equal(resolved.outcome, "ready");
  const hits = searchTools("botones de acción en el chat", tools, 10);
  assert.ok(hits.some((h) => h.name === "ui.render_buttons"));
  const entry = buildToolCatalog(tools, new Set<string>()).find((e) => e.name === "ui.render_buttons");
  assert.notEqual(entry?.status, "gated_out");
});

test("buildButtonsModel: botón link de WhatsApp -> sólo lectura; URL insegura -> rechazada", () => {
  // Enlace de contacto válido (WhatsApp): no muta el sistema, es de sólo lectura.
  const ok = buildButtonsModel(
    input([
      { label: "Enviar por WhatsApp", action: { type: "link", url: "https://wa.me/5215551234567?text=Hola" } },
    ]),
    CTX,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.spec.buttons[0].governance, "read_only");
    assert.equal(ok.spec.buttons[0].action.type, "link");
  }

  // URL fuera de la lista blanca (dominio arbitrario / http): la acción no parsea -> botón inválido.
  const bad = buildButtonsModel(
    input([{ label: "Phishing", action: { type: "link", url: "http://evil.example.com/x" } }]),
    CTX,
  );
  assert.equal(bad.ok, false);

  // javascript: jamás se acepta.
  const js = buildButtonsModel(
    input([{ label: "XSS", action: { type: "link", url: "javascript:alert(1)" } }]),
    CTX,
  );
  assert.equal(js.ok, false);
});
