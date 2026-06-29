// PLAN DE TAREAS REVISABLE (MP-CTRL-0129, épica conversación→expediente, casos 1-52). Hermano
// ORIENTADO A TAREAS del panel de cierre post-transcripción [[detected-actions]] (MP-CTRL-0120):
// cuando el agente detecta pendientes de seguimiento de una conversación/transcripción ('agendar
// control en 2 semanas', 'solicitar laboratorios de seguimiento', 'llamar al paciente'), produce un
// PLAN de tareas propuestas que el médico revisa, edita, acepta o rechaza EN GRUPO ANTES de escribir
// nada. Es ORQUESTACIÓN read-only sobre el camino de creación P1 EXISTENTE (clinical.create_task_draft):
// aquí NADA se persiste; al confirmar, el agente procede TAREA POR TAREA por la aprobación P1, nunca
// en lote. La extracción que PRODUCE las tareas es del runtime del agente (fuera de alcance).
//
// Reparto DETERMINISTA por confianza, igual que la extracción→prefill (MP-CTRL-0118):
//   confianza >= 0.8                 -> lista (ready)        : alta confianza, propuesta para guardar
//   0.5 <= confianza < 0.8           -> sugerida (suggested) : a confirmar por el médico
//   confianza < 0.5 (o ausente bajo) -> descartada           : confianza insuficiente
// El RBAC (sin permiso de creación) y un recurso desconocido BLOQUEAN con motivo (no se descartan en
// silencio). Los campos fuera del esquema de creación se DESCARTAN (nunca se inventan); ausencia de
// un campo NO es un valor negativo (queda vacío). Reusa el catálogo+RBAC de [[detected-actions]].

import {
  reviewContextFromCatalog,
  type CatalogResourceLike,
  type ReviewContext,
} from "./detected-actions";

export { reviewContextFromCatalog };
export type { CatalogResourceLike, ReviewContext };

/** Recurso destino por defecto del plan: la tarea clínica de seguimiento del backend. */
export const TASK_RESOURCE = "clinical_tasks";
/** Umbral de "lista" (prellenada) y piso de "sugerida"; idénticos al reparto del 0118. */
export const READY_CONFIDENCE_THRESHOLD = 0.8;
export const SUGGEST_CONFIDENCE_FLOOR = 0.5;

const MAX_TASKS = 50;

/** Tarea propuesta por el agente (entrada al seam). Los valores son propuestas, nunca se guardan. */
export interface ProposedTask {
  id: string;
  label?: string;
  /** Confianza de la detección en [0,1]; reparte la disposición determinista. */
  confidence?: number;
  /** Recurso destino; por defecto ``clinical_tasks``. */
  target_resource?: string;
  /** Valores propuestos por campo (title/description/due_at/priority/patient_id/status…). */
  proposed_values?: Record<string, unknown>;
  source_fragment?: string;
}

export interface TaskPlanInput {
  patient_id?: string;
  consultation_id?: string;
  tasks: ProposedTask[];
}

export type TaskDisposition = "ready" | "suggested" | "discarded" | "blocked";

export interface TaskPlanEntry {
  id: string;
  label: string;
  target_resource: string;
  confidence: number | null;
  disposition: TaskDisposition;
  /** Motivo cuando la tarea queda bloqueada (recurso desconocido / sin permiso); si no, null. */
  reason: string | null;
  /** Valores efectivos SÓLO de campos del esquema (los ajenos caen en ``dropped_fields``). */
  values: Record<string, unknown>;
  /** Campos propuestos que NO existen en el esquema de creación: se descartan (no se inventan). */
  dropped_fields: string[];
  /** Campos REQUERIDOS por el esquema que faltan en la propuesta (ausencia ≠ negativo). */
  missing_required: string[];
  source_fragment?: string;
}

export interface TaskPlanSummary {
  ready: number;
  suggested: number;
  discarded: number;
  blocked: number;
}

export interface TaskPlan {
  patient_id?: string;
  consultation_id?: string;
  resource: string;
  entries: TaskPlanEntry[];
  summary: TaskPlanSummary;
}

