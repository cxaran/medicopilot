import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardData,
  buildPatientLabelMap,
  emptyDashboardData,
  formatShortDateTime,
  formatTimeHM,
  toAgendaItems,
  toAlertItems,
  toConsultationItems,
  type FollowUpSummary,
} from "./dashboard.ts";
import type { ResourceRow } from "../resources/list-types.ts";

// DASHBOARD del inicio (MP-CTRL-0124): modelo de vista PURO sobre las lecturas del CONTRATO. No
// inventa datos; resuelve la etiqueta del paciente desde el mapa y formatea fechas en la zona dada.

test("buildPatientLabelMap: id->nombre desde las filas del contrato (descarta sin id)", () => {
  const map = buildPatientLabelMap([
    { id: "p1", full_name: "Ana Ruiz" },
    { full_name: "Sin id" } as ResourceRow,
    { id: "p2", nombre: "Beto" },
  ]);
  assert.equal(map.get("p1"), "Ana Ruiz");
  assert.equal(map.get("p2"), "Beto");
  assert.equal(map.size, 2);
});

test("formatTimeHM / formatShortDateTime: hora y fecha corta en la zona dada (UTC)", () => {
  assert.equal(formatTimeHM("2026-06-29T14:30:00Z", "UTC"), "14:30");
  assert.equal(formatTimeHM("no-es-fecha", "UTC"), "");
  // Fecha corta + hora; sólo se comprueba que incluye hora y no está vacía (locale-dependiente).
  const short = formatShortDateTime("2026-06-29T14:30:00Z", "UTC");
  assert.ok(short.includes("14:30"));
  assert.equal(formatShortDateTime("x", "UTC"), "");
});

test("toAgendaItems: nombre + motivo + hora + badge de estado; resuelve etiqueta y fallback", () => {
  const labels = new Map([["p1", "Ana Ruiz"]]);
  const rows: ResourceRow[] = [
    { id: "a1", patient_id: "p1", reason: "Control HTA", scheduled_at: "2026-06-29T09:05:00Z", status: "confirmed" },
    { id: "a2", patient_id: "p9", reason: "Primera vez", scheduled_at: "2026-06-29T10:00:00Z", status: "pending" },
  ];
  const items = toAgendaItems(rows, labels, "UTC");
  assert.equal(items[0].patientId, "p1");
  assert.equal(items[0].primary, "Ana Ruiz");
  assert.equal(items[0].secondary, "Control HTA");
  assert.equal(items[0].meta, "09:05");
  assert.deepEqual(items[0].badge, { label: "Confirmada", tone: "ok" });
  // Paciente fuera del mapa -> etiqueta de respaldo, pero sigue siendo clicable (patientId presente).
  assert.equal(items[1].patientLabel, "Paciente");
  assert.equal(items[1].patientId, "p9");
  assert.deepEqual(items[1].badge, { label: "Pendiente", tone: "info" });
});

test("toConsultationItems: nombre + motivo + cuándo (meta a la derecha)", () => {
  const labels = new Map([["p1", "Ana Ruiz"]]);
  const rows: ResourceRow[] = [
    { id: "c1", patient_id: "p1", reason_for_visit: "Dolor torácico", consulted_at: "2026-06-28T16:00:00Z" },
  ];
  const items = toConsultationItems(rows, labels, "UTC");
  assert.equal(items[0].primary, "Ana Ruiz");
  assert.equal(items[0].secondary, "Dolor torácico");
  assert.ok(items[0].meta && items[0].meta.includes("16:00"));
});

test("toAlertItems: aplana labs/tareas/citas con etiqueta del backend y tono", () => {
  const summary: FollowUpSummary = {
    unreviewed_abnormal_labs: [
      { lab_result_id: "l1", patient_id: "p1", patient_label: "Ana Ruiz", analyte_name: "Potasio", abnormal_flag: "critical" },
    ],
    pending_tasks: [
      { task_id: "t1", title: "Llamar al paciente", patient_id: "p2", patient_label: "Beto", overdue: true, priority: "high" },
    ],
    missed_appointments: [
      { appointment_id: "m1", patient_id: "p3", patient_label: "Caro", status: "no_show", reason: "Control" },
    ],
  };
  const items = toAlertItems(summary);
  assert.equal(items.length, 3);
  // Orden: labs -> tareas -> citas.
  assert.equal(items[0].primary, "Laboratorio anormal: Potasio");
  assert.equal(items[0].badge?.tone, "danger");
  assert.equal(items[0].patientId, "p1");
  assert.equal(items[1].primary, "Tarea: Llamar al paciente");
  assert.equal(items[1].badge?.label, "Vencida");
  assert.equal(items[2].primary, "Cita: No asistió");
  assert.equal(items[2].patientId, "p3");
});

test("buildDashboardData / emptyDashboardData: cuentas por tarjeta", () => {
  const data = buildDashboardData({
    agenda: [{ key: "a", patientId: "p1", patientLabel: "Ana", primary: "Ana" }],
    consultations: [],
    alerts: [
      { key: "x", patientId: "p2", patientLabel: "Beto", primary: "Lab" },
      { key: "y", patientId: null, patientLabel: "Paciente", primary: "Tarea" },
    ],
  });
  assert.equal(data.agenda.count, 1);
  assert.equal(data.consultations.count, 0);
  assert.equal(data.alerts.count, 2);

  const empty = emptyDashboardData();
  assert.equal(empty.agenda.count, 0);
  assert.equal(empty.alerts.count, 0);
});
