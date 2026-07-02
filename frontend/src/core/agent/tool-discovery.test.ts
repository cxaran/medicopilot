import { strict as assert } from "node:assert";
import { test } from "node:test";

import { searchTools } from "./tool-discovery.ts";
import { effectiveTools } from "./tool-catalog.ts";
import { getTool, listTools } from "./tools/registry.ts";

// ``searchTools`` es un HARNESS DE QA de metadata (no un mecanismo de runtime): verifica que las
// tools sean localizables por intención. Los candidatos son los efectivos (gateados por rol).
function searchable(creatable: Set<string>) {
  return effectiveTools(listTools(), creatable);
}

test("searchTools devuelve un subconjunto relevante a la intención", () => {
  const hits = searchTools("agendar una cita", searchable(new Set(["appointments"])));
  const names = hits.map((h) => h.name);
  assert.ok(names.includes("clinical.create_appointment_draft"), `esperaba la tool de cita, dio: ${names.join(", ")}`);
});

test("searchTools es insensible a acentos/mayúsculas", () => {
  const hits = searchTools("RECETAS médicas", searchable(new Set(["prescriptions"])));
  const names = hits.map((h) => h.name);
  assert.ok(names.some((n) => n.includes("prescription")), `esperaba tools de receta, dio: ${names.join(", ")}`);
});

test("las tools GATEADAS por rol nunca aparecen en la búsqueda", () => {
  // Sin permiso de creación: las escrituras quedan gateadas (fuera de los candidatos).
  const candidates = searchable(new Set());
  const found = searchTools("crear receta en borrador", candidates).map((h) => h.name);
  assert.ok(!found.includes("clinical.create_prescription_draft"), "una escritura gateada no debe ser buscable");
});

test("no existen meta-tools de descubrimiento en el registry (se declara todo)", () => {
  // El descubrimiento bajo demanda (tool_search/tool_describe al estilo OpenClaw) se retiró:
  // el catálogo efectivo completo se declara al modelo cada turno. Guard de no-regresión.
  assert.equal(getTool("tool_search"), undefined);
  assert.equal(getTool("tool_describe"), undefined);
});

test("declarar todo: el set efectivo incluye lecturas clínicas, pubmed y ui.*", () => {
  const eff = effectiveTools(listTools(), new Set()).map((t) => t.name);
  assert.ok(eff.includes("clinical.list_prescriptions"));
  assert.ok(eff.includes("pubmed.search"));
  assert.ok(eff.some((n) => n.startsWith("ui.")));
});
