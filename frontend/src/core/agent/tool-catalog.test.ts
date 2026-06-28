import test from "node:test";
import assert from "node:assert/strict";

import type { ResourceCatalog } from "@/core/api/contracts";

import {
  buildToolCatalog,
  creatableResources,
  effectiveTools,
  toolSource,
} from "./tool-catalog.ts";
import { buildClinicalActionPlan } from "./approval-protocol.ts";
import { getTool, listTools, type ToolDefinition } from "./tools/registry.ts";

// Catálogo de recursos mínimo (solo lo que lee el gating): name + forms.create presente o no.
function catalog(entries: Array<{ name: string; canCreate: boolean }>): ResourceCatalog {
  return entries.map((entry) => ({
    name: entry.name,
    label: entry.name,
    api_path: `/api/v1/${entry.name}`,
    view: "table",
    actions: [],
    relations: [],
    forms: entry.canCreate ? { create: { method: "POST", url_template: "/x", fields: [], transport: "json" } } : null,
  })) as unknown as ResourceCatalog;
}

const NEW_WRITE_TOOLS: Array<[string, string]> = [
  ["clinical.create_prescription_draft", "prescriptions"],
  ["clinical.create_diagnosis_draft", "consultation_diagnoses"],
  ["clinical.create_appointment_draft", "appointments"],
  ["clinical.create_patient_clinical_item_draft", "patient_clinical_items"],
];

// --- procedencia ---

test("toolSource: mapea por prefijo de nombre", () => {
  assert.equal(toolSource("clinical.create_prescription_draft"), "Clínica");
  assert.equal(toolSource("pubmed.search"), "Investigación");
  assert.equal(toolSource("ui.render_form"), "Interfaz");
  assert.equal(toolSource("sandbox.run_js"), "Utilidad");
});

// --- creatableResources (señal de permiso desde el catálogo) ---

test("creatableResources: solo recursos con forms.create presente", () => {
  const set = creatableResources(
    catalog([
      { name: "consultations", canCreate: true },
      { name: "prescriptions", canCreate: false }, // legible pero sin permiso de creación
      { name: "appointments", canCreate: true },
    ]),
  );
  assert.ok(set.has("consultations"));
  assert.ok(set.has("appointments"));
  assert.ok(!set.has("prescriptions"));
});

// --- gating + provenance ---

test("buildToolCatalog: lecturas siempre declaradas (nunca gateadas)", () => {
  const readTool = getTool("clinical.list_patients") as ToolDefinition;
  const [entry] = buildToolCatalog([readTool], new Set());
  assert.equal(entry.kind, "read");
  assert.equal(entry.status, "declared");
  assert.equal(entry.targetResource, null);
});

test("buildToolCatalog: escritura DECLARADA si su recurso destino es creable", () => {
  const writeTool = getTool("clinical.create_prescription_draft") as ToolDefinition;
  const [entry] = buildToolCatalog([writeTool], new Set(["prescriptions"]));
  assert.equal(entry.kind, "write");
  assert.equal(entry.status, "declared");
  assert.equal(entry.targetResource, "prescriptions");
  assert.equal(entry.reason, null);
});

test("buildToolCatalog: escritura GATEADA con motivo si falta el permiso de creación", () => {
  const writeTool = getTool("clinical.create_prescription_draft") as ToolDefinition;
  const [entry] = buildToolCatalog([writeTool], new Set()); // sin permiso
  assert.equal(entry.status, "gated_out");
  assert.match(entry.reason ?? "", /prescriptions/);
});

test("effectiveTools: excluye escrituras gateadas, conserva lecturas", () => {
  const tools = listTools();
  // Médico que solo puede crear consultas (no recetas/diagnósticos/citas/items).
  const effective = effectiveTools(tools, new Set(["consultations"]));
  const names = effective.map((tool) => tool.name);
  assert.ok(names.includes("clinical.list_patients")); // lectura
  assert.ok(names.includes("clinical.create_consultation_draft")); // creable
  assert.ok(!names.includes("clinical.create_prescription_draft")); // gateada
  assert.ok(!names.includes("clinical.create_appointment_draft")); // gateada
});

test("effectiveTools: sin permisos de creación -> ninguna escritura, solo lecturas", () => {
  const tools = listTools();
  const effective = effectiveTools(tools, new Set());
  assert.ok(effective.every((tool) => tool.kind === "read"));
  assert.ok(effective.length > 0);
});

// --- cada nueva tool de escritura enruta por el protocolo de aprobación (P1) ---

test("cada nueva tool de escritura es write, declara approval y produce un plan canónico", () => {
  for (const [name, resource] of NEW_WRITE_TOOLS) {
    const tool = getTool(name) as ToolDefinition;
    assert.ok(tool, `falta la tool ${name}`);
    assert.equal(tool.kind, "write");
    assert.ok(tool.approval, `${name} debe declarar metadata de aprobación`);
    assert.equal(tool.approval?.targetResource, resource);
    const plan = buildClinicalActionPlan(tool, { foo: "bar" });
    assert.equal(plan.actionType, tool.approval?.actionType);
    assert.equal(plan.targetResource, resource);
    assert.ok(Object.isFrozen(plan.exactPayload));
  }
});
