import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// UI HÍBRIDA (MP-CTRL-0116): contrato abrir-plantilla-con-prellenado. La tool open_template
// produce una acción de APERTURA (no una escritura): valida contra el backend y devuelve el plan
// resuelto; nada se guarda. El agente abre después el formulario oficial con
// ``ui.open_resource_form`` usando los valores del plan.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Plan resuelto tal como lo devuelve el backend (POST /agent/templates/{id}/prefill).
const RESOLVED = {
  template_id: "patients",
  resource: "patients",
  label: "Pacientes",
  mode: "create",
  method: "POST",
  url_template: "/api/v1/patients",
  values: { full_name: "María López", birth_date: "1990-01-01", sex: "female" },
  prefilled_fields: ["full_name", "birth_date"],
  suggested_fields: ["sex"],
  fields_requiring_confirmation: ["full_name", "birth_date", "sex"],
  dropped_fields: ["campo_inventado"],
  source_fragments: { full_name: "la paciente María López" },
  source_overall: "nota de la conversación",
  allowed_actions: ["delete"],
};

test("open_template: es lectura (no escritura) y no requiere aprobación de escritura", () => {
  const tool = getTool("clinical.open_template");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read"); // produce una APERTURA, no un write auto-guardado
  assert.equal(tool.approval, undefined);
});

test("open_template: POST al endpoint de prefill con el cuerpo correcto", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    assert.equal(init.method, "POST");
    return jsonResponse(200, RESOLVED);
  });
  const resolved = resolveToolCall("clinical.open_template", {
    template_id: "patients",
    mode: "create",
    prefilled: { full_name: "María López" },
    suggested: { sex: "female" },
    source_fragments: { full_name: "la paciente María López" },
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const out = (await executeTool(resolved.tool, resolved.args)) as {
    status: string; content: { resource: string };
  };
  assert.equal(capturedUrl, "/api/v1/agent/templates/patients/prefill");
  assert.deepEqual(capturedBody, {
    mode: "create",
    prefilled: { full_name: "María López" },
    suggested: { sex: "female" },
    source_fragments: { full_name: "la paciente María López" },
  });
  assert.equal(out.status, "success");
  assert.equal(out.content.resource, "patients");
});

test("open_template: requiere template_id y mode; mode fuera del enum es inválido", () => {
  assert.equal(
    resolveToolCall("clinical.open_template", { mode: "create" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.open_template", { template_id: "patients" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.open_template", { template_id: "patients", mode: "x" }).outcome,
    "invalid_args",
  );
});

test("open_template: template desconocido/prohibido -> error (no escritura)", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(404, { code: "template_not_found", message: "Plantilla no encontrada: 'no_existe'." }),
  );
  const resolved = resolveToolCall("clinical.open_template", {
    template_id: "no_existe", mode: "create",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const out = await executeTool(resolved.tool, resolved.args);
  assert.equal(out.status, "error");
});

test("open_template: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const hits = searchTools("abrir plantilla prellenada formulario registrado sugerencias", tools, 10);
  assert.ok(hits.some((h) => h.name === "clinical.open_template"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.open_template",
  );
  assert.notEqual(entry?.status, "gated_out");
});

