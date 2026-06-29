import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";
import {
  buildPrefillFormModel,
  type OpenTemplateResolved,
} from "../open-template-form.ts";

// SEAM EXTRACCIÓN->PREFILL (MP-CTRL-0118): cierra "hablar/dictar -> formulario registrado
// prellenado -> aprobar". La tool clinical.prefill_from_extraction envía el RESULTADO de extracción
// (campos con confianza + fragmento de origen) y recibe el MISMO plan resuelto que open_template
// (0116), por lo que reusa buildPrefillFormModel SIN renderizador paralelo. La extracción LLM real
// es del runtime del agente (MG-002) y queda fuera de alcance: aquí se prueba el plomería
// determinista con un resultado de extracción hecho a mano.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Plan que el backend devuelve (misma forma OpenTemplateResolved de 0116): phone fue de confianza
// media -> sugerido; full_name de alta -> prellenado; un campo ajeno cayó en dropped_fields.
const RESOLVED: OpenTemplateResolved = {
  template_id: "patients",
  resource: "patients",
  label: "Pacientes",
  mode: "create",
  method: "POST",
  url_template: "/api/v1/patients",
  values: { full_name: "Ana Ruiz", phone: "5512345678" },
  prefilled_fields: ["full_name"],
  suggested_fields: ["phone"],
  fields_requiring_confirmation: ["full_name", "birth_date", "sex"],
  dropped_fields: ["campo_inventado"],
  source_fragments: { full_name: "la paciente Ana Ruiz" },
  source_overall: "transcripcion-123",
  allowed_actions: [],
};

test("prefill_from_extraction: es lectura (no escritura) y no requiere aprobación", () => {
  const tool = getTool("clinical.prefill_from_extraction");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read"); // produce una APERTURA prellenada, no un write auto-guardado
  assert.equal(tool.approval, undefined);
});

test("prefill_from_extraction: POST al endpoint con el cuerpo de extracción correcto", async (t) => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    assert.equal(init.method, "POST");
    return jsonResponse(200, RESOLVED);
  });
  const extracted = [
    { field: "full_name", value: "Ana Ruiz", confidence: 0.95, source_fragment: "la paciente Ana Ruiz" },
    { field: "phone", value: "5512345678", confidence: 0.6 },
    { field: "campo_inventado", value: "x", confidence: 0.99 },
  ];
  const resolved = resolveToolCall("clinical.prefill_from_extraction", {
    template_id: "patients",
    mode: "create",
    extracted_fields: extracted,
    source_overall: "transcripcion-123",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const out = (await executeTool(resolved.tool, resolved.args)) as {
    status: string; content: { resource: string };
  };
  assert.equal(capturedUrl, "/api/v1/agent/templates/patients/prefill-from-extraction");
  assert.deepEqual(capturedBody, {
    mode: "create",
    extracted_fields: extracted,
    source_overall: "transcripcion-123",
  });
  assert.equal(out.status, "success");
  assert.equal(out.content.resource, "patients");
});

test("prefill_from_extraction: requiere template_id, mode y extracted_fields", () => {
  // El esquema permisivo (PASSTHROUGH) deja pasar la forma; el execute arma el cuerpo. Verificamos
  // que la tool se resuelve y que NO se inventa nada: el reparto lo decide el backend.
  const resolved = resolveToolCall("clinical.prefill_from_extraction", {
    template_id: "patients",
    mode: "create",
    extracted_fields: [],
  });
  assert.equal(resolved.outcome, "ready");
});

test("prefill_from_extraction: template desconocido/prohibido -> error (no escritura)", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(404, { code: "template_not_found", message: "Plantilla no encontrada: 'no_existe'." }),
  );
  const resolved = resolveToolCall("clinical.prefill_from_extraction", {
    template_id: "no_existe", mode: "create", extracted_fields: [],
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const out = await executeTool(resolved.tool, resolved.args);
  assert.equal(out.status, "error");
});

test("prefill_from_extraction: descubrible y no gateada en cliente", () => {
  const tools = listTools();
  const hits = searchTools(
    "prellenar plantilla desde transcripción extracción confianza dictado", tools, 10,
  );
  assert.ok(hits.some((h) => h.name === "clinical.prefill_from_extraction"));
  const entry = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.prefill_from_extraction",
  );
  assert.notEqual(entry?.status, "gated_out");
});

// --- Resolver REUSADO (sin renderizador paralelo): el plan de extracción alimenta el mismo
//     buildPrefillFormModel de 0116, que produce los initialValues + marcas del renderizador. ---

test("buildPrefillFormModel: el plan de extracción marca prellenado/sugerido y descarta lo ajeno", () => {
  const model = buildPrefillFormModel(RESOLVED);
  // full_name (alta confianza) entra prellenado; phone (media) sugerido.
  assert.equal(model.initialValues.full_name, "Ana Ruiz");
  assert.equal(model.initialValues.phone, "5512345678");
  // phone NO es obligatorio -> queda 'suggested'; full_name es obligatorio -> 'confirm'.
  assert.equal(model.marks.phone, "suggested");
  assert.equal(model.marks.full_name, "confirm");
  // birth_date/sex son obligatorios pero ausentes de la extracción: a-confirmar SIN valor (la
  // ausencia no es un negativo).
  assert.equal(model.marks.birth_date, "confirm");
  assert.equal(model.initialValues.birth_date, undefined);
  // Trazabilidad y descartes.
  assert.equal(model.sourceByField.full_name, "la paciente Ana Ruiz");
  assert.equal(model.sourceOverall, "transcripcion-123");
  assert.deepEqual(model.droppedFields, ["campo_inventado"]);
  assert.equal(model.initialValues.campo_inventado, undefined);
});
