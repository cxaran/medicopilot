// Notas de contexto DETERMINISTAS de las acciones humanas fuera del chat (formularios de página
// completa de /resources y acciones de fila de tabla/agenda). Módulo PURO: sin red ni React.
//
// La nota es la memoria barata del hilo: una línea (~15 tokens) que entra al contexto del próximo
// turno para que el agente no gaste tool calls en re-descubrir qué pasó. NUNCA la genera el modelo
// (no inventa, no cuesta un turno): la construye código a partir del resultado real de la acción.
//
// Toda nota va DIRIGIDA (``target``) al chat del paciente de la fila: una acción hecha desde la
// agenda sobre el paciente B no debe caer en el chat abierto del paciente A. Las filas sin
// paciente (usuarios/roles/configuración) no emiten nota: no ensucian ningún chat.

/** Nota lista para ``pushContextNote(text, target)``. */
export interface ActionNote {
  text: string;
  target: string;
}

/**
 * Paciente al que pertenece la fila: su ``patient_id`` o, si el recurso ES ``patients``, la fila
 * misma. Devuelve null cuando la fila no liga paciente (recursos administrativos).
 */
export function patientTargetOf(
  resourceName: string,
  rowId: string | null,
  row: Record<string, unknown> | null | undefined,
): string | null {
  const linked = row?.patient_id;
  if (typeof linked === "string" && linked) {
    return linked;
  }
  if (resourceName === "patients") {
    const ownId = row?.id;
    if (typeof ownId === "string" && ownId) {
      return ownId;
    }
    return rowId;
  }
  return null;
}

/** Nota de una ACCIÓN DE FILA ejecutada (confirmar/cancelar/reagendar…). */
export function rowActionNote(
  actionLabel: string,
  resourceName: string,
  rowId: string,
  row: Record<string, unknown>,
): ActionNote | null {
  const target = patientTargetOf(resourceName, rowId, row);
  if (!target) {
    return null;
  }
  return { text: `⚙️ ${actionLabel} — ${resourceName} (id ${rowId})`, target };
}

/**
 * Nota de un GUARDADO desde el formulario de página completa de /resources (Nuevo/Editar). En
 * alta, la fila es la RESPUESTA del backend (trae id/patient_id reales); en edición se acepta
 * además la fila previa (``fallbackRow``) por si la respuesta no proyecta el paciente.
 */
export function resourceWriteNote(
  mode: "create" | "update",
  resourceName: string,
  resourceLabel: string,
  responseRow: unknown,
  fallbackRow?: Record<string, unknown> | null,
): ActionNote | null {
  const row =
    typeof responseRow === "object" && responseRow !== null
      ? (responseRow as Record<string, unknown>)
      : null;
  const target =
    patientTargetOf(resourceName, null, row) ?? patientTargetOf(resourceName, null, fallbackRow);
  if (!target) {
    return null;
  }
  const rowId = typeof row?.id === "string" && row.id ? ` (id ${row.id})` : "";
  const verb = mode === "create" ? "creado" : "actualizado";
  return { text: `📝 ${resourceLabel} ${verb}${rowId}`, target };
}
