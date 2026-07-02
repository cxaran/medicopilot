import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  CORE_TOOL_NAMES,
  META_TOOL_NAMES,
  declaredToolNames,
  declaredTools,
  describeTools,
  isMetaTool,
  searchTools,
} from "./tool-discovery.ts";
import { effectiveTools } from "./tool-catalog.ts";
import { defaultToolContext, getTool, listTools, type ToolExecutionContext } from "./tools/registry.ts";

// Candidatos buscables = efectivos (gateados por rol) sin las meta-tools.
function searchable(creatable: Set<string>) {
  return effectiveTools(listTools(), creatable).filter((tool) => !isMetaTool(tool.name));
}

test("tool_search devuelve un subconjunto relevante a la intención", () => {
  const hits = searchTools("agendar una cita", searchable(new Set(["appointments"])));
  const names = hits.map((h) => h.name);
  assert.ok(names.includes("clinical.create_appointment_draft"), `esperaba la tool de cita, dio: ${names.join(", ")}`);
  // No se devuelven las meta-tools a sí mismas.
  assert.ok(!names.includes("tool_search") && !names.includes("tool_describe"));
});

test("tool_search es insensible a acentos/mayúsculas", () => {
  const hits = searchTools("RECETAS médicas", searchable(new Set(["prescriptions"])));
  const names = hits.map((h) => h.name);
  assert.ok(names.some((n) => n.includes("prescription")), `esperaba tools de receta, dio: ${names.join(", ")}`);
});

test("tool_describe carga el esquema completo de las tools pedidas", () => {
  const described = describeTools(["clinical.list_prescriptions"], searchable(new Set()));
  assert.equal(described.length, 1);
  const entry = described[0]!;
  assert.ok(!("error" in entry));
  if (!("error" in entry)) {
    assert.equal(entry.name, "clinical.list_prescriptions");
    assert.equal(typeof entry.input_schema, "object");
  }
});

test("las tools GATEADAS por rol nunca aparecen en search ni describe", () => {
  // Sin permiso de creación: las escrituras quedan gateadas (fuera de los candidatos).
  const candidates = searchable(new Set());
  const found = searchTools("crear receta en borrador", candidates).map((h) => h.name);
  assert.ok(!found.includes("clinical.create_prescription_draft"), "una escritura gateada no debe ser buscable");

  const described = describeTools(["clinical.create_prescription_draft"], candidates);
  assert.equal(described.length, 1);
  assert.ok("error" in described[0]!, "describir una tool gateada debe devolver error");
});

test("una tool de ESCRITURA descubierta sigue siendo de escritura con metadata de aprobación (P1)", () => {
  // Con permiso, la escritura es buscable/cargable.
  const candidates = searchable(new Set(["prescriptions"]));
  const described = describeTools(["clinical.create_prescription_draft"], candidates);
  assert.ok(!("error" in described[0]!));

  // La tool descubierta conserva kind=write + approval -> el flujo P1 (handleToolCall) la
  // enruta a la tarjeta de aprobación; descubrir no salta la aprobación.
  const tool = getTool("clinical.create_prescription_draft");
  assert.ok(tool);
  assert.equal(tool!.kind, "write");
  assert.ok(tool!.approval, "una escritura debe declarar metadata de aprobación");

  // Tras cargarla, queda en el set declarado de los turnos siguientes.
  const eff = effectiveTools(listTools(), new Set(["prescriptions"]));
  const declared = declaredTools(eff, ["clinical.create_prescription_draft"]).map((t) => t.name);
  assert.ok(declared.includes("clinical.create_prescription_draft"));
});

test("declarar todo: se declara el catálogo efectivo COMPLETO, sin las meta-tools de descubrimiento", () => {
  const eff = effectiveTools(listTools(), new Set());
  const declared = declaredTools(eff, []).map((t) => t.name);

  // Las meta-tools de descubrimiento NO se declaran (con todo declarado ya no hacen falta).
  assert.ok(!declared.includes("tool_search"));
  assert.ok(!declared.includes("tool_describe"));
  // Todo lo demás efectivo SÍ se declara directamente (sin descubrimiento).
  for (const tool of eff) {
    if (tool.name === "tool_search" || tool.name === "tool_describe") continue;
    assert.ok(declared.includes(tool.name), `debería declararse: ${tool.name}`);
  }
  // Lecturas clínicas, pubmed y ui.* quedan declaradas (antes eran solo descubribles).
  assert.ok(declared.includes("clinical.list_prescriptions"));
  assert.ok(declared.includes("pubmed.search"));
  assert.ok(declared.some((n) => n.startsWith("ui.")));
});

test("declaredToolNames nunca declara una tool cargada que esté gateada", () => {
  const eff = effectiveTools(listTools(), new Set()); // sin permisos -> escrituras gateadas
  // Se "cargó" una escritura, pero está gateada -> no entra al set declarado.
  const names = declaredToolNames(eff, ["clinical.create_prescription_draft"]);
  assert.ok(!names.has("clinical.create_prescription_draft"));
});

test("meta-tool tool_search ejecuta sobre el contexto de descubrimiento inyectado", async () => {
  const candidates = searchable(new Set(["appointments"]));
  const ctx: ToolExecutionContext = {
    ...defaultToolContext,
    discovery: { searchable: candidates, markLoaded: () => {} },
  };
  const tool = getTool("tool_search");
  assert.ok(tool);
  const result = (await tool!.execute({ query: "cita" }, ctx)) as { tools: Array<{ name: string }> };
  assert.ok(Array.isArray(result.tools));
  assert.ok(result.tools.some((t) => t.name === "clinical.create_appointment_draft"));
});

test("meta-tool tool_describe marca como CARGADAS las tools resueltas", async () => {
  const candidates = searchable(new Set(["prescriptions"]));
  const loaded: string[] = [];
  const ctx: ToolExecutionContext = {
    ...defaultToolContext,
    discovery: { searchable: candidates, markLoaded: (names) => loaded.push(...names) },
  };
  const tool = getTool("tool_describe");
  assert.ok(tool);
  const result = (await tool!.execute(
    { names: ["clinical.create_prescription_draft", "no.existe"] },
    ctx,
  )) as { tools: Array<Record<string, unknown>> };
  // Solo la resuelta se marca cargada; la inexistente no.
  assert.deepEqual(loaded, ["clinical.create_prescription_draft"]);
  assert.equal(result.tools.length, 2);
});

test("META_TOOL_NAMES son meta y forman parte del núcleo", () => {
  for (const name of META_TOOL_NAMES) {
    assert.ok(isMetaTool(name));
    assert.ok(CORE_TOOL_NAMES.includes(name));
    assert.ok(getTool(name), `la meta-tool ${name} debe existir en el registry`);
  }
});
