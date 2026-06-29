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

/** Mapea las filas de la lista de pacientes a entradas de chat, descartando las sin id. */
export function toRecentPatients(rows: readonly ResourceRow[]): RecentPatient[] {
  const out: RecentPatient[] = [];
  for (const row of rows) {
    const patient = toRecentPatient(row);
    if (patient) {
      out.push(patient);
    }
  }
  return out;
}
