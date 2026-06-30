import test from "node:test";
import assert from "node:assert/strict";

import { reviewContextFromCatalog, type CatalogResourceLike } from "./detected-actions.ts";
import { buildOpenRecord, openRecordToContext } from "./open-record.ts";
import { getTool, type ToolDefinition, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";
import { isUiSpec } from "./ui-spec.ts";

// ACCIÓN GOBERNADA "ABRIR EXPEDIENTE" (MP-CTRL-0138). El módulo es PURO: valida que el médico puede VER
// pacientes (el recurso aparece en el catálogo proyectado por permiso) y arma la tarjeta. NADA navega ni
// escribe: el cambio de contexto lo dispara el clic del médico en el host.

const CATALOG: CatalogResourceLike[] = [
  { name: "patients", forms: { create: { fields: [{ name: "full_name", required: true }] } } },
  { name: "consultations", forms: { create: { fields: [{ name: "reason_for_visit" }] } } },
];
const ctx = reviewContextFromCatalog(CATALOG);

test("buildOpenRecord: paciente con permiso de lectura → tarjeta lista", () => {
  const result = buildOpenRecord(
    { patient_id: "p1", patient_label: "Juan López", consultation_id: "c1", consultation_label: "Hoy" },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const spec = result.spec;
  assert.equal(spec.kind, "open_record");
  assert.equal(spec.disposition, "ready");
  assert.equal(spec.reason, null);
  assert.equal(spec.patient_id, "p1");
  assert.equal(spec.patient_label, "Juan López");
  assert.equal(spec.consultation_id, "c1");
  assert.match(spec.label, /Juan López/);
});

test("buildOpenRecord: sin permiso para ver pacientes → bloqueada con motivo", () => {
  // Catálogo sin 'patients' (no proyectado = sin permiso de lectura) pero con otros recursos.
  const noPatients = reviewContextFromCatalog([
    { name: "consultations", forms: { create: { fields: [{ name: "reason_for_visit" }] } } },
  ]);
  const result = buildOpenRecord({ patient_id: "p1", patient_label: "Juan" }, noPatients);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.spec.disposition, "blocked");
  assert.match(result.spec.reason ?? "", /permiso para ver/);
});

test("buildOpenRecord: catálogo vacío no bloquea de más (no disponible ≠ sin permiso)", () => {
  const empty = reviewContextFromCatalog([]);
  const result = buildOpenRecord({ patient_id: "p1" }, empty);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.spec.disposition, "ready");
  // patient_label cae al id cuando no se da nombre.
  assert.equal(result.spec.patient_label, "p1");
});

test("buildOpenRecord: requiere patient_id", () => {
  const result = buildOpenRecord({ patient_id: "" }, ctx);
  assert.ok(!result.ok);
});

test("openRecordToContext: mapea la spec al contexto clínico activo del shell", () => {
  const result = buildOpenRecord(
    { patient_id: "p1", patient_label: "Ana", consultation_id: "c9", consultation_label: "Control" },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(openRecordToContext(result.spec), {
    patientId: "p1",
    patientLabel: "Ana",
    consultationId: "c9",
    consultationLabel: "Control",
  });
});

test("ui.open_record: tool de LECTURA que produce un open_record reconocido por el renderizador", async () => {
  const found = getTool("ui.open_record");
  assert.ok(found, "falta la tool ui.open_record");
  if (!found) return;
  assert.equal(found.kind, "read");
  assert.equal(found.approval, undefined, "una tool ui.* no debe declarar aprobación");

  const calls: string[] = [];
  const toolCtx: ToolExecutionContext = {
    api: (async (path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/v1/resources") return CATALOG;
      throw new Error(`llamada inesperada: ${init?.method ?? "GET"} ${path}`);
    }) as ToolExecutionContext["api"],
    sandbox: async () => ({ ok: true, value: null, logs: [] }),
  };

  const result = await executeTool(
    found as ToolDefinition,
    { patient_id: "p1", patient_label: "Juan López" },
    toolCtx,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(isUiSpec(result.content));
  assert.equal((result.content as { kind: string }).kind, "open_record");
  // Solo lectura: la tool únicamente consultó el catálogo; ninguna escritura.
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});
