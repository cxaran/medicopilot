import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// UI HÍBRIDA (MP-CTRL-0115): catálogo de plantillas registradas. La tool de lectura llama al
// endpoint del catálogo (filtrado por RBAC en el backend). Es solo lectura: nunca abre ni crea.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("list_templates: llama GET /agent/templates y devuelve el catálogo", async (t) => {
  let captured = "";
  const catalog = [
    {
      id: "patients", label: "Pacientes", resource: "patients",
      modes: ["create", "edit", "review"],
      prefill: { prefillable_fields: ["full_name", "birth_date"], fields_requiring_confirmation: ["full_name"] },
      actions: ["delete"],
    },
  ];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, catalog);
  });
  const resolved = resolveToolCall("clinical.list_templates", {});
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const out = (await executeTool(resolved.tool, resolved.args)) as {
    status: string; content: { id: string }[];
  };
  assert.equal(captured, "/api/v1/agent/templates");
  assert.equal(out.status, "success");
  assert.equal(out.content[0].id, "patients");
});

test("list_templates: no acepta parámetros desconocidos", () => {
  assert.equal(resolveToolCall("clinical.list_templates", { foo: 1 }).outcome, "invalid_args");
});

test("list_templates: es lectura, descubrible y no se gatea en cliente", () => {
  const tools = listTools();
  const hits = searchTools("plantillas registradas catálogo abrir formulario prellenado", tools, 10);
  assert.ok(hits.some((h) => h.name === "clinical.list_templates"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.list_templates",
  );
  assert.notEqual(entry?.status, "gated_out");
});
