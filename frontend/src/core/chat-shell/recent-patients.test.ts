import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeRecentPatients,
  rankRecentPatients,
  recentPatientFromLabel,
  toChatActivityRanking,
  toRecentPatient,
  toRecentPatients,
} from "./recent-patients.ts";
import type { RecentPatient } from "./recent-patients.ts";
import type { ResourceRow } from "../resources/list-types.ts";

// SHELL CHAT-FIRST (MP-CTRL-0122): la lista de pacientes/chats sale del CONTRATO de recursos. Este
// módulo sólo deriva la etiqueta de display + inicial de las filas que el backend ya devuelve; no
// inventa datos ni asume un esquema fijo.

test("toRecentPatient: usa el nombre del contrato y deriva la inicial", () => {
  const row: ResourceRow = { id: "p1", full_name: "ana ruiz", phone: "555" };
  const patient = toRecentPatient(row);
  assert.deepEqual(patient, { id: "p1", label: "ana ruiz", initial: "A" });
});

test("toRecentPatient: sin campo de nombre cae al id como etiqueta", () => {
  const patient = toRecentPatient({ id: "abc-123" });
  assert.equal(patient?.label, "abc-123");
  assert.equal(patient?.initial, "A");
});

test("toRecentPatient: fila sin id usable -> null (no se inventa)", () => {
  assert.equal(toRecentPatient({ full_name: "Sin Id" } as ResourceRow), null);
  assert.equal(toRecentPatient({ id: 123 } as unknown as ResourceRow), null);
});

test("toRecentPatient: respeta el orden de preferencia de campos de nombre", () => {
  const row: ResourceRow = { id: "p1", name: "Secundario", full_name: "Primario" };
  assert.equal(toRecentPatient(row)?.label, "Primario"); // full_name gana
});

test("toRecentPatients: mapea y descarta las filas sin id", () => {
  const rows: ResourceRow[] = [
    { id: "p1", full_name: "Ana" },
    { full_name: "Sin id" } as ResourceRow,
    { id: "p2", nombre: "Beto" },
  ];
  const out = toRecentPatients(rows);
  assert.deepEqual(
    out.map((p) => p.id),
    ["p1", "p2"],
  );
  assert.equal(out[1].label, "Beto"); // usa 'nombre' cuando no hay full_name
});

// ORDEN POR ACTIVIDAD DE CHAT: el ranking sale de las conversaciones del contrato (updated_at es
// la última actividad —el backend la marca al agregar mensajes—; created_at si el hilo no tiene
// mensajes aún). El chat global (patient_id nulo) no cuenta.

function chip(id: string): RecentPatient {
  return { id, label: id.toUpperCase(), initial: id.charAt(0).toUpperCase() };
}

test("toChatActivityRanking: ordena por updated_at (o created_at) descendente", () => {
  const rows: ResourceRow[] = [
    { id: "c1", patient_id: "p1", created_at: "2026-06-01T10:00:00Z", updated_at: "2026-06-10T10:00:00Z" },
    { id: "c2", patient_id: "p2", created_at: "2026-06-20T10:00:00Z", updated_at: null },
    { id: "c3", patient_id: "p3", created_at: "2026-06-05T10:00:00Z", updated_at: "2026-06-30T10:00:00Z" },
  ];
  assert.deepEqual(toChatActivityRanking(rows), ["p3", "p2", "p1"]);
});

test("toChatActivityRanking: ignora el chat global y toma el hilo más reciente por paciente", () => {
  const rows: ResourceRow[] = [
    { id: "g", patient_id: null, updated_at: "2026-06-30T10:00:00Z" },
    { id: "c1", patient_id: "p1", updated_at: "2026-06-10T10:00:00Z" },
    { id: "c2", patient_id: "p1", updated_at: "2026-06-25T10:00:00Z" },
    { id: "c3", patient_id: "p2", updated_at: "2026-06-20T10:00:00Z" },
    { id: "c4", patient_id: "p3", created_at: "no-es-fecha" },
  ];
  assert.deepEqual(toChatActivityRanking(rows), ["p1", "p2"]);
});

test("rankRecentPatients: con chat primero (por actividad), el resto conserva su orden", () => {
  const patients = [chip("p1"), chip("p2"), chip("p3"), chip("p4")];
  const out = rankRecentPatients(patients, ["p3", "p1"]);
  assert.deepEqual(
    out.map((p) => p.id),
    ["p3", "p1", "p2", "p4"],
  );
});

test("rankRecentPatients: sin ranking no reordena (degradación al orden del contrato)", () => {
  const patients = [chip("p1"), chip("p2")];
  assert.deepEqual(
    rankRecentPatients(patients, []).map((p) => p.id),
    ["p1", "p2"],
  );
});

test("mergeRecentPatients: bumps al frente, sin duplicados y acotado", () => {
  const bumps = [chip("p3"), chip("p1")];
  const served = [chip("p1"), chip("p2"), chip("p3"), chip("p4")];
  assert.deepEqual(
    mergeRecentPatients(bumps, served, 3).map((p) => p.id),
    ["p3", "p1", "p2"],
  );
});

test("recentPatientFromLabel: deriva la inicial y cae al id si la etiqueta viene vacía", () => {
  assert.deepEqual(recentPatientFromLabel("p1", "ana ruiz"), {
    id: "p1",
    label: "ana ruiz",
    initial: "A",
  });
  assert.deepEqual(recentPatientFromLabel("p9", "  "), { id: "p9", label: "p9", initial: "P" });
});
