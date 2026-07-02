// Proyección de filas del CONTRATO de recursos (patients) a entradas de la lista de chats del
// shell chat-first (MP-CTRL-0122). NO inventa datos: toma lo que el backend ya devuelve para la
// lista de pacientes (mismas filas que la tabla genérica) y deriva una etiqueta de display + la
// inicial para el avatar. Módulo PURO (sin red ni React): el fetch lo hace el server component.

import type { ResourceRow } from "@/core/resources/list-types";

/** Una entrada de paciente en la lista de chats del sidebar (cada paciente = un chat). */
export interface RecentPatient {
  id: string;
  label: string;
  initial: string;
}

// Campos de nombre habituales del contrato (se usa el primero presente; si no, el id). No se
// asume un esquema fijo: es solo el texto de display, la fuente de verdad sigue siendo el contrato.
const NAME_FIELDS = ["full_name", "name", "nombre", "display_name", "label"];

function firstString(row: ResourceRow, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** Convierte una fila del contrato a entrada de paciente; ``null`` si no tiene id usable. */
export function toRecentPatient(row: ResourceRow): RecentPatient | null {
  const id = typeof row.id === "string" && row.id ? row.id : null;
  if (!id) {
    return null;
  }
  const label = firstString(row, NAME_FIELDS) ?? id;
  const initial = label.charAt(0).toUpperCase() || "?";
  return { id, label, initial };
}

/** Mapea las filas de la lista de pacientes a entradas de chat, descartando las sin id y los
 *  DUPLICADOS por id (el id se usa como `key` de React en la barra lateral; ids repetidos darían
 *  claves no únicas y duplicarían/omitirían elementos). */
export function toRecentPatients(rows: readonly ResourceRow[]): RecentPatient[] {
  const out: RecentPatient[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const patient = toRecentPatient(row);
    if (patient && !seen.has(patient.id)) {
      seen.add(patient.id);
      out.push(patient);
    }
  }
  return out;
}

/** Construye una entrada de paciente desde id + etiqueta ya resueltos (p. ej. el contexto activo
 *  del chat, para el bump en vivo del sidebar). */
export function recentPatientFromLabel(id: string, label: string): RecentPatient {
  const display = label.trim() || id;
  return { id, label: display, initial: display.charAt(0).toUpperCase() || "?" };
}

/**
 * Ranking de pacientes por ÚLTIMA ACTIVIDAD de su chat, desde las filas del contrato de
 * conversaciones: ids de paciente ordenados de más a menos reciente, sin duplicados. La actividad
 * es ``updated_at`` (el backend la marca al agregar mensajes) o, si el hilo nunca tuvo mensajes,
 * ``created_at`` (abrir el chat lo crea). Ignora el chat global (``patient_id`` nulo).
 */
export function toChatActivityRanking(rows: readonly ResourceRow[]): string[] {
  const activity = new Map<string, number>();
  for (const row of rows) {
    const patientId = typeof row.patient_id === "string" && row.patient_id ? row.patient_id : null;
    if (!patientId) {
      continue;
    }
    const raw =
      (typeof row.updated_at === "string" && row.updated_at) ||
      (typeof row.created_at === "string" && row.created_at) ||
      "";
    const at = raw ? Date.parse(raw) : Number.NaN;
    if (Number.isNaN(at)) {
      continue;
    }
    // Un paciente puede tener más de un hilo: cuenta el más reciente.
    const previous = activity.get(patientId);
    if (previous === undefined || at > previous) {
      activity.set(patientId, at);
    }
  }
  return [...activity.entries()].sort((a, b) => b[1] - a[1]).map(([patientId]) => patientId);
}

/**
 * Ordena la lista de pacientes del sidebar por el ranking de actividad de chat: primero los que
 * tienen chat (de más a menos reciente), después el resto en su orden original (el del contrato).
 * No agrega ni quita pacientes: sólo reordena.
 */
export function rankRecentPatients(
  patients: readonly RecentPatient[],
  ranking: readonly string[],
): RecentPatient[] {
  const position = new Map(ranking.map((id, index) => [id, index]));
  const withChat = patients
    .filter((patient) => position.has(patient.id))
    .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const withoutChat = patients.filter((patient) => !position.has(patient.id));
  return [...withChat, ...withoutChat];
}

/**
 * Fusiona los BUMPS en vivo (chats con actividad en esta sesión, de más a menos reciente) con la
 * lista servida por el servidor: los bumpeados van primero y el resto conserva su orden, sin
 * duplicados y acotado a ``limit``. Permite que el sidebar refleje la actividad del chat sin
 * esperar una recarga (el orden durable lo da el servidor en la próxima carga).
 */
export function mergeRecentPatients(
  bumps: readonly RecentPatient[],
  served: readonly RecentPatient[],
  limit: number,
): RecentPatient[] {
  const out: RecentPatient[] = [];
  const seen = new Set<string>();
  for (const patient of [...bumps, ...served]) {
    if (!seen.has(patient.id)) {
      seen.add(patient.id);
      out.push(patient);
    }
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}
