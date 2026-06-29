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
import { buildPatientLabelMap, type PatientLabelMap } from "@/core/chat-shell/dashboard";

import {
  addDays,
  computeRange,
  formatCivilDate,
  parseCivilDate,
  todayCivil,
  type AgendaMode,
  type CivilDate,
  type CivilRange,
} from "./calendar-range.ts";

// Data layer SERVER-ONLY de la agenda en calendario (MP-CTRL-0135). COMPONE lecturas YA existentes del
// contrato: cita por rango de calendario sobre el recurso ``appointments`` (operadores on/before/
// after/between que el propio contrato publica para ``scheduled_at``) + el mapa id->nombre de
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
    unavailable: true,
  };
}

/** Operadores de calendario de ``scheduled_at`` publicados por el contrato (o null si no existe). */
function scheduledOperators(controls: FilterableControls): readonly FilterableOperatorControl[] | null {
  const field = controls.ordered.find((entry) => entry.key === "scheduled_at");
  return field ? field.operators : null;
}

/** Zona del consultorio tomada de cualquier operador de calendario de ``scheduled_at``. */
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
 * contrato (sin inventar nombres): prefiere ``between`` (daterange from/to); si no, ``after``+``before``
 * (ensanchando un día a cada lado, porque el reparto por día civil filtra con precisión); si sólo hay
 * ``on``, sólo el modo día puede acotar. Devuelve ``{}`` si no hay operador utilizable.
 */
function rangeFilterParams(
  operators: readonly FilterableOperatorControl[] | null,
  mode: AgendaMode,
  range: CivilRange,
): Record<string, string> {
  if (!operators) {
    return {};
  }
  const between = operators.find((op) => op.key === "between" && op.fromParameter && op.toParameter);
  if (between?.fromParameter && between.toParameter) {
    const to = between.rangeEndInclusive === false ? addDays(range.end, 1) : range.end;
    return {
      [between.fromParameter]: formatCivilDate(range.start),
      [between.toParameter]: formatCivilDate(to),
    };
  }
  const after = operators.find((op) => op.key === "after" && op.parameterName);
  const before = operators.find((op) => op.key === "before" && op.parameterName);
  if (after?.parameterName && before?.parameterName) {
    return {
      [after.parameterName]: formatCivilDate(addDays(range.start, -1)),
      [before.parameterName]: formatCivilDate(addDays(range.end, 1)),
    };
  }
  const on = operators.find((op) => op.key === "on" && op.parameterName);
  if (on?.parameterName && mode === "day") {
    return { [on.parameterName]: formatCivilDate(range.start) };
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
    sort: "scheduled_at",
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
    unavailable: false,
  };
}
