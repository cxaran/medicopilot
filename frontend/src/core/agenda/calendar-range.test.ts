import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addMonths,
  avatarColor,
  bucketDay,
  bucketMonth,
  bucketWeek,
  civilDateOf,
  computeRange,
  daysInMonth,
  deriveStats,
  formatCivilDate,
  parseCivilDate,
  stepAnchor,
  toAgendaAppointments,
  weekdayMonday0,
  type CivilDate,
} from "./calendar-range.ts";
import type { ResourceRow } from "../resources/list-types.ts";

// AGENDA en calendario (MP-CTRL-0135): módulo PURO. Toda la matemática de fechas es sobre fechas
// CIVILES y DST-safe (se suma sobre UTC). Las citas se reparten por su DÍA CIVIL en la zona dada y los
// contadores salen del MISMO conjunto. Sin red ni React.

test("parse/format de fecha civil: ida y vuelta y rechazo de inválidas", () => {
  assert.equal(formatCivilDate({ year: 2026, month: 5, day: 3 }), "2026-05-03");
  assert.deepEqual(parseCivilDate("2026-05-03"), { year: 2026, month: 5, day: 3 });
  assert.equal(parseCivilDate("2026-13-01"), null); // mes inválido
  assert.equal(parseCivilDate("2026-02-30"), null); // día inexistente
  assert.equal(parseCivilDate("no-fecha"), null);
});

test("addDays cruza fin de mes y addMonths acota el día al mes destino", () => {
  assert.deepEqual(addDays({ year: 2026, month: 5, day: 31 }, 1), { year: 2026, month: 6, day: 1 });
  assert.deepEqual(addDays({ year: 2026, month: 1, day: 1 }, -1), { year: 2025, month: 12, day: 31 });
  // 31 de enero + 1 mes -> febrero no tiene 31; se acota a 28 (2026 no bisiesto).
  assert.deepEqual(addMonths({ year: 2026, month: 1, day: 31 }, 1), { year: 2026, month: 2, day: 28 });
  assert.deepEqual(addMonths({ year: 2026, month: 12, day: 15 }, 1), { year: 2027, month: 1, day: 15 });
  assert.equal(daysInMonth(2024, 2), 29); // bisiesto
  assert.equal(daysInMonth(2026, 2), 28);
});

test("weekdayMonday0: lunes=0 ... domingo=6", () => {
  // 2026-06-29 es lunes.
  assert.equal(weekdayMonday0({ year: 2026, month: 6, day: 29 }), 0);
  // 2026-06-28 es domingo.
  assert.equal(weekdayMonday0({ year: 2026, month: 6, day: 28 }), 6);
});

test("computeRange: día, semana (lun-dom) y mes (rejilla de semanas completas)", () => {
  const anchor: CivilDate = { year: 2026, month: 6, day: 24 }; // miércoles
  // Día: [anchor, anchor].
  assert.deepEqual(computeRange("day", anchor), { start: anchor, end: anchor });
  // Semana: lunes 22 .. domingo 28.
  assert.deepEqual(computeRange("week", anchor), {
    start: { year: 2026, month: 6, day: 22 },
    end: { year: 2026, month: 6, day: 28 },
  });
  // Mes junio 2026: 1 jun = lunes -> la rejilla arranca el propio 1; 30 jun = martes -> termina el
  // domingo 5 de julio.
  assert.deepEqual(computeRange("month", anchor), {
    start: { year: 2026, month: 6, day: 1 },
    end: { year: 2026, month: 7, day: 5 },
  });
});

test("stepAnchor avanza/retrocede en la unidad del modo", () => {
  const a: CivilDate = { year: 2026, month: 6, day: 24 };
  assert.deepEqual(stepAnchor("day", a, 1), { year: 2026, month: 6, day: 25 });
  assert.deepEqual(stepAnchor("day", a, -1), { year: 2026, month: 6, day: 23 });
  assert.deepEqual(stepAnchor("week", a, 1), { year: 2026, month: 7, day: 1 });
  assert.deepEqual(stepAnchor("month", a, -1), { year: 2026, month: 5, day: 24 });
});

test("civilDateOf: mapea el instante a su día civil en la zona (y maneja inválidas)", () => {
  // 03:00Z del 25 jun. En UTC es el 25; en México (UTC-6) es aún el 24.
  assert.equal(civilDateOf("2026-06-25T03:00:00Z", "UTC"), "2026-06-25");
  assert.equal(civilDateOf("2026-06-25T03:00:00Z", "America/Mexico_City"), "2026-06-24");
  assert.equal(civilDateOf("no-fecha", "UTC"), null);
});

function row(over: Partial<ResourceRow>): ResourceRow {
  return {
    id: "a1",
    patient_id: "p1",
    scheduled_at: "2026-06-24T15:00:00Z",
    duration_minutes: 30,
    reason: "Control",
    status: "confirmed",
    ...over,
  } as ResourceRow;
}

