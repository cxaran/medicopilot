import test from "node:test";
import assert from "node:assert/strict";

import {
  medicationSource,
  sourceLabel,
  type ConsolidatedMedication,
} from "./reconciliation.ts";

function med(prescribed: number, reported: number): ConsolidatedMedication {
  return {
    key: "k",
    display_name: "Med",
    ingredient_or_class: null,
    resolver_status: "no_disponible",
    prescribed_refs: Array.from({ length: prescribed }, (_, i) => `p${i}`),
    reported_refs: Array.from({ length: reported }, (_, i) => `r${i}`),
  };
}

test("medicationSource: prescrito/reportado/ambos/ninguno", () => {
  assert.equal(medicationSource(med(1, 1)), "both");
  assert.equal(medicationSource(med(2, 0)), "prescribed");
  assert.equal(medicationSource(med(0, 3)), "reported");
  assert.equal(medicationSource(med(0, 0)), "none");
});

test("sourceLabel: etiquetas en español", () => {
  assert.equal(sourceLabel("both"), "Prescrito y reportado");
  assert.equal(sourceLabel("prescribed"), "Solo prescrito");
  assert.match(sourceLabel("reported"), /reportado/);
  assert.equal(sourceLabel("none"), "Sin origen");
});
