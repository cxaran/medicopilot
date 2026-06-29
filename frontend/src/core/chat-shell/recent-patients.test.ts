import test from "node:test";
import assert from "node:assert/strict";

import { toRecentPatient, toRecentPatients } from "./recent-patients.ts";
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