export type TaskPlanResult = { ok: true; plan: TaskPlan } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Disposición determinista por confianza (cuando no está bloqueada por RBAC/recurso). */
export function dispositionForConfidence(confidence: number | null): Exclude<TaskDisposition, "blocked"> {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    // Sin confianza declarada: a confirmar (ni se descarta ni se da por lista).
    return "suggested";
  }
  if (confidence >= READY_CONFIDENCE_THRESHOLD) return "ready";
  if (confidence >= SUGGEST_CONFIDENCE_FLOOR) return "suggested";
  return "discarded";
}

/** Cuenta las disposiciones (reutilizable tras los cambios del médico en el panel). */
export function summarizeTasks(
  entries: ReadonlyArray<Pick<TaskPlanEntry, "disposition">>,
): TaskPlanSummary {
  const summary: TaskPlanSummary = { ready: 0, suggested: 0, discarded: 0, blocked: 0 };
  for (const entry of entries) {
    summary[entry.disposition] += 1;
  }
  return summary;
}

function buildEntry(task: ProposedTask, ctx: ReviewContext): TaskPlanEntry {
  const resource = task.target_resource ?? TASK_RESOURCE;
  const label = task.label ?? stringField(task.proposed_values, "title") ?? "Tarea";
  const confidence = typeof task.confidence === "number" ? task.confidence : null;

  // 1) Validación contra el catálogo + RBAC (MISMA señal que el gating de tools del 0120).
  let blockedReason: string | null = null;
  if (ctx.knownResources.size > 0 && !ctx.knownResources.has(resource)) {
    blockedReason = `Recurso desconocido: '${resource}'.`;
  } else if (!ctx.creatable.has(resource)) {
    blockedReason = `El médico no tiene permiso para crear en '${resource}'.`;
  }

  // 2) Valores efectivos, descartando los campos ajenos al esquema (no se inventan ni coaccionan).
  const proposed = isObject(task.proposed_values) ? task.proposed_values : {};
  const allowed = ctx.schemaFields?.get(resource);
  const values: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(proposed)) {
    if (allowed && !allowed.has(field)) {
      dropped.push(field);
    } else {
      values[field] = value;
    }
  }

  // 3) Campos requeridos del esquema que faltan en la propuesta (ausencia ≠ negativo: sólo se marca).
  const required = ctx.requiredFields?.get(resource);
  const missingRequired: string[] = [];
  if (required) {
    for (const name of required) {
      const present = name in values && values[name] !== undefined && values[name] !== null && values[name] !== "";
      if (!present) missingRequired.push(name);
    }
  }

  // 4) Disposición: el bloqueo por RBAC/recurso gana; si no, reparte por confianza (determinista).
  const disposition: TaskDisposition = blockedReason ? "blocked" : dispositionForConfidence(confidence);

  const entry: TaskPlanEntry = {
    id: task.id,
    label,
    target_resource: resource,
    confidence,
    disposition,
    reason: blockedReason,
    values,
    dropped_fields: dropped,
    missing_required: missingRequired,
  };
  if (task.source_fragment) entry.source_fragment = task.source_fragment;
  return entry;
}