test("toAgendaAppointments: resuelve etiqueta, ordena por hora y descarta sin fecha válida", () => {
  const labels = new Map([
    ["p1", "Ana Ruiz"],
    ["p2", "Beto Lima"],
  ]);
  const items = toAgendaAppointments(
    [
      row({ id: "tarde", patient_id: "p2", scheduled_at: "2026-06-24T18:00:00Z", status: "pending" }),
      row({ id: "manana", patient_id: "p1", scheduled_at: "2026-06-24T09:00:00Z" }),
      row({ id: "sin-fecha", scheduled_at: "no-fecha" }),
    ],
    labels,
    "UTC",
  );
  assert.equal(items.length, 2); // descarta la inválida
  assert.deepEqual(
    items.map((i) => i.id),
    ["manana", "tarde"], // ordenadas por hora
  );
  assert.equal(items[0].patientLabel, "Ana Ruiz");
  assert.equal(items[0].initial, "A");
  assert.equal(items[1].statusLabel, "Pendiente");
  assert.equal(items[1].statusTone, "info");
});

test("toAgendaAppointment: sin nombre en el mapa cae a 'Paciente', estado desconocido se muestra tal cual", () => {
  const [item] = toAgendaAppointments([row({ patient_id: "px", status: "rarisimo" })], new Map(), "UTC");
  assert.equal(item.patientLabel, "Paciente");
  assert.equal(item.statusLabel, "rarisimo");
  assert.equal(item.statusTone, "default");
});

test("bucketDay: sólo las citas de ese día civil", () => {
  const items = toAgendaAppointments(
    [
      row({ id: "hoy", scheduled_at: "2026-06-24T15:00:00Z" }),
      row({ id: "otro", scheduled_at: "2026-06-25T15:00:00Z" }),
    ],
    new Map(),
    "UTC",
  );
  const day = bucketDay(items, { year: 2026, month: 6, day: 24 });
  assert.deepEqual(
    day.map((i) => i.id),
    ["hoy"],
  );
});

test("bucketWeek: 7 columnas lun-dom con cada cita en su columna y días vacíos incluidos", () => {
  const items = toAgendaAppointments(
    [
      row({ id: "lun", scheduled_at: "2026-06-22T15:00:00Z" }),
      row({ id: "dom", scheduled_at: "2026-06-28T15:00:00Z" }),
    ],
    new Map(),
    "UTC",
  );
  const week = bucketWeek(items, { year: 2026, month: 6, day: 24 }, "UTC");
  assert.equal(week.length, 7);
  assert.equal(week[0].dateIso, "2026-06-22"); // lunes
  assert.equal(week[6].dateIso, "2026-06-28"); // domingo
  assert.deepEqual(week[0].items.map((i) => i.id), ["lun"]);
  assert.deepEqual(week[6].items.map((i) => i.id), ["dom"]);
  assert.equal(week[3].items.length, 0); // jueves vacío
});

test("bucketMonth: rejilla de semanas completas con inMonth marcando los días propios", () => {
  const items = toAgendaAppointments(
    [row({ id: "c1", scheduled_at: "2026-06-15T15:00:00Z" })],
    new Map(),
    "UTC",
  );
  const weeks = bucketMonth(items, { year: 2026, month: 6, day: 24 }, "UTC");
  // junio 2026 = 5 semanas (1 jun lunes .. 5 jul domingo).
  assert.equal(weeks.length, 5);
  for (const w of weeks) {
    assert.equal(w.length, 7);
  }
  const flat = weeks.flat();
  // El 1 de junio es propio del mes; el 5 de julio es relleno (no inMonth).
  assert.equal(flat[0].dateIso, "2026-06-01");
  assert.equal(flat[0].inMonth, true);
  const last = flat[flat.length - 1];
  assert.equal(last.dateIso, "2026-07-05");
  assert.equal(last.inMonth, false);
  // La cita del 15 cayó en su celda.
  const cell = flat.find((c) => c.dateIso === "2026-06-15");
  assert.deepEqual(cell?.items.map((i) => i.id), ["c1"]);
});

test("deriveStats: contadores por estado desde el mismo conjunto", () => {
  const items = toAgendaAppointments(
    [
      row({ id: "1", status: "confirmed" }),
      row({ id: "2", status: "confirmed" }),
      row({ id: "3", status: "pending" }),
      row({ id: "4", status: "cancelled" }),
      row({ id: "5", status: "no_show" }),
    ],
    new Map(),
    "UTC",
  );
  const stats = deriveStats(items);
  assert.equal(stats.total, 5);
  assert.equal(stats.confirmed, 2);
  assert.equal(stats.pending, 1);
  assert.equal(stats.cancelled, 1);
  assert.equal(stats.no_show, 1);
  assert.equal(stats.attended, 0);
});

test("avatarColor: estable por semilla y dentro de la paleta", () => {
  const a = avatarColor("p1");
  const b = avatarColor("p1");
  assert.equal(a, b); // determinista
  assert.ok(typeof a === "string" && a.length > 0);
});
