import type { WireMessage } from "@/core/agent/protocol";
import type { RecallScope } from "@/core/agent/memory-recall";

/**
 * CONTEXTO CLÍNICO ACTIVO del copiloto (paciente y consulta opcional sobre los que el médico
 * está trabajando). En el chat POR PACIENTE hay contexto activo; en el /copilot GLOBAL no lo hay,
 * y entonces el recall (P2) y el contexto/compactación (P3) sólo se acotan por dueño y recencia.
 * Este módulo PURO (sin red ni React) modela ese ámbito: lo convierte en el RecallScope de P2,
 * arma una nota de contexto para el turno y produce el texto del chip indicador.
 *
 * El selector SÓLO fija el ámbito (paciente/consulta elegidos por el médico). ESTE módulo NO carga
 * PHI del expediente por su cuenta: sólo aporta al turno la ETIQUETA que el médico vio y eligió, y
 * su nota de contexto es instrucción de confianza nuestra (delimita el ámbito), no datos del
 * paciente. La PHI del expediente que llega al turno la inyectan otras capas: el recall (memorias
 * del médico) y el RESUMEN DEL PACIENTE (ver patient-summary.ts), no este selector.
 */

/** Paciente (y consulta opcional) activos, con su etiqueta visible para el médico. */
export interface ActiveClinicalContext {
  patientId: string;
  patientLabel: string;
  consultationId: string | null;
  consultationLabel: string | null;
}

/**
 * Ámbito de recall (P2) derivado del contexto activo. Sin contexto -> ámbito vacío, que
 * preserva el comportamiento actual (owner-scoped por recencia). El límite se pasa tal cual.
 */
export function recallScopeFor(
  context: ActiveClinicalContext | null,
  limit?: number,
): RecallScope {
  const scope: RecallScope = {};
  if (context) {
    scope.patientId = context.patientId;
    scope.consultationId = context.consultationId;
  }
  if (limit !== undefined) {
    scope.limit = limit;
  }
  return scope;
}

/** Texto del chip indicador: «Paciente activo: <nombre>» (+ consulta si la hay). */
export function activeContextChipText(context: ActiveClinicalContext): string {
  const base = `Paciente activo: ${context.patientLabel}`;
  if (context.consultationLabel) {
    return `${base} · Consulta: ${context.consultationLabel}`;
  }
  return base;
}

/**
 * Mensaje de turno (rol system) que SURFACEA el ámbito activo al modelo. Es instrucción de
 * confianza nuestra: delimita el paciente/consulta sobre el que asiste el copiloto, sin volcar
 * datos del expediente (sólo la etiqueta que el médico ya eligió y el identificador). Devuelve
 * ``null`` si no hay contexto activo (no se ensucia el turno).
 */
export function buildActiveContextMessage(
  context: ActiveClinicalContext | null,
): WireMessage | null {
  if (!context) {
    return null;
  }
  const parts = [
    "CONTEXTO CLÍNICO ACTIVO (ámbito fijado por el médico): el copiloto asiste sobre el " +
      `paciente «${context.patientLabel}» (identificador ${context.patientId})`,
  ];
  if (context.consultationId) {
    const label = context.consultationLabel ? `«${context.consultationLabel}» ` : "";
    parts.push(`, en la consulta ${label}(identificador ${context.consultationId})`);
  }
  parts.push(
    ". Limita tu asistencia a este ámbito. No asumas datos del expediente que no se te hayan " +
      "proporcionado y recuerda que toda escritura requiere la aprobación del médico.",
  );
  return { role: "system", content: [{ type: "text", text: parts.join("") }] };
}
