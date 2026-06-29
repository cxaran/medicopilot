// Lógica PURA de la agenda en formato calendario (MP-CTRL-0135). Sin red ni React: calcula los
// límites de rango (día/semana/mes) en la zona del consultorio, reparte las citas en celdas y deriva
// los contadores de estado. La consume el data layer (agenda-data.ts, server-only) y la vista
// presentacional (AgendaView.tsx). Toda la matemática de fechas es sobre FECHAS CIVILES (año/mes/día):
// los días se suman sobre UTC, que no tiene horario de verano, así que el cómputo es DST-safe y la
// zona sólo se usa para mapear cada instante a SU día civil. No inventa datos: lo que no viene del
// contrato (p. ej. el nombre del paciente) se resuelve por el mapa o cae a un texto neutro.

import type { ResourceRow } from "@/core/resources/list-types";

export type AgendaMode = "day" | "week" | "month";

export const AGENDA_MODES: readonly AgendaMode[] = ["day", "week", "month"];

/** Fecha civil (independiente de zona). ``month`` es 1-12. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** Rango civil inclusivo [start, end] que la vista debe cubrir. */
export interface CivilRange {
  start: CivilDate;
  end: CivilDate;
}

const FALLBACK_TZ = "UTC";

// --- Conversión y aritmética de fechas civiles ---

/** ``CivilDate`` -> "yyyy-mm-dd" con ceros a la izquierda. */
export function formatCivilDate(date: CivilDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

/** Parsea "yyyy-mm-dd" a ``CivilDate``; ``null`` si no es una fecha de calendario válida. */
export function parseCivilDate(iso: string): CivilDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Date UTC canónica (mediodía) que REPRESENTA la fecha civil para aritmética/etiquetas. */
function civilToUtc(date: CivilDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}

function utcToCivil(utc: Date): CivilDate {
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

/** Suma ``n`` días civiles (DST-safe: la aritmética es sobre UTC). */
export function addDays(date: CivilDate, n: number): CivilDate {
  const utc = civilToUtc(date);
  utc.setUTCDate(utc.getUTCDate() + n);
  return utcToCivil(utc);
}

/** Días del mes (``month`` 1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Suma ``n`` meses civiles; el día se acota al último día del mes destino. */
export function addMonths(date: CivilDate, n: number): CivilDate {
  const total = date.year * 12 + (date.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return { year, month, day };
}

/** Día de la semana con LUNES = 0 ... DOMINGO = 6. */
export function weekdayMonday0(date: CivilDate): number {
  return (civilToUtc(date).getUTCDay() + 6) % 7;
}

/** Hoy como fecha civil en la zona dada. */
export function todayCivil(timeZone: string): CivilDate {
  const iso = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timeZone || FALLBACK_TZ,
  }).format(new Date());
  return parseCivilDate(iso) ?? { year: 1970, month: 1, day: 1 };
}

/** Día civil (yyyy-mm-dd) de un instante ISO en la zona dada; ``null`` si la fecha es inválida. */
export function civilDateOf(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timeZone || FALLBACK_TZ,
  }).format(date);
}

// --- Rango visible y navegación ---

/**
 * Rango civil que la vista debe cubrir para ``mode`` anclado en ``anchor``:
 * - día: [anchor, anchor].
 * - semana: lunes..domingo que contienen al ancla.
 * - mes: rejilla completa de semanas (lunes..domingo) que cubre el mes del ancla, incluyendo los
 *   días de relleno del mes anterior/siguiente que aparecen en la cuadrícula.
 */
export function computeRange(mode: AgendaMode, anchor: CivilDate): CivilRange {
  if (mode === "day") {
    return { start: anchor, end: anchor };
  }
  if (mode === "week") {
    const start = addDays(anchor, -weekdayMonday0(anchor));
    return { start, end: addDays(start, 6) };
  }
  const first: CivilDate = { year: anchor.year, month: anchor.month, day: 1 };
  const last: CivilDate = {
    year: anchor.year,
    month: anchor.month,
    day: daysInMonth(anchor.year, anchor.month),
  };
  const start = addDays(first, -weekdayMonday0(first));
  const end = addDays(last, 6 - weekdayMonday0(last));
  return { start, end };
}

/** Mueve el ancla ``delta`` pasos en la unidad de ``mode`` (día/semana/mes). */
export function stepAnchor(mode: AgendaMode, anchor: CivilDate, delta: number): CivilDate {
  if (mode === "day") {
    return addDays(anchor, delta);
  }
  if (mode === "week") {
    return addDays(anchor, delta * 7);
  }
  return addMonths(anchor, delta);
}

// --- Proyección de citas a celdas ---

export type AgendaStatusTone = "info" | "ok" | "default" | "danger" | "warn";

/** Etiqueta/tono de cada estado de cita (presentación de las píldoras). Espejo del contrato. */
export const AGENDA_STATUS: Record<string, { label: string; tone: AgendaStatusTone }> = {
  pending: { label: "Pendiente", tone: "info" },
  confirmed: { label: "Confirmada", tone: "ok" },
  attended: { label: "Atendida", tone: "default" },
  cancelled: { label: "Cancelada", tone: "danger" },
  rescheduled: { label: "Reprogramada", tone: "warn" },
  no_show: { label: "No asistió", tone: "danger" },
};

/** Una cita ya proyectada para la agenda; ``dateIso`` es su día civil en la zona (clave de celda). */
export interface AgendaAppointment {
  id: string;
  patientId: string | null;
  patientLabel: string;
  initial: string;
  reason: string;
  statusKey: string;
  statusLabel: string;
  statusTone: AgendaStatusTone;
  durationMinutes: number | null;
  scheduledAt: string;
  dateIso: string;
}

