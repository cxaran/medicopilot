import test from "node:test";
import assert from "node:assert/strict";

import {
  ApprovalStore,
  applyApprovalDecision,
  buildClinicalActionPlan,
} from "./approval-protocol.ts";
import { getTool, type ToolDefinition } from "./tools/registry.ts";

const writeTool = getTool("clinical.create_consultation_draft") as ToolDefinition;

const writeArgs = {
  patient_id: "p-1",
  attending_doctor_id: "d-1",
  reason_for_visit: "Control de presión arterial",
};

// --- buildClinicalActionPlan (plan canónico inmutable) ---

test("buildClinicalActionPlan: deriva tipo/recurso/resumen (español) y payload exacto de la metadata", () => {
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  assert.equal(plan.actionType, "create_consultation_draft");
  assert.equal(plan.targetResource, "consultations");
  assert.match(plan.humanReadableSummary, /BORRADOR/);
  assert.match(plan.humanReadableSummary, /Control de presión arterial/);
  assert.deepEqual(plan.exactPayload, writeArgs);
});

test("buildClinicalActionPlan: el plan y su payload son INMUTABLES (no hay mutación silenciosa)", () => {
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.exactPayload));
  // Mutar el payload no tiene efecto (congelado); el médico aprueba lo que vio.
  assert.throws(() => {
    "use strict";
    (plan.exactPayload as Record<string, unknown>).patient_id = "OTRO";
  });
  assert.equal(plan.exactPayload.patient_id, "p-1");
  // Copiar los args de origen y mutarlos no afecta al plan ya construido.
  const mutableArgs = { ...writeArgs };
  const plan2 = buildClinicalActionPlan(writeTool, mutableArgs);
  mutableArgs.reason_for_visit = "CAMBIADO";
  assert.equal(plan2.exactPayload.reason_for_visit, "Control de presión arterial");
});

test("buildClinicalActionPlan: tool de escritura SIN metadata cae a un resumen genérico", () => {
  const bare: ToolDefinition = {
    name: "clinical.create_something",
    description: "x",
    kind: "write",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: true },
    execute: async () => ({}),
  };
  const plan = buildClinicalActionPlan(bare, { a: 1 });
  assert.equal(plan.actionType, "clinical.create_something");
  assert.equal(plan.targetResource, "desconocido");
  assert.match(plan.humanReadableSummary, /acción de escritura/);
  assert.deepEqual(plan.exactPayload, { a: 1 });
});

// --- ApprovalStore (solicitud creada al pedir escritura; el turno espera) ---

test("ApprovalStore.request: crea una solicitud pendiente + evento requested", () => {
  const store = new ApprovalStore();
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  const { request, event } = store.request({
    id: "req-1",
    turnId: "t-1",
    callId: "call-1",
    toolName: writeTool.name,
    plan,
  });
  assert.equal(request.status, "requested");
  assert.equal(event.type, "approval.requested");
  // El turno "espera": la solicitud queda pendiente hasta la decisión del médico.
  assert.deepEqual(store.pendingForTurn("t-1").map((r) => r.id), ["req-1"]);
  assert.deepEqual(store.pendingForTurn("otro-turno"), []);
});

// --- applyApprovalDecision (aprobar ejecuta; rechazar descarta) ---

test("applyApprovalDecision: aprobar -> execute con el plan inmutable aprobado", () => {
  const store = new ApprovalStore();
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  store.request({ id: "req-1", turnId: "t-1", callId: "call-1", toolName: writeTool.name, plan });

  const outcome = applyApprovalDecision(store, "req-1", "approved");
  assert.equal(outcome.kind, "execute");
  if (outcome.kind === "execute") {
    assert.equal(outcome.request.status, "approved");
    assert.equal(outcome.event.type, "approval.approved");
    // Se ejecuta EXACTAMENTE el payload mostrado.
    assert.deepEqual(outcome.request.plan.exactPayload, writeArgs);
  }
  // Ya no queda pendiente.
  assert.deepEqual(store.pendingForTurn("t-1"), []);
});

test("applyApprovalDecision: rechazar -> discard con tool_result de rechazo (no se escribe nada)", () => {
  const store = new ApprovalStore();
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  store.request({ id: "req-1", turnId: "t-1", callId: "call-1", toolName: writeTool.name, plan });

  const outcome = applyApprovalDecision(store, "req-1", "rejected");
  assert.equal(outcome.kind, "discard");
  if (outcome.kind === "discard") {
    assert.equal(outcome.request.status, "rejected");
    assert.equal(outcome.event.type, "approval.rejected");
    assert.equal(outcome.result.status, "error");
    if (outcome.result.status === "error") {
      assert.equal(outcome.result.code, "rejected_by_user");
    }
  }
});

test("applyApprovalDecision: una solicitud no se resuelve dos veces (noop)", () => {
  const store = new ApprovalStore();
  const plan = buildClinicalActionPlan(writeTool, writeArgs);
  store.request({ id: "req-1", turnId: "t-1", callId: "call-1", toolName: writeTool.name, plan });

  assert.equal(applyApprovalDecision(store, "req-1", "approved").kind, "execute");
  // Segundo intento (p. ej. doble clic o rechazar tras aprobar): sin efecto.
  assert.equal(applyApprovalDecision(store, "req-1", "rejected").kind, "noop");
  assert.equal(store.get("req-1")?.status, "approved");
});

test("applyApprovalDecision: solicitud desconocida -> noop", () => {
  const store = new ApprovalStore();
  assert.equal(applyApprovalDecision(store, "inexistente", "approved").kind, "noop");
});
