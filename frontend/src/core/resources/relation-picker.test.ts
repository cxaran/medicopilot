import test from "node:test";
import assert from "node:assert/strict";

import {
  relationItemId,
  relationItemLabel,
  relationItemSecondary,
  resolveRelationTarget,
} from "./relation-picker.ts";

// --- resolveRelationTarget (resolución campo FK -> recurso destino) ---

test("resolveRelationTarget: patient_id -> patients (etiqueta full_name)", () => {
  const target = resolveRelationTarget("patient_id");
  assert.ok(target);
  assert.equal(target.resource, "patients");
  assert.equal(target.field, "patient_id");
  assert.deepEqual(target.labelFields, ["full_name"]);
});

test("resolveRelationTarget: doctor_id y attending_doctor_id -> doctors", () => {
  assert.equal(resolveRelationTarget("doctor_id")?.resource, "doctors");
  const attending = resolveRelationTarget("attending_doctor_id");
  assert.equal(attending?.resource, "doctors");
  assert.deepEqual(attending?.labelFields, ["professional_name"]);
});

test("resolveRelationTarget: consultation_id -> consultations", () => {
  const target = resolveRelationTarget("consultation_id");
  assert.equal(target?.resource, "consultations");
  assert.deepEqual(target?.labelFields, ["reason_for_visit"]);
});

test("resolveRelationTarget: FK sin mapeo y campos no-FK devuelven null", () => {
  // FK aún no cubierta -> cae al input de texto manual (sin regresión).
  assert.equal(resolveRelationTarget("appointment_id"), null);
  assert.equal(resolveRelationTarget("related_diagnosis_id"), null);
  assert.equal(resolveRelationTarget("full_name"), null);
  assert.equal(resolveRelationTarget(""), null);
});

// --- relationItemId / label / secondary ---

test("relationItemId: lee id string y coacciona no-string; null si falta", () => {
  assert.equal(relationItemId({ id: "p-1" }), "p-1");
  assert.equal(relationItemId({ id: 42 }), "42");
  assert.equal(relationItemId({}), null);
  assert.equal(relationItemId({ id: null }), null);
});

test("relationItemLabel: usa el primer labelField con valor; cae al id", () => {
  const target = resolveRelationTarget("patient_id")!;
  assert.equal(relationItemLabel({ id: "p-1", full_name: "Ana López" }, target), "Ana López");
  // Sin full_name -> cae al id.
  assert.equal(relationItemLabel({ id: "p-1", full_name: "" }, target), "p-1");
  assert.equal(relationItemLabel({ id: "p-1" }, target), "p-1");
});

test("relationItemSecondary: primer secondaryField con valor (incluye numéricos)", () => {
  const target = resolveRelationTarget("patient_id")!;
  assert.equal(
    relationItemSecondary({ id: "p-1", record_number: 1024 }, target),
    "1024",
  );
  // Sin record_number ni curp -> null.
  assert.equal(relationItemSecondary({ id: "p-1" }, target), null);
});
