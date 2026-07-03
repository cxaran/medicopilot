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

test("RECORD_TABS: 10 pestañas en el orden del diseño (datos generales primero)", () => {
  assert.deepEqual(
    RECORD_TABS.map((tab) => tab.id),
    ["general", "historia", "consultas", "notas", "signos", "recetas", "laboratorio", "seguimiento", "archivos", "citas"],
  );
});

test("RECORD_TABS: cada pestaña mapea a su(s) recurso(s) del contrato con su ámbito", () => {
  const byId = Object.fromEntries(RECORD_TABS.map((tab) => [tab.id, tab]));
  // Datos generales = ficha del PROPIO paciente (detalle, no lista filtrada).
  assert.equal(byId.general.resources[0].resourceName, "patients");
  assert.equal(byId.general.resources[0].scope, "detail");
  assert.deepEqual(
    byId.historia.resources.map((r) => r.resourceName),
    ["medical_history_versions", "patient_history_items", "patient_clinical_items", "patient_immunizations"],
  );
  assert.equal(byId.consultas.resources[0].resourceName, "consultations");
  assert.equal(byId.notas.resources[0].resourceName, "clinical_notes");
  assert.deepEqual(
    byId.laboratorio.resources.map((r) => r.resourceName),
    ["lab_results", "study_orders", "scale_results"],
  );
  assert.deepEqual(
    byId.seguimiento.resources.map((r) => r.resourceName),
    ["clinical_tasks", "clinical_events"],
  );
  assert.equal(byId.archivos.resources[0].resourceName, "clinical_documents");
  assert.equal(byId.citas.resources[0].resourceName, "appointments");
  // Recursos patient-scoped (verificado contra filter_fields del registry). Signos y
  // recetas también: su patient_id se deriva de la consulta en el backend.
  assert.equal(byId.consultas.resources[0].scope, "patient");
  assert.equal(byId.notas.resources[0].scope, "patient");
  assert.equal(byId.laboratorio.resources[0].scope, "patient");
  assert.equal(byId.seguimiento.resources[0].scope, "patient");
  assert.equal(byId.signos.resources[0].scope, "patient");
  assert.equal(byId.recetas.resources[0].scope, "patient");
  assert.equal(byId.citas.resources[0].scope, "patient");
});

test("resolveRecordTab: válido pasa; inválido/ausente cae al default", () => {
  assert.equal(resolveRecordTab("consultas"), "consultas");
  assert.equal(resolveRecordTab("signos"), "signos");
  assert.equal(resolveRecordTab("inexistente"), DEFAULT_RECORD_TAB);
  assert.equal(resolveRecordTab(undefined), DEFAULT_RECORD_TAB);
  assert.equal(resolveRecordTab(null), DEFAULT_RECORD_TAB);
  assert.equal(DEFAULT_RECORD_TAB, "general");
});

test("recordTabDef: devuelve la definición por id (o la primera)", () => {
  assert.equal(recordTabDef("citas").label, "Citas");
  assert.equal(recordTabDef("historia").resources.length, 4);
});
