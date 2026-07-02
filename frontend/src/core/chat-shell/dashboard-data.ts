import "server-only";

import { cookies } from "next/headers";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { getResourceCapability } from "@/core/resources/capabilities-client";
import { getResourceListPage } from "@/core/resources/resource-list-client";
import {
  buildFilterableControls,
  parseListQuery,
  type FilterableControls,
} from "@/core/resources/list-query";
import type { ResourceRow } from "@/core/resources/list-types";
import {
  buildDashboardData,
  buildPatientLabelMap,
  emptyDashboardData,
  toAgendaItems,
  toAlertItems,
  toConsultationItems,
  type DashboardData,
  type FollowUpSummary,
  type PatientLabelMap,
} from "@/core/chat-shell/dashboard";

// Datos del dashboard del inicio (agente global) — MP-CTRL-0124. COMPONE lecturas YA existentes del
// contrato: citas de hoy (appointments, filtro de calendario "en la fecha" del propio contrato),
// consultas recientes (consultations, orden por defecto -consulted_at) y pendientes de seguimiento
// (GET /follow-ups/summary). No agrega backend ni hardcodea. Cada bloque degrada a vacío si el rol
// no tiene permiso o falla la lectura: el inicio nunca se rompe. Sólo lectura.

/**
 * Errores de control de flujo de Next (``redirect()``/``notFound()``) que NO deben tragarse: si una
 * lectura responde 401 a mitad de request, ``getResourceListPage`` redirige a /login y eso debe
 * propagarse, no degradar a vacío.
 */
function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest === "NEXT_NOT_FOUND")
  );
}

const AGENDA_LIMIT = 8;
const CONSULTATIONS_LIMIT = 6;
// Pacientes a resolver para las etiquetas de citas/consultas; el backend acota a su max_limit.
const PATIENTS_LIMIT = 200;
const FALLBACK_TZ = "UTC";

/** Parámetro real del filtro de igualdad por día (operador ``eq``) de ``scheduled_date``, si existe. */
function scheduledTodayFilter(
  controls: FilterableControls,
): { parameter: string; timeZone: string } | null {
  const field = controls.ordered.find((entry) => entry.key === "scheduled_date");
  if (!field) {
    return null;
  }
  const eq = field.operators.find((op) => op.key === "eq" && op.parameterName);
  if (!eq?.parameterName) {
    return null;
  }
  // La zona (para "hoy") la llevan los operadores de fecha (gte/lte); se toma del primero que la declare.
  const timeZone = field.operators.find((op) => op.calendarTimezone)?.calendarTimezone ?? FALLBACK_TZ;
  return { parameter: eq.parameterName, timeZone };
}

/** Fecha de hoy (yyyy-mm-dd) en la zona del consultorio. */
function todayIso(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date());
}

/** Citas de HOY (filtro de calendario del contrato), ordenadas por hora; con la zona resuelta. */
async function fetchTodayAppointments(): Promise<{ rows: ResourceRow[]; timeZone: string }> {
  try {
    const capability = await getResourceCapability("appointments");
    if (!capability || capability.view !== "table" || !capability.list) {
      return { rows: [], timeZone: FALLBACK_TZ };
    }
    const controls = buildFilterableControls(capability.list);
    const todayFilter = scheduledTodayFilter(controls);
    const timeZone = todayFilter?.timeZone ?? FALLBACK_TZ;
    const synthetic: Record<string, string> = {
      sort: "scheduled_date",
      limit: String(AGENDA_LIMIT),
    };
    if (todayFilter) {
      synthetic[todayFilter.parameter] = todayIso(timeZone);
    }
    const query = parseListQuery(synthetic, capability.list, controls);
    const page = await getResourceListPage(capability, query);
    return { rows: page?.items ?? [], timeZone };
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return { rows: [], timeZone: FALLBACK_TZ };
  }
}

/** Consultas recientes (orden por defecto -consulted_at del recurso). */
async function fetchRecentConsultations(): Promise<ResourceRow[]> {
  try {
    const capability = await getResourceCapability("consultations");
    if (!capability || capability.view !== "table" || !capability.list) {
      return [];
    }
    const controls = buildFilterableControls(capability.list);
    const query = parseListQuery(
      { sort: "-consulted_at", limit: String(CONSULTATIONS_LIMIT) },
      capability.list,
      controls,
    );
    const page = await getResourceListPage(capability, query);
    return page?.items ?? [];
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return [];
  }
}

/** Filas de pacientes para resolver etiquetas (id->nombre); vacío si no hay permiso. */
async function fetchPatientLabels(): Promise<PatientLabelMap> {
  try {
    const capability = await getResourceCapability("patients");
    if (!capability || capability.view !== "table" || !capability.list) {
      return new Map();
    }
    const controls = buildFilterableControls(capability.list);
    const query = parseListQuery({ limit: String(PATIENTS_LIMIT) }, capability.list, controls);
    const page = await getResourceListPage(capability, query);
    return buildPatientLabelMap(page?.items ?? []);
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return new Map();
  }
}

const EMPTY_SUMMARY: FollowUpSummary = {
  pending_tasks: [],
  missed_appointments: [],
  unreviewed_abnormal_labs: [],
};

/** Pendientes de seguimiento (GET /follow-ups/summary); vacío si no hay permiso o falla. */
async function fetchFollowUpSummary(): Promise<FollowUpSummary> {
  try {
    const cookie = (await cookies()).toString();
    const summary = await serverApi<FollowUpSummary>("/api/v1/follow-ups/summary", { cookie });
    return {
      pending_tasks: summary.pending_tasks ?? [],
      missed_appointments: summary.missed_appointments ?? [],
      unreviewed_abnormal_labs: summary.unreviewed_abnormal_labs ?? [],
    };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      // 403 (sin follow_ups:read) u otro error de lectura: degrada a vacío sin romper el inicio.
      return EMPTY_SUMMARY;
    }
    return EMPTY_SUMMARY;
  }
}

/** Ensambla el dashboard del inicio componiendo las lecturas del contrato. Nunca lanza. */
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [appointments, consultations, labels, summary] = await Promise.all([
      fetchTodayAppointments(),
      fetchRecentConsultations(),
      fetchPatientLabels(),
      fetchFollowUpSummary(),
    ]);
    return buildDashboardData({
      agenda: toAgendaItems(appointments.rows, labels),
      consultations: toConsultationItems(consultations, labels, appointments.timeZone),
      alerts: toAlertItems(summary),
    });
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    return emptyDashboardData();
  }
}