function stringField(values: unknown, key: string): string | undefined {
  if (!isObject(values)) return undefined;
  const value = values[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Construye el PLAN DE TAREAS a partir de las tareas detectadas. READ-ONLY: valida cada tarea contra
 * el catálogo + RBAC (las desconocidas/sin permiso quedan ``blocked`` con motivo, NO se descartan en
 * silencio), descarta campos fuera del esquema, marca los requeridos que faltan y reparte por
 * confianza en ready / suggested / discarded. No persiste nada: la creación real ocurre tarea por
 * tarea vía clinical.create_task_draft (cada una pasa por la aprobación P1).
 */
export function buildTaskPlan(input: TaskPlanInput, ctx: ReviewContext): TaskPlanResult {
  if (!isObject(input) || !Array.isArray(input.tasks)) {
    return { ok: false, error: "Se requiere una lista de tareas detectadas en 'tasks'." };
  }
  if (input.tasks.length === 0) {
    return { ok: false, error: "No hay tareas detectadas para revisar." };
  }
  if (input.tasks.length > MAX_TASKS) {
    return { ok: false, error: `Demasiadas tareas (máximo ${MAX_TASKS}).` };
  }

  const entries: TaskPlanEntry[] = [];
  const seen = new Set<string>();
  for (const task of input.tasks) {
    if (!isObject(task) || typeof task.id !== "string" || !task.id) {
      return { ok: false, error: "Cada tarea requiere un 'id' de texto." };
    }
    if (seen.has(task.id)) {
      return { ok: false, error: `Tarea duplicada: '${task.id}'.` };
    }
    seen.add(task.id);
    if (task.confidence !== undefined && typeof task.confidence !== "number") {
      return { ok: false, error: `La tarea '${task.id}' tiene 'confidence' no numérico.` };
    }
    entries.push(buildEntry(task, ctx));
  }

  const plan: TaskPlan = {
    resource: TASK_RESOURCE,
    entries,
    summary: summarizeTasks(entries),
  };
  if (input.patient_id) plan.patient_id = input.patient_id;
  if (input.consultation_id) plan.consultation_id = input.consultation_id;
  return { ok: true, plan };
}

/**
 * Aplica la decisión del médico sobre una entrada (en el panel), opcionalmente con valores editados.
 * Las entradas BLOQUEADAS no cambian (no se pueden forzar). Pura: el panel la usa para recomputar el
 * resumen sin lógica paralela. La decisión se mapea a la disposición efectiva del plan de cierre.
 */
export type TaskDecision = "accept" | "later" | "reject";

const DECISION_TO_DISPOSITION: Record<TaskDecision, TaskDisposition> = {
  accept: "ready",
  later: "suggested",
  reject: "discarded",
};

/** Decisión por defecto a partir de la disposición determinista (lista→aceptar; resto, su análogo). */
export function defaultDecision(disposition: TaskDisposition): TaskDecision {
  if (disposition === "ready") return "accept";
  if (disposition === "suggested") return "later";
  return "reject"; // discarded o blocked
}

export function applyTaskDecision(
  entry: TaskPlanEntry,
  decision: TaskDecision,
  editedValues?: Record<string, unknown>,
): TaskPlanEntry {
  if (entry.disposition === "blocked") return entry;
  const values = isObject(editedValues) ? { ...editedValues } : entry.values;
  return { ...entry, disposition: DECISION_TO_DISPOSITION[decision], values };
}

/** Especificación de UI del plan de tareas (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface TaskPlanSpec {
  kind: "task_plan";
  title?: string;
  plan: TaskPlan;
  confirm_label: string;
  confirm_prompt: string;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function describeValues(values: Record<string, unknown>): string {
  const parts = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([field, value]) => `${field}: ${formatValue(value)}`);
  return parts.length > 0 ? parts.join("; ") : "sin datos";
}

/**
 * Mensaje de seguimiento del plan: NO escribe nada; describe qué tareas aprobó el médico y le pide al
 * agente CREARLAS UNA POR UNA con clinical.create_task_draft (cada una pasa por la aprobación P1).
 * Nunca dispara una creación en lote que evite la aprobación. Las sugeridas/descartadas/bloqueadas se
 * reportan pero no se crean.
 */
export function buildTaskPlanSubmission(
  prompt: string,
  entries: ReadonlyArray<TaskPlanEntry>,
): string {
  const byDisposition = (target: TaskDisposition): TaskPlanEntry[] =>
    entries.filter((entry) => entry.disposition === target);

  const lines: string[] = [prompt];
  const ready = byDisposition("ready");
  if (ready.length > 0) {
    lines.push(`Crear como borrador (${ready.length}):`);
    for (const entry of ready) {
      lines.push(`- ${entry.label}: ${describeValues(entry.values)}`);
    }
  }
  const suggested = byDisposition("suggested");
  if (suggested.length > 0) {
    lines.push(`Sugeridas, dejar pendientes de confirmación (${suggested.length}):`);
    for (const entry of suggested) lines.push(`- ${entry.label}`);
  }
  const discarded = byDisposition("discarded");
  if (discarded.length > 0) {
    lines.push(`Descartadas (${discarded.length}):`);
    for (const entry of discarded) lines.push(`- ${entry.label}`);
  }
  const blocked = byDisposition("blocked");
  if (blocked.length > 0) {
    lines.push(`Bloqueadas (${blocked.length}):`);
    for (const entry of blocked) lines.push(`- ${entry.label}: ${entry.reason ?? "no disponible"}`);
  }
  lines.push(
    `Crea SÓLO las tareas marcadas para guardar, una por una con clinical.create_task_draft (recurso ` +
      `${TASK_RESOURCE}); cada creación requiere mi aprobación (P1). No crees nada en lote ni las ` +
      `sugeridas/descartadas/bloqueadas.`,
  );
  return lines.join("\n");
}
