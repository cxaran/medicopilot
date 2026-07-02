import "server-only";

import { getResourceCapability } from "@/core/resources/capabilities-client";
import {
  buildFilterableControls,
  parseListQuery,
  type FilterableControls,
} from "@/core/resources/list-query";
import type { FilterableOperatorControl } from "@/core/resources/filterable";
import { getResourceListPage } from "@/core/resources/resource-list-client";
import type { ResourceRow } from "@/core/resources/list-types";
import type { ResourceActionCapability } from "@/core/api/contracts";
import { buildPatientLabelMap, type PatientLabelMap } from "@/core/chat-shell/dashboard";

import {
  computeRange,
  formatCivilDate,
  parseCivilDate,
  todayCivil,
  type AgendaMode,
  type CivilDate,
  type CivilRange,
} from "./calendar-range.ts";

// Data layer SERVER-ONLY de la agenda en calendario (MP-CTRL-0135). COMPONE lecturas YA existentes del
// contrato: cita por rango sobre el recurso ``appointments`` (extremos ``gte``/``lte`` de fecha que el
// propio contrato publica para ``scheduled_date``) + el mapa id->nombre de
// pacientes (misma vía que el dashboard 0124). Deriva el rango visible del modo + ancla, hace UNA sola
// consulta de citas en ese rango y devuelve las filas crudas; el reparto en celdas y los contadores
// los hace el módulo PURO (calendar-range.ts) sobre el MISMO conjunto. Sólo lectura: nunca escribe.

const FALLBACK_TZ = "UTC";
// Tope de citas a traer para el rango visible (el backend lo acota a su ``max_limit``). Suficiente
// para una rejilla mensual de un consultorio; el reparto por día civil filtra con precisión.
const RANGE_LIMIT = 500;
const PATIENTS_LIMIT = 200;

/** Una columna de día (semana) o celda (mes) ya proyectada vive en el módulo puro; aquí sólo datos. */
export interface AgendaData {
  mode: AgendaMode;
  anchor: CivilDate;
  range: CivilRange;
  timeZone: string;
  rows: ResourceRow[];
  labels: PatientLabelMap;
  /** ``true`` si el rol puede crear citas (gate del botón "Nueva cita"). */
  canCreate: boolean;
  /**
   * Acciones de transición proyectadas por el contrato (sólo las que el rol puede ejecutar; el backend
   * las omite sin permiso). Se cablean en la tarjeta con el MISMO ``ResourceRowActions`` de la tabla.
   */
  actions: ResourceActionCapability[];
  /** Token ``{placeholder}`` de las URLs de acción (de ``item_reference``; por defecto "id"). */
  actionPlaceholder: string;
  /** ``true`` si el recurso de citas no está disponible/proyectado para el rol. */
  unavailable: boolean;
}

function emptyData(mode: AgendaMode, anchor: CivilDate): AgendaData {
  return {
    mode,
    anchor,
    range: computeRange(mode, anchor),
    timeZone: FALLBACK_TZ,
    rows: [],
    labels: new Map(),
    canCreate: false,
    actions: [],
    actionPlaceholder: "id",
    unavailable: true,
  };
}

/** Operadores filtrables de ``scheduled_date`` publicados por el contrato (o null si no existe). */
function scheduledOperators(controls: FilterableControls): readonly FilterableOperatorControl[] | null {
  const field = controls.ordered.find((entry) => entry.key === "scheduled_date");
  return field ? field.operators : null;
}

/** Zona del consultorio tomada de cualquier operador de ``scheduled_date`` (los gte/lte de fecha la llevan). */
function resolveTimeZone(operators: readonly FilterableOperatorControl[] | null): string {
  if (!operators) {
    return FALLBACK_TZ;
  }
  for (const op of operators) {
    if (op.calendarTimezone) {
      return op.calendarTimezone;
    }
  }
  return FALLBACK_TZ;
}

/**
 * Parámetros de filtro que acotan la consulta al rango visible, usando los operadores REALES del
 * contrato (sin inventar nombres): el rango por extremos ``gte``+``lte`` (fecha civil inclusiva en
 * ambos extremos, comparación directa sin zona); si no estuvieran, cae a ``eq`` (sólo el modo día
 * puede acotar a una fecha exacta). Devuelve ``{}`` si no hay operador utilizable.
 */
function rangeFilterParams(
  operators: readonly FilterableOperatorControl[] | null,
  mode: AgendaMode,
  range: CivilRange,
): Record<string, string> {
  if (!operators) {
    return {};
  }
  const gte = operators.find((op) => op.key === "gte" && op.parameterName);
  const lte = operators.find((op) => op.key === "lte" && op.parameterName);
  if (gte?.parameterName && lte?.parameterName) {
    return {
      [gte.parameterName]: formatCivilDate(range.start),
      [lte.parameterName]: formatCivilDate(range.end),
    };
  }
  const eq = operators.find((op) => op.key === "eq" && op.parameterName);
  if (eq?.parameterName && mode === "day") {
    return { [eq.parameterName]: formatCivilDate(range.start) };
  }
  return {};
}

/** Filas de pacientes para resolver etiquetas id->nombre; vacío si no hay permiso. */
async function fetchPatientLabels(): Promise<PatientLabelMap> {
  const capability = await getResourceCapability("patients");
  if (!capability || capability.view !== "table" || !capability.list) {
    return new Map();
  }
  const controls = buildFilterableControls(capability.list);
  const query = parseListQuery({ limit: String(PATIENTS_LIMIT) }, capability.list, controls);
  const page = await getResourceListPage(capability, query);
  return buildPatientLabelMap(page?.items ?? []);
}

/**
 * Ensambla los datos de la agenda para ``mode`` anclado en ``rawAnchor`` (yyyy-mm-dd; si falta o es
 * inválido, hoy en la zona del consultorio). UNA consulta de citas en el rango + el mapa de pacientes.
 * Nunca lanza por permisos: degrada a vacío (``unavailable``).
 */
export async function getAgendaData(mode: AgendaMode, rawAnchor?: string): Promise<AgendaData> {
  const capability = await getResourceCapability("appointments");
  if (!capability || capability.view !== "table" || !capability.list) {
    // Resuelve el ancla sin zona del contrato (fallback) para que la vista no se rompa.
    const anchor = (rawAnchor ? parseCivilDate(rawAnchor) : null) ?? todayCivil(FALLBACK_TZ);
    return emptyData(mode, anchor);
  }

  const controls = buildFilterableControls(capability.list);
  const operators = scheduledOperators(controls);
  const timeZone = resolveTimeZone(operators);
  const anchor = (rawAnchor ? parseCivilDate(rawAnchor) : null) ?? todayCivil(timeZone);
  const range = computeRange(mode, anchor);

  const synthetic: Record<string, string> = {
    sort: "scheduled_date",
    limit: String(RANGE_LIMIT),
    ...rangeFilterParams(operators, mode, range),
  };
  const query = parseListQuery(synthetic, capability.list, controls);
  const page = await getResourceListPage(capability, query);
  const labels = await fetchPatientLabels();

  return {
    mode,
    anchor,
    range,
    timeZone,
    rows: page?.items ?? [],
    labels,
    canCreate: Boolean(capability.forms?.create),
    actions: capability.actions ?? [],
    actionPlaceholder: capability.item_reference?.placeholder ?? "id",
    unavailable: false,
  };
}
