import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RECORD_TAB,
  RECORD_TABS,
  recordTabDef,
  resolveRecordTab,
} from "./record-tabs.ts";

// RECORD PANEL (MP-CTRL-0125): las pestañas mapean a recursos REGISTRADOS del contrato. Estos tests
// fijan el mapeo verificado contra el registry y el ámbito de filtrado de cada recurso.

test("RECORD_TABS: 6 pestañas en el orden del diseño", () => {
  assert.deepEqual(
    RECORD_TABS.map((tab) => tab.id),
    ["historia", "consultas", "signos", "recetas", "archivos", "citas"],
  );
});

test("RECORD_TABS: cada pestaña mapea a su(s) recurso(s) del contrato con su ámbito", () => {
  const byId = Object.fromEntries(RECORD_TABS.map((tab) => [tab.id, tab]));
  assert.deepEqual(
    byId.historia.resources.map((r) => r.resourceName),
    ["medical_history_versions", "patient_history_items"],
  );
  assert.equal(byId.consultas.resources[0].resourceName, "consultations");
  assert.equal(byId.archivos.resources[0].resourceName, "clinical_documents");
  assert.equal(byId.citas.resources[0].resourceName, "appointments");
  // Recursos patient-scoped vs consultation-scoped (verificado contra filter_fields del registry).
  assert.equal(byId.consultas.resources[0].scope, "patient");
  assert.equal(byId.signos.resources[0].scope, "consultation");
  assert.equal(byId.recetas.resources[0].scope, "consultation");
  assert.equal(byId.citas.resources[0].scope, "patient");
});

test("resolveRecordTab: válido pasa; inválido/ausente cae al default", () => {
  assert.equal(resolveRecordTab("consultas"), "consultas");
  assert.equal(resolveRecordTab("signos"), "signos");
  assert.equal(resolveRecordTab("inexistente"), DEFAULT_RECORD_TAB);
  assert.equal(resolveRecordTab(undefined), DEFAULT_RECORD_TAB);
  assert.equal(resolveRecordTab(null), DEFAULT_RECORD_TAB);
  assert.equal(DEFAULT_RECORD_TAB, "historia");
});

test("recordTabDef: devuelve la definición por id (o la primera)", () => {
  assert.equal(recordTabDef("citas").label, "Citas");
  assert.equal(recordTabDef("historia").resources.length, 2);
});
