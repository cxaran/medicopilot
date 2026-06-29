// Modelo de vista PURO del dashboard del inicio (agente global) — MP-CTRL-0124, rebanada 4 del
// rediseño. Sin red ni React: mapea las lecturas del CONTRATO existente (citas, consultas,
// pendientes de seguimiento) a tarjetas de resumen SÓLO LECTURA. El fetch lo hace el server
// component (dashboard-data.ts); aquí sólo se selecciona/formatea y se resuelve la etiqueta del
// paciente. No inventa datos: lo que no viene del backend queda vacío. Cada ítem que tiene paciente
// enlaza a su chat (patientId); el dashboard nunca escribe (toda acción pasa por el chat + P1).

import type { ResourceRow } from "@/core/resources/list-types";
import { toRecentPatient } from "@/core/chat-shell/recent-patients";

export type DashboardTone = "default" | "info" | "ok" | "warn" | "danger";

/** Un renglón de una tarjeta del dashboard. ``patientId`` null = sin paciente (no navega a chat). */
export interface DashboardItem {
  key: string;
  patientId: string | null;
  patientLabel: string;
  primary: string;
  secondary?: string;
  meta?: string;
  badge?: { label: string; tone: DashboardTone };
}

export interface DashboardCard {
  items: DashboardItem[];
  count: number;
}

export interface DashboardData {
  agenda: DashboardCard;
  consultations: DashboardCard;
  alerts: DashboardCard;
}

/** Mapa id de paciente -> etiqueta de display (resuelto desde la lista de pacientes del contrato). */
export type PatientLabelMap = ReadonlyMap<string, string>;

/** Resumen de pendientes de seguimiento (forma mínima de ``GET /follow-ups/summary``). */
export interface FollowUpSummary {
  pending_tasks: ReadonlyArray<{
    task_id: string;
    title: string;
    patient_id?: string | null;
    patient_label?: string | null;
    overdue: boolean;
    priority: string;
  }>;
  missed_appointments: ReadonlyArray<{
    appointment_id: string;
    patient_id: string;
    patient_label?: string | null;
    status: string;
    reason: string;
  }>;
  unreviewed_abnormal_labs: ReadonlyArray<{
    lab_result_id: string;
    patient_id: string;
    patient_label?: string | null;
    analyte_name: string;
    abnormal_flag: string;
  }>;
}

const PATIENT_FALLBACK = "Paciente";

// Etiqueta/tono de estado de cita (presentación en español). Lo desconocido se muestra tal cual.
const APPOINTMENT_STATUS: Record<string, { label: string; tone: DashboardTone }> = {
  pending: { label: "Pendiente", tone: "info" },
  confirmed: { label: "Confirmada", tone: "ok" },
  attended: { label: "Atendida", tone: "default" },
  cancelled: { label: "Cancelada", tone: "danger" },
  rescheduled: { label: "Reprogramada", tone: "warn" },
  no_show: { label: "No asistió", tone: "danger" },
};

