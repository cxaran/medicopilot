// ACCIÓN GOBERNADA "ABRIR EXPEDIENTE" (MP-CTRL-0138). Cuando el médico pide "abre su expediente" (tras
// buscar/identificar a un paciente), el agente no debe navegar a ciegas: emite esta acción y la
// plataforma valida que el médico PUEDE ver pacientes (RBAC) y devuelve una tarjeta con un botón. Abrir
// el expediente NO es una escritura clínica — sólo cambia el CONTEXTO ACTIVO del shell (que monta el
// panel de expediente del paciente). El médico hace el clic; nada se navega automáticamente desde la
// salida del modelo. Si el médico no puede ver pacientes, la acción queda BLOQUEADA con motivo.

import type { ReviewContext } from "./detected-actions";
import type { ActiveClinicalContext } from "../active-context";

/** Recurso de pacientes en el catálogo (la presencia en el catálogo proyectado = puede leerlos). */
const PATIENTS_RESOURCE = "patients";

export interface OpenRecordInput {
  patient_id: string;
  patient_label?: string;
  consultation_id?: string | null;
  consultation_label?: string | null;
  label?: string;
}

export type OpenRecordDisposition = "ready" | "blocked";

/** Especificación de UI de la tarjeta "abrir expediente" (se integra a la unión UiSpec; GeneratedUi). */
export interface OpenRecordSpec {
  kind: "open_record";
  patient_id: string;
  patient_label: string;
  consultation_id: string | null;
  consultation_label: string | null;
  disposition: OpenRecordDisposition;
  /** Motivo cuando queda bloqueada (sin permiso para ver pacientes); si no, null. */
  reason: string | null;
  /** Etiqueta del botón / título de la tarjeta. */
  label: string;
}

export type OpenRecordResult = { ok: true; spec: OpenRecordSpec } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Construye la acción de abrir expediente. READ-ONLY: valida que el médico puede VER pacientes (el
 * recurso aparece en el catálogo proyectado por permiso; si no, `blocked` con motivo — no se descarta
 * en silencio). No navega ni cambia nada por sí misma: sólo describe la tarjeta; el cambio de contexto
 * (que monta el panel de expediente) lo dispara el clic del médico en el host.
 */
export function buildOpenRecord(input: OpenRecordInput, ctx: ReviewContext): OpenRecordResult {
  if (!isObject(input)) {
    return { ok: false, error: "La acción de abrir expediente debe ser un objeto." };
  }
  if (typeof input.patient_id !== "string" || !input.patient_id) {
    return { ok: false, error: "Se requiere 'patient_id' del paciente a abrir." };
  }

  // Gate de LECTURA: el catálogo está proyectado por permiso; si conoce recursos pero no 'patients',
  // el médico no puede verlos. (knownResources vacío = catálogo no disponible → no se bloquea de más.)
  const blockedReason =
    ctx.knownResources.size > 0 && !ctx.knownResources.has(PATIENTS_RESOURCE)
      ? "El médico no tiene permiso para ver expedientes de pacientes."
      : null;

  const patientLabel =
    typeof input.patient_label === "string" && input.patient_label ? input.patient_label : input.patient_id;
  const spec: OpenRecordSpec = {
    kind: "open_record",
    patient_id: input.patient_id,
    patient_label: patientLabel,
    consultation_id:
      typeof input.consultation_id === "string" && input.consultation_id ? input.consultation_id : null,
    consultation_label:
      typeof input.consultation_label === "string" && input.consultation_label
        ? input.consultation_label
        : null,
    disposition: blockedReason ? "blocked" : "ready",
    reason: blockedReason,
    label:
      typeof input.label === "string" && input.label ? input.label : `Abrir expediente de ${patientLabel}`,
  };
  return { ok: true, spec };
}

/** Traduce la spec al contexto clínico activo del shell (que monta el panel de expediente del paciente). */
export function openRecordToContext(spec: OpenRecordSpec): ActiveClinicalContext {
  return {
    patientId: spec.patient_id,
    patientLabel: spec.patient_label,
    consultationId: spec.consultation_id,
    consultationLabel: spec.consultation_label,
  };
}
