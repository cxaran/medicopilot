import test from "node:test";
import assert from "node:assert/strict";

import { patientTargetOf, resourceWriteNote, rowActionNote } from "./action-notes.ts";

// BARRIDO DE NOTAS (punto 3 del plan anti-huecos): toda acción humana ejecutada fuera del chat
// (acciones de fila, formularios de /resources) deja una nota compacta DETERMINISTA dirigida al
// chat de su paciente. Nunca la genera el modelo; las filas sin paciente no emiten.

test("patientTargetOf: usa patient_id de la fila cuando existe", () => {
  assert.equal(patientTargetOf("appointments", "row-1", { patient_id: "pac-9" }), "pac-9");
});

test("patientTargetOf: para 'patients' la fila misma es el paciente (id de la fila o rowId)", () => {
  assert.equal(patientTargetOf("patients", null, { id: "pac-3" }), "pac-3");
  assert.equal(patientTargetOf("patients", "pac-4", {}), "pac-4");
});

test("patientTargetOf: recursos administrativos sin paciente no emiten (null)", () => {
  assert.equal(patientTargetOf("users", "u-1", { id: "u-1" }), null);
  assert.equal(patientTargetOf("appointments", "row-2", { patient_id: 42 }), null);
});

test("rowActionNote: nota dirigida al paciente de la fila", () => {
  const note = rowActionNote("Cancelar", "appointments", "cita-7", { patient_id: "pac-1" });
  assert.deepEqual(note, {
    text: "⚙️ Cancelar — appointments (id cita-7)",
    target: "pac-1",
  });
});

test("rowActionNote: fila sin paciente -> sin nota", () => {
  assert.equal(rowActionNote("Desactivar", "roles", "rol-1", {}), null);
});

test("resourceWriteNote: alta con respuesta del backend (id + patient_id)", () => {
  const note = resourceWriteNote("create", "vital_signs", "Signos vitales", {
    id: "vs-1",
    patient_id: "pac-2",
  });
  assert.deepEqual(note, {
    text: "📝 Signos vitales creado (id vs-1)",
    target: "pac-2",
  });
});

test("resourceWriteNote: edición usa la fila previa si la respuesta no proyecta paciente", () => {
  const note = resourceWriteNote(
    "update",
    "appointments",
    "Citas",
    { id: "cita-9" },
    { patient_id: "pac-5" },
  );
  assert.deepEqual(note, { text: "📝 Citas actualizado (id cita-9)", target: "pac-5" });
});

test("resourceWriteNote: respuesta no-objeto o recurso sin paciente -> sin nota", () => {
  assert.equal(resourceWriteNote("create", "roles", "Roles", { id: "rol-2" }), null);
  assert.equal(resourceWriteNote("create", "appointments", "Citas", "ok"), null);
});
