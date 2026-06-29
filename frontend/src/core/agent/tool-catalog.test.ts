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

test("effectiveTools: sin permisos de creación -> solo lecturas y escrituras owner-scoped", () => {
  const tools = listTools();
  const effective = effectiveTools(tools, new Set());
  const names = effective.map((tool) => tool.name);
  // Las únicas escrituras que sobreviven sin permiso RBAC son las owner-scoped (memorias).
  const writes = effective.filter((tool) => tool.kind === "write");
  assert.ok(writes.every((tool) => tool.approval?.ownerScoped));
  assert.ok(names.includes("memory.remember")); // owner-scoped: siempre disponible
  assert.ok(!names.includes("clinical.create_consultation_draft")); // gateada por rol
  assert.ok(effective.length > 0);
});

test("buildToolCatalog: escritura owner-scoped (memorias) siempre declarada, sin permiso RBAC", () => {
  const remember = getTool("memory.remember") as ToolDefinition;
  const [entry] = buildToolCatalog([remember], new Set()); // sin permisos de creación
  assert.equal(entry.kind, "write");
  assert.equal(entry.status, "declared");
  assert.equal(entry.source, "Memoria");
  assert.equal(entry.reason, null);
});

// --- REGRESIÓN MP-CTRL-0119: la tool de alta de paciente debe surfacearse al rol clínico ---

test("buildToolCatalog: create_patient_draft NO se gatea cuando 'patients' es creable", () => {
  const tool = getTool("clinical.create_patient_draft") as ToolDefinition;
  assert.ok(tool, "falta clinical.create_patient_draft");
  assert.equal(tool.approval?.targetResource, "patients");
  const [entry] = buildToolCatalog([tool], new Set(["patients"]));
  assert.equal(entry.status, "declared"); // declarable (sin descubrimiento a escala)
  assert.notEqual(entry.status, "gated_out");
  assert.equal(entry.reason, null);
});

test("buildToolCatalog: create_patient_draft SÍ se gatea si 'patients' no es creable (la causa raíz)", () => {
  const tool = getTool("clinical.create_patient_draft") as ToolDefinition;
  const [entry] = buildToolCatalog([tool], new Set()); // rol sin patients:create
  assert.equal(entry.status, "gated_out");
  assert.match(entry.reason ?? "", /patients/);
});

test("create_patient_draft es buscable/declarable para el rol clínico (no excluida de searchable)", () => {
  // Con 'patients' creable, la tool sobrevive a effectiveTools -> entra al set 'searchable' de
  // tool_search; sin él quedaba fuera y el agente no podía hallarla (síntoma reportado en vivo).
  const tools = listTools();
  const withPatients = effectiveTools(tools, new Set(["patients"])).map((t) => t.name);
  assert.ok(withPatients.includes("clinical.create_patient_draft"));
  const without = effectiveTools(tools, new Set()).map((t) => t.name);
  assert.ok(!without.includes("clinical.create_patient_draft"));
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
