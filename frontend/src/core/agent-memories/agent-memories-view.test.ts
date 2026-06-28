import test from "node:test";
import assert from "node:assert/strict";

import type { AgentMemoryRead } from "@/core/api/contracts";

import {
  KIND_OPTIONS,
  deleteMemoryConfirmation,
  kindDisplayName,
} from "./agent-memories-view.ts";

function memory(overrides: Partial<AgentMemoryRead> = {}): AgentMemoryRead {
  return {
    id: "m1",
    title: "Alergia a penicilina",
    content: "El paciente es alérgico.",
    kind: "hecho_clinico",
    patient_id: null,
    consultation_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

test("KIND_OPTIONS: cubre los 4 tipos del enum del backend, en orden", () => {
  assert.equal(KIND_OPTIONS.length, 4);
  const values = KIND_OPTIONS.map((option) => option.value);
  assert.deepEqual(values, ["nota", "preferencia", "hecho_clinico", "recordatorio"]);
});

test("kindDisplayName: mapea a etiqueta legible", () => {
  assert.equal(kindDisplayName("nota"), "Nota");
  assert.equal(kindDisplayName("hecho_clinico"), "Hecho clínico");
  assert.equal(kindDisplayName("recordatorio"), "Recordatorio");
});

test("deleteMemoryConfirmation: exige confirmación destructiva con el título", () => {
  const confirmation = deleteMemoryConfirmation(memory({ title: "Preferencia horaria" }));
  assert.equal(confirmation.required, true);
  assert.equal(confirmation.destructive, true);
  assert.equal(confirmation.confirm_label, "Eliminar");
  assert.match(confirmation.message, /Preferencia horaria/);
});
