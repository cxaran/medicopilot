import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStartSuggestions } from "./start-suggestions";
import type { ToolCatalogEntry } from "./tool-catalog";

function entry(name: string, status: ToolCatalogEntry["status"] = "declared"): ToolCatalogEntry {
  return {
    name,
    kind: name.startsWith("clinical.create") ? "write" : "read",
    source: "test",
    targetResource: null,
    status,
    reason: null,
  };
}

// Shuffle determinista (identidad) para aislar el filtrado del azar en los tests.
const identity = <T>(items: readonly T[]): T[] => [...items];

test("solo ofrece sugerencias cuyas tools están todas disponibles", () => {
  const catalog = [entry("clinical.patient_summary"), entry("clinical.list_vital_signs")];
  const out = buildStartSuggestions(catalog, "patient", 10, identity);
  assert.ok(out.includes("Dame un resumen del paciente"));
  assert.ok(out.includes("¿Cuáles son sus últimos signos vitales?"));
  // Requiere list_prescriptions, que no está en el catálogo → no aparece.
  assert.ok(!out.includes("¿Qué medicación toma actualmente?"));
});

test("una sugerencia con varias tools requiere TODAS", () => {
  // Falta ui.render_chart → la gráfica de signos no debe aparecer aunque haya list_vital_signs.
  const sinChart = buildStartSuggestions([entry("clinical.list_vital_signs")], "patient", 10, identity);
  assert.ok(!sinChart.includes("Muéstrame una gráfica de sus signos vitales"));

  const conChart = buildStartSuggestions(
    [entry("clinical.list_vital_signs"), entry("ui.render_chart")],
    "patient",
    10,
    identity,
  );
  assert.ok(conChart.includes("Muéstrame una gráfica de sus signos vitales"));
});

test("respeta el contexto: una sugerencia de paciente no sale en global", () => {
  const catalog = [entry("clinical.patient_summary"), entry("clinical.list_recent_consultations")];
  const global = buildStartSuggestions(catalog, "global", 10, identity);
  assert.ok(!global.includes("Dame un resumen del paciente"));
  assert.ok(global.includes("¿Cómo van las consultas de esta semana?"));
});

test("una tool gateada (gated_out) NO habilita su sugerencia de escritura", () => {
  const blocked = buildStartSuggestions([entry("clinical.create_patient_draft", "gated_out")], "global", 10, identity);
  assert.ok(!blocked.includes("Dar de alta a un paciente nuevo"));

  const allowed = buildStartSuggestions([entry("clinical.create_patient_draft", "discoverable")], "global", 10, identity);
  assert.ok(allowed.includes("Dar de alta a un paciente nuevo"));
});

test("limita al número pedido", () => {
  const catalog = [
    entry("clinical.patient_summary"),
    entry("clinical.list_prescriptions"),
    entry("clinical.list_vital_signs"),
    entry("clinical.list_lab_results"),
    entry("clinical.list_diagnoses"),
  ];
  assert.equal(buildStartSuggestions(catalog, "patient", 3, identity).length, 3);
});

test("catálogo vacío → sin sugerencias (el caller usa su fallback)", () => {
  assert.deepEqual(buildStartSuggestions([], "global", 4, identity), []);
});

test("el shuffle se aplica antes de recortar (selección aleatoria)", () => {
  const catalog = [
    entry("clinical.patient_summary"),
    entry("clinical.list_prescriptions"),
    entry("clinical.list_vital_signs"),
  ];
  // Shuffle que invierte: el primer elegible pasa al final y queda fuera del top-1.
  const reverse = <T>(items: readonly T[]): T[] => [...items].reverse();
  const first = buildStartSuggestions(catalog, "patient", 1, identity);
  const last = buildStartSuggestions(catalog, "patient", 1, reverse);
  assert.notDeepEqual(first, last);
});
