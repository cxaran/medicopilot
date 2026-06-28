import test from "node:test";
import assert from "node:assert/strict";

import {
  activeContextChipText,
  buildActiveContextMessage,
  recallScopeFor,
  type ActiveClinicalContext,
} from "./active-context.ts";

function ctx(partial: Partial<ActiveClinicalContext> = {}): ActiveClinicalContext {
  return {
    patientId: "p-1",
    patientLabel: "Juan Pérez",
    consultationId: null,
    consultationLabel: null,
    ...partial,
  };
}

// --- ámbito de recall derivado del contexto ---

test("recallScopeFor: con paciente activo arma el ámbito por paciente/consulta", () => {
  const scope = recallScopeFor(ctx({ consultationId: "c-1", consultationLabel: "Control" }));
  assert.equal(scope.patientId, "p-1");
  assert.equal(scope.consultationId, "c-1");
});

test("recallScopeFor: sin contexto -> ámbito vacío (owner-scoped por recencia)", () => {
  const scope = recallScopeFor(null);
  assert.equal(scope.patientId, undefined);
  assert.equal(scope.consultationId, undefined);
});

test("recallScopeFor: propaga el límite cuando se pasa", () => {
  assert.equal(recallScopeFor(null, 3).limit, 3);
  assert.equal(recallScopeFor(ctx(), 5).limit, 5);
});

// --- chip indicador ---

test("activeContextChipText: muestra el nombre del paciente activo", () => {
  assert.equal(activeContextChipText(ctx()), "Paciente activo: Juan Pérez");
});

test("activeContextChipText: incluye la consulta cuando está fijada", () => {
  const text = activeContextChipText(ctx({ consultationId: "c-1", consultationLabel: "Control mensual" }));
  assert.match(text, /Paciente activo: Juan Pérez/);
  assert.match(text, /Consulta: Control mensual/);
});

// --- mensaje de turno (surface del ámbito, instrucción de confianza) ---

test("buildActiveContextMessage: null cuando no hay contexto (no ensucia el turno)", () => {
  assert.equal(buildActiveContextMessage(null), null);
});

test("buildActiveContextMessage: mensaje system con paciente y recordatorio de aprobación", () => {
  const message = buildActiveContextMessage(ctx());
  assert.ok(message);
  assert.equal(message?.role, "system");
  const text = message?.content[0]?.type === "text" ? message.content[0].text : "";
  assert.match(text, /CONTEXTO CLÍNICO ACTIVO/);
  assert.match(text, /Juan Pérez/);
  assert.match(text, /p-1/);
  assert.match(text, /aprobación del médico/);
});

test("buildActiveContextMessage: incluye la consulta activa cuando existe", () => {
  const message = buildActiveContextMessage(ctx({ consultationId: "c-1", consultationLabel: "Control" }));
  const text = message?.content[0]?.type === "text" ? message.content[0].text : "";
  assert.match(text, /Control/);
  assert.match(text, /c-1/);
});