/** Una columna de día (vista semana) o celda (vista mes). */
export interface AgendaCell {
  date: CivilDate;
  dateIso: string;
  isToday: boolean;
  inMonth: boolean;
  items: AgendaAppointment[];
}

/** Contadores derivados del MISMO conjunto de resultados, por estado. */
export interface AgendaStats {
  total: number;
  pending: number;
  confirmed: number;
  attended: number;
  cancelled: number;
  rescheduled: number;
  no_show: number;
}

export type PatientLabelMap = ReadonlyMap<string, string>;

const PATIENT_FALLBACK = "Paciente";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function labelFor(patientId: string | null, labels: PatientLabelMap): string {
  if (patientId && labels.has(patientId)) {
    return labels.get(patientId) ?? PATIENT_FALLBACK;
  }
  return PATIENT_FALLBACK;
}

/** Proyecta una fila del contrato a una cita de agenda; ``null`` si no tiene fecha válida. */
export function toAgendaAppointment(
  row: ResourceRow,
  labels: PatientLabelMap,
  timeZone: string,
): AgendaAppointment | null {
  const scheduledAt = str(row.scheduled_at);
  const dateIso = civilDateOf(scheduledAt, timeZone);
  if (!dateIso) {
    return null;
  }
  const patientId = strOrNull(row.patient_id);
  const patientLabel = labelFor(patientId, labels);
  const statusKey = str(row.status);
  const meta = AGENDA_STATUS[statusKey];
  const duration = typeof row.duration_minutes === "number" ? row.duration_minutes : null;
  return {
    id: str(row.id) || scheduledAt,
    patientId,
    patientLabel,
    initial: patientLabel.charAt(0).toUpperCase() || "?",
    reason: str(row.reason),
    statusKey,
    statusLabel: meta?.label ?? (statusKey || "—"),
    statusTone: meta?.tone ?? "default",
    durationMinutes: duration,
    scheduledAt,
    dateIso,
  };
}

/** Proyecta y ordena por hora todas las filas; descarta las que no tienen fecha válida. */
export function toAgendaAppointments(
  rows: readonly ResourceRow[],
  labels: PatientLabelMap,
  timeZone: string,
): AgendaAppointment[] {
  const items: AgendaAppointment[] = [];
  for (const row of rows) {
    const item = toAgendaAppointment(row, labels, timeZone);
    if (item) {
      items.push(item);
    }
  }
  items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return items;
}

/** Citas de un día concreto (clave de día civil), ya ordenadas por hora. */
export function bucketDay(items: readonly AgendaAppointment[], anchor: CivilDate): AgendaAppointment[] {
  const key = formatCivilDate(anchor);
  return items.filter((item) => item.dateIso === key);
}

function buildCells(
  range: CivilRange,
  items: readonly AgendaAppointment[],
  todayIso: string,
  monthOfAnchor: number | null,
): AgendaCell[] {
  const byDate = new Map<string, AgendaAppointment[]>();
  for (const item of items) {
    const bucket = byDate.get(item.dateIso);
    if (bucket) {
      bucket.push(item);
    } else {
      byDate.set(item.dateIso, [item]);
    }
  }
  const cells: AgendaCell[] = [];
  let cursor = range.start;
  const endIso = formatCivilDate(range.end);
  // Guardia dura por si el rango fuera incoherente: una rejilla de mes no excede 6 semanas.
  for (let guard = 0; guard < 45; guard += 1) {
    const dateIso = formatCivilDate(cursor);
    cells.push({
      date: cursor,
      dateIso,
      isToday: dateIso === todayIso,
      inMonth: monthOfAnchor === null ? true : cursor.month === monthOfAnchor,
      items: byDate.get(dateIso) ?? [],
    });
    if (dateIso === endIso) {
      break;
    }
    cursor = addDays(cursor, 1);
  }
  return cells;
}

/** Columnas lunes..domingo de la semana que contiene al ancla. */
export function bucketWeek(
  items: readonly AgendaAppointment[],
  anchor: CivilDate,
  timeZone: string,
): AgendaCell[] {
  const range = computeRange("week", anchor);
  return buildCells(range, items, formatCivilDate(todayCivil(timeZone)), null);
}

/** Rejilla de semanas (cada una con 7 celdas) del mes del ancla; ``inMonth`` marca los días propios. */
export function bucketMonth(
  items: readonly AgendaAppointment[],
  anchor: CivilDate,
  timeZone: string,
): AgendaCell[][] {
  const range = computeRange("month", anchor);
  const cells = buildCells(range, items, formatCivilDate(todayCivil(timeZone)), anchor.month);
  const weeks: AgendaCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Contadores por estado a partir del MISMO conjunto de citas (no de una consulta aparte). */
export function deriveStats(items: readonly AgendaAppointment[]): AgendaStats {
  const stats: AgendaStats = {
    total: items.length,
    pending: 0,
    confirmed: 0,
    attended: 0,
    cancelled: 0,
    rescheduled: 0,
    no_show: 0,
  };
  for (const item of items) {
    if (item.statusKey in stats && item.statusKey !== "total") {
      stats[item.statusKey as keyof AgendaStats] += 1;
    }
  }
  return stats;
}

// Paleta determinista para el avatar (mismo paciente -> mismo color), tomada de los tokens del diseño.
const AVATAR_PALETTE = [
  "var(--accent)",
  "var(--info)",
  "var(--ok)",
  "var(--warn)",
  "var(--danger)",
  "#8b5cf6",
  "#0ea5e9",
  "#f97316",
];

/** Color de avatar estable derivado de la semilla (id o etiqueta del paciente). */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
