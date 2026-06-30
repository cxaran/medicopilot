// Tipos y lógica PURA de los reportes agregados (GET /api/v1/reports/*). El backend devuelve
// AGREGADOS (etiquetas + conteos), nunca filas con PHL. Este módulo no toca red ni navegador: define
// los shapes del contrato y helpers de presentación (rango por defecto, formato de porcentaje,
// escala de barras), unit-testeables. La obtención vive en reports-data.ts (server-only).

/** Punto de la serie de actividad (consultas y citas por mes). */
export interface ActivityPoint {
  period: string; // "YYYY-MM"
  consultations: number;
  appointments: number;
}

/** Diagnóstico del ranking (por código si existe, si no texto normalizado). */
export interface TopDiagnosis {
  code_or_text: string;
  count: number;
}

/** Conteo de consultas en borrador (sin firmar) por médico. */
export interface UnsignedNotesItem {
  doctor_id: string;
  doctor_name: string;
  count: number;
}

/** Tasas de resultado de citas en la ventana. */
export interface AttendanceReport {
  attended: number;
  no_show: number;
  cancelled: number;
  total: number;
  attended_rate: number;
  no_show_rate: number;
  cancelled_rate: number;
}

/** Datos consolidados que consume la vista de reportes. */
export interface ReportsData {
  /** false si el rol no tiene ``reports:read`` (todas las lecturas dieron 403). */
  available: boolean;
  rangeFrom: string; // YYYY-MM-DD
  rangeTo: string; // YYYY-MM-DD
  activity: readonly ActivityPoint[];
  topDiagnoses: readonly TopDiagnosis[];
  unsignedNotes: readonly UnsignedNotesItem[];
  attendance: AttendanceReport | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month1: number, day: number): string {
  return `${year}-${pad2(month1)}-${pad2(day)}`;
}

/**
 * Rango por defecto: ventana de 6 meses que termina HOY. ``from`` = primer día del mes 5 meses
 * atrás; ``to`` = la fecha de ``today``. ``today`` se inyecta (Date) para que sea determinista en
 * tests. Usa componentes UTC para no desfasar por zona.
 */
export function defaultReportRange(today: Date): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month0 = today.getUTCMonth(); // 0..11
  const day = today.getUTCDate();
  let fromYear = year;
  let fromMonth0 = month0 - 5;
  while (fromMonth0 < 0) {
    fromMonth0 += 12;
    fromYear -= 1;
  }
  return { from: isoDate(fromYear, fromMonth0 + 1, 1), to: isoDate(year, month0 + 1, day) };
}

/** ¿Es una fecha civil válida ``YYYY-MM-DD``? (validación ligera de searchParams). */
export function isIsoDate(value: string | undefined | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Formatea una tasa 0..1 como porcentaje con un decimal (0.4231 → "42.3%"). */
export function formatPercent(rate: number): string {
  const clamped = Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0;
  return `${(clamped * 100).toFixed(1)}%`;
}

/** Máximo de la serie (consultas+citas) para escalar barras; 0 si vacía. */
export function activityMax(points: readonly ActivityPoint[]): number {
  return points.reduce((max, point) => Math.max(max, point.consultations, point.appointments), 0);
}

/** Ancho de barra 0..100 (%) de un valor respecto al máximo; 0 si el máximo es 0. */
export function barPercent(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
