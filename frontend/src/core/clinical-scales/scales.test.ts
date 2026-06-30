import test from "node:test";
import assert from "node:assert/strict";

import {
  buildComputePayload,
  hasNoErrors,
  initialInputValues,
  type ScaleDefinition,
} from "./scales.ts";

const SCALE: ScaleDefinition = {
  id: "qsofa",
  name: "qSOFA",
  description: "Quick SOFA",
  source: "Seymour et al., JAMA 2016",
  inputs: [
    { key: "altered_mental_status", label: "Estado mental alterado", type: "boolean" },
    { key: "resp_rate", label: "Frecuencia respiratoria", type: "number", min: 0, max: 80 },
    {
      key: "severity",
      label: "Severidad",
      type: "enum",
      allowed_values: ["leve", "moderada", "grave"],
    },
  ],
};

test("initialInputValues: boolean='false', enum/number vacíos", () => {
  assert.deepEqual(initialInputValues(SCALE), {
    altered_mental_status: "false",
    resp_rate: "",
    severity: "",
  });
});

test("buildComputePayload: coerciona tipos y no marca errores cuando todo es válido", () => {
  const payload = buildComputePayload(SCALE, {
    altered_mental_status: "true",
    resp_rate: "24",
    severity: "grave",
  });
  assert.equal(hasNoErrors(payload), true);
  assert.deepEqual(payload.inputs, {
    altered_mental_status: true,
    resp_rate: 24,
    severity: "grave",
  });
});

test("buildComputePayload: marca faltantes (enum/number vacíos); boolean nunca falta", () => {
  const payload = buildComputePayload(SCALE, {
    altered_mental_status: "",
    resp_rate: "",
    severity: "",
  });
  assert.equal(hasNoErrors(payload), false);
  assert.equal(payload.inputs.altered_mental_status, false); // boolean vacío → false
  assert.ok(payload.errors.resp_rate);
  assert.ok(payload.errors.severity);
  assert.equal(payload.errors.altered_mental_status, undefined);
});

test("buildComputePayload: number fuera de rango y enum inválido", () => {
  const high = buildComputePayload(SCALE, { altered_mental_status: "false", resp_rate: "120", severity: "leve" });
  assert.equal(high.errors.resp_rate, "Máximo 80.");
  const bad = buildComputePayload(SCALE, { altered_mental_status: "false", resp_rate: "20", severity: "x" });
  assert.equal(bad.errors.severity, "Selecciona un valor válido.");
  const nan = buildComputePayload(SCALE, { altered_mental_status: "false", resp_rate: "abc", severity: "leve" });
  assert.equal(nan.errors.resp_rate, "Debe ser un número.");
});