const MISSED_STATUS_LABEL: Record<string, string> = {
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const ABNORMAL_FLAG_LABEL: Record<string, string> = {
  low: "Bajo",
  high: "Alto",
  critical: "Crítico",
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** Hora local (HH:mm) en la zona del consultorio; "" si la fecha no es válida. */
export function formatTimeHM(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (!isValidDate(date)) {
    return "";
  }
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

/** Fecha corta + hora (p. ej. "12 jun, 14:30") en la zona del consultorio; "" si es inválida. */
export function formatShortDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (!isValidDate(date)) {
    return "";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

function labelFor(patientId: string | null, labels: PatientLabelMap): string {
  if (patientId && labels.has(patientId)) {
    return labels.get(patientId) ?? PATIENT_FALLBACK;
  }
  return PATIENT_FALLBACK;
}

/** Construye el mapa id->etiqueta de pacientes desde las filas de la lista del contrato. */
export function buildPatientLabelMap(rows: readonly ResourceRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const patient = toRecentPatient(row);
    if (patient) {
      map.set(patient.id, patient.label);
    }
  }
  return map;
}

/** Agenda de hoy: filas de citas -> ítems (nombre, motivo, hora, estado). */
export function toAgendaItems(
  rows: readonly ResourceRow[],
  labels: PatientLabelMap,
  timeZone: string,
): DashboardItem[] {
  return rows.map((row, index) => {
    const patientId = strOrNull(row.patient_id);
    const status = str(row.status);
    const badge = APPOINTMENT_STATUS[status] ?? (status ? { label: status, tone: "default" as const } : undefined);
    return {
      key: str(row.id) || `agenda-${index}`,
      patientId,
      patientLabel: labelFor(patientId, labels),
      primary: labelFor(patientId, labels),
      secondary: str(row.reason) || undefined,
      meta: formatTimeHM(str(row.scheduled_at), timeZone) || undefined,
      badge,
    };
  });
}

/** Consultas recientes: filas de consultas -> ítems (nombre, motivo, cuándo). */
export function toConsultationItems(
  rows: readonly ResourceRow[],
  labels: PatientLabelMap,
  timeZone: string,
): DashboardItem[] {
  return rows.map((row, index) => {
    const patientId = strOrNull(row.patient_id);
    return {
      key: str(row.id) || `consulta-${index}`,
      patientId,
      patientLabel: labelFor(patientId, labels),
      primary: labelFor(patientId, labels),
      secondary: str(row.reason_for_visit) || undefined,
      meta: formatShortDateTime(str(row.consulted_at), timeZone) || undefined,
    };
  });
}

/**
 * Alertas clínicas: aplana el resumen de pendientes de seguimiento (labs anormales sin revisar,
 * tareas abiertas/vencidas, citas no asistidas/canceladas) en una sola lista. El backend ya resolvió
 * ``patient_label``; aquí sólo se da formato y tono. Orden: labs (severidad) -> tareas -> citas.
 */
export function toAlertItems(summary: FollowUpSummary): DashboardItem[] {
  const items: DashboardItem[] = [];

  for (const lab of summary.unreviewed_abnormal_labs) {
    const flag = ABNORMAL_FLAG_LABEL[lab.abnormal_flag] ?? lab.abnormal_flag;
    items.push({
      key: `lab-${lab.lab_result_id}`,
      patientId: lab.patient_id || null,
      patientLabel: lab.patient_label || PATIENT_FALLBACK,
      primary: `Laboratorio anormal: ${lab.analyte_name}`,
      secondary: `${lab.patient_label || PATIENT_FALLBACK} · ${flag}`,
      badge: {
        label: flag,
        tone: lab.abnormal_flag === "critical" ? "danger" : "warn",
      },
    });
  }

  for (const task of summary.pending_tasks) {
    const detail = task.overdue ? "Vencida" : "Abierta";
    items.push({
      key: `task-${task.task_id}`,
      patientId: task.patient_id || null,
      patientLabel: task.patient_label || PATIENT_FALLBACK,
      primary: `Tarea: ${task.title}`,
      secondary: task.patient_label ? `${task.patient_label} · ${detail}` : detail,
      badge: { label: detail, tone: task.overdue ? "danger" : "warn" },
    });
  }

  for (const appt of summary.missed_appointments) {
    const statusLabel = MISSED_STATUS_LABEL[appt.status] ?? appt.status;
    items.push({
      key: `appt-${appt.appointment_id}`,
      patientId: appt.patient_id || null,
      patientLabel: appt.patient_label || PATIENT_FALLBACK,
      primary: `Cita: ${statusLabel}`,
      secondary: `${appt.patient_label || PATIENT_FALLBACK}${appt.reason ? ` · ${appt.reason}` : ""}`,
      badge: { label: statusLabel, tone: "warn" },
    });
  }

  return items;
}

function card(items: DashboardItem[]): DashboardCard {
  return { items, count: items.length };
}

/** Ensambla el modelo de vista del dashboard a partir de los ítems ya mapeados. */
export function buildDashboardData(parts: {
  agenda: DashboardItem[];
  consultations: DashboardItem[];
  alerts: DashboardItem[];
}): DashboardData {
  return {
    agenda: card(parts.agenda),
    consultations: card(parts.consultations),
    alerts: card(parts.alerts),
  };
}

/** Dashboard vacío (sin permisos / sin datos): se renderiza con tarjetas vacías. */
export function emptyDashboardData(): DashboardData {
  return { agenda: card([]), consultations: card([]), alerts: card([]) };
}
