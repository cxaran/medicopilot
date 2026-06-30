import test from "node:test";
import assert from "node:assert/strict";

import { reviewContextFromCatalog, type CatalogResourceLike } from "./detected-actions.ts";
import {
  buildRecordUpdate,
  buildRecordUpdateSubmission,
  type RecordUpdateSpec,
} from "./record-update.ts";
import { getTool, type ToolDefinition, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";
import { isUiSpec } from "./ui-spec.ts";

// COMPARACIÓN DEDICADA ANTES/DESPUÉS de una ACTUALIZACIÓN (MP-CTRL-0137). El módulo es PURO: dado el
// estado actual de un registro + los valores propuestos, valida el permiso de EDICIÓN (forms.update),
// descarta campos fuera del esquema y calcula el diff campo-a-campo. NADA escribe; al confirmar pide al
// agente aplicar la edición por la tool de actualización (P1).

// Catálogo proyectado por permiso: el actor PUEDE editar recetas y pacientes (forms.update presente),
// pero NO órdenes de estudio (sólo create) ni nada de un recurso desconocido.
const CATALOG: CatalogResourceLike[] = [
  {
    name: "prescriptions",
    forms: {
      create: { fields: [{ name: "observations" }] },
      update: { fields: [{ name: "dosage" }, { name: "frequency" }, { name: "observations" }] },
    },
  },
  {
    name: "patients",
    forms: {
      create: { fields: [{ name: "full_name", required: true }] },
      update: { fields: [{ name: "full_name" }, { name: "birth_date" }, { name: "phone" }] },
    },
  },
  // Editable: NO (sólo create). Sirve para probar el bloqueo por falta de permiso de edición.
  { name: "study_orders", forms: { create: { fields: [{ name: "study_name" }] } } },
];

const ctx = reviewContextFromCatalog(CATALOG);

test("reviewContextFromCatalog deriva updatable/updateSchemaFields desde forms.update", () => {
  assert.ok(ctx.updatable?.has("prescriptions"));
  assert.ok(ctx.updatable?.has("patients"));
  assert.ok(!ctx.updatable?.has("study_orders")); // sólo create → no editable
  assert.deepEqual([...(ctx.updateSchemaFields?.get("prescriptions") ?? [])], [
    "dosage",
    "frequency",
    "observations",
  ]);
});

test("buildRecordUpdate: diff campo-a-campo (cambiado + agregado) y descarte fuera de esquema", () => {
  const result = buildRecordUpdate(
    {
      target_resource: "prescriptions",
      resource_id: "rx_1",
      current_values: { dosage: "500 mg", frequency: "cada 12 h" },
      proposed_values: {
        dosage: "850 mg", // cambia
        observations: "tomar con alimentos", // se agrega
        inventado: "x", // fuera del esquema de edición → descartado
      },
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const spec = result.spec;
  assert.equal(spec.kind, "record_update");
  assert.equal(spec.disposition, "update");
  assert.equal(spec.reason, null);
  assert.ok(spec.dropped_fields.includes("inventado"));
  assert.ok(!("inventado" in spec.values));

  const changed = spec.diff.find((d) => d.field === "dosage");
  const added = spec.diff.find((d) => d.field === "observations");
  assert.equal(changed?.change, "changed");
  assert.equal(changed?.before, "500 mg");
  assert.equal(changed?.after, "850 mg");
  assert.equal(added?.change, "added");
  assert.equal(added?.before, undefined);
  assert.equal(added?.after, "tomar con alimentos");
  // frequency no se propuso → no aparece en el diff (ausencia ≠ cambio).
  assert.ok(!spec.diff.some((d) => d.field === "frequency"));
});

test("buildRecordUpdate: sin permiso de EDICIÓN → bloqueada con motivo, sin diff", () => {
  const result = buildRecordUpdate(
    {
      target_resource: "study_orders", // sólo create, no editable
      resource_id: "so_1",
      current_values: { study_name: "BH" },
      proposed_values: { study_name: "BH y QS" },
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.spec.disposition, "blocked");
  assert.match(result.spec.reason ?? "", /permiso para editar/);
  assert.equal(result.spec.diff.length, 0);
});

test("buildRecordUpdate: recurso desconocido → bloqueada con motivo", () => {
  const result = buildRecordUpdate(
    { target_resource: "foo", resource_id: "x", current_values: {}, proposed_values: { a: 1 } },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.spec.disposition, "blocked");
  assert.match(result.spec.reason ?? "", /desconocido/);
});

test("buildRecordUpdate: valores iguales a los actuales → diff vacío (nada que aplicar)", () => {
  const result = buildRecordUpdate(
    {
      target_resource: "patients",
      resource_id: "p_1",
      current_values: { full_name: "Juan López", phone: "8331234567" },
      proposed_values: { full_name: "Juan López" },
    },
    ctx,
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.spec.disposition, "update");
  assert.equal(result.spec.diff.length, 0);
});

test("buildRecordUpdate: validaciones de entrada", () => {
  const noResource = buildRecordUpdate(
    { target_resource: "", resource_id: "x", current_values: {}, proposed_values: { a: 1 } },
    ctx,
  );
  assert.ok(!noResource.ok);
  const noId = buildRecordUpdate(
    { target_resource: "patients", resource_id: "", current_values: {}, proposed_values: { a: 1 } },
    ctx,
  );
  assert.ok(!noId.ok);
  const noProposed = buildRecordUpdate(
    { target_resource: "patients", resource_id: "p", current_values: {}, proposed_values: {} },
    ctx,
  );
  assert.ok(!noProposed.ok);
});

test("buildRecordUpdateSubmission: describe el diff y pide aplicar por P1; bloqueada no pide escritura", () => {
  const ok = buildRecordUpdate(
    {
      target_resource: "prescriptions",
      resource_id: "rx_1",
      current_values: { dosage: "500 mg" },
      proposed_values: { dosage: "850 mg", inventado: "x" },
    },
    ctx,
  );
  assert.ok(ok.ok);
  if (!ok.ok) return;
  const msg = buildRecordUpdateSubmission(ok.spec);
  assert.match(msg, /500 mg → 850 mg/);
  assert.match(msg, /rx_1/);
  assert.match(msg, /aprobación \(P1\)/);
  assert.match(msg, /fuera del esquema de edición/); // reporta el campo descartado

  const blockedSpec: RecordUpdateSpec = {
    ...ok.spec,
    disposition: "blocked",
    reason: "El médico no tiene permiso para editar 'prescriptions'.",
  };
  const blockedMsg = buildRecordUpdateSubmission(blockedSpec);
  assert.match(blockedMsg, /No se puede actualizar/);
  assert.ok(!/aprobación \(P1\)/.test(blockedMsg)); // no pide escritura
});

test("ui.review_record_update: tool de LECTURA que produce un record_update reconocido por el renderizador", async () => {
  const found = getTool("ui.review_record_update");
  assert.ok(found, "falta la tool ui.review_record_update");
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

  const result = await executeTool(found as ToolDefinition, {
    target_resource: "prescriptions",
    resource_id: "rx_1",
    current_values: { dosage: "500 mg" },
    proposed_values: { dosage: "850 mg" },
  }, toolCtx);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(isUiSpec(result.content));
  assert.equal((result.content as { kind: string }).kind, "record_update");
  // P1: la tool sólo consultó el catálogo (lectura); ninguna escritura.
  assert.deepEqual(calls, ["GET /api/v1/resources"]);
});
