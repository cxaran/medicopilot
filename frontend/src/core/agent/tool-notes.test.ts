import test from "node:test";
import assert from "node:assert/strict";

import {
  briefValue,
  buildRejectedWriteNote,
  buildToolUsageNote,
  toolNotesContextText,
  TOOL_NOTE_RESULT_CHARS,
} from "./tool-notes.ts";

// Notas DETERMINISTAS del uso de herramientas: rastro TELEGRÁFICO para el contexto de turnos
// siguientes. Registran QUÉ se consultó/mostró/rechazó, nunca reemplazan la relectura fresca.

test("briefValue: compacta a una línea y trunca al tope", () => {
  assert.equal(briefValue("hola", 10), "hola");
  assert.equal(briefValue({ a: 1, b: "x" }, 100), '{"a":1,"b":"x"}');
  const long = briefValue("x".repeat(500), 20);
  assert.equal(long.length, 21); // 20 + elipsis
  assert.ok(long.endsWith("…"));
  assert.equal(briefValue("a\n  b\t c", 50), "a b c"); // sin saltos ni espacios repetidos
});

test("briefValue: los arrays anteponen su tamaño", () => {
  assert.ok(briefValue([1, 2, 3], 60).startsWith("[n=3] "));
});

test("briefValue: undefined/función no revientan (JSON.stringify no-string)", () => {
  assert.equal(briefValue(undefined, 50), "undefined");
  assert.equal(briefValue(() => 1, 50), "() => 1");
});

test("buildToolUsageNote: éxito de lectura con args y resultado resumidos", () => {
  const note = buildToolUsageNote({
    name: "clinical.list_lab_results",
    args: { patient_id: "p1" },
    outcome: { status: "success", content: [{ id: "l1" }, { id: "l2" }] },
  });
  assert.ok(note.startsWith("Herramienta clinical.list_lab_results("));
  assert.ok(note.includes('"patient_id":"p1"'));
  assert.ok(note.includes("[n=2]"));
});

test("buildToolUsageNote: error (incluye tool desconocida/args inválidos)", () => {
  const note = buildToolUsageNote({
    name: "clinical.nope",
    args: {},
    outcome: { status: "error", message: "Herramienta desconocida" },
  });
  assert.ok(note.includes("falló: Herramienta desconocida"));
});

test("buildToolUsageNote: una tool ui.* anota la interfaz, no el spec completo", () => {
  const spec = { kind: "chart", title: "Actividad", data: [{ x: 1, y: 2 }] };
  const note = buildToolUsageNote({
    name: "ui.render_chart",
    args: { title: "Actividad" },
    outcome: { status: "success", content: spec },
  });
  // isUiSpec valida forma: si el spec de prueba no pasa la lista blanca, cae al resumen genérico;
  // ambas variantes son válidas siempre que NO vuelque el spec entero sin tope.
  assert.ok(note.length < 200 + TOOL_NOTE_RESULT_CHARS);
  assert.ok(note.startsWith("Herramienta ui.render_chart("));
});

test("buildRejectedWriteNote: informativa, con acción/recurso/resumen y sin re-proponer", () => {
  const note = buildRejectedWriteNote({
    actionType: "create",
    targetResource: "appointments",
    humanReadableSummary: "Agendar control en 2 semanas.",
  });
  assert.ok(note.includes("RECHAZADA"));
  assert.ok(note.includes("create → appointments"));
  assert.ok(note.includes("Agendar control en 2 semanas."));
  assert.ok(note.includes("No volver a proponerla"));
});

test("toolNotesContextText: null sin notas; con notas arma el bloque con viñetas", () => {
  assert.equal(toolNotesContextText([]), null);
  assert.equal(toolNotesContextText(["  "]), null);
  const block = toolNotesContextText(["nota A", "nota B"]);
  assert.ok(block?.includes("Uso de herramientas de este turno"));
  assert.ok(block?.includes("- nota A\n- nota B"));
});
