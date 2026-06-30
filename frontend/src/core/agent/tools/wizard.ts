// ASISTENTE MULTI-PASO GUIADO (MP-CTRL-0139, épica conversación→expediente, casos 121, 182-186). Cuando
// el médico pide un flujo guiado ("guíame paso a paso para registrar al paciente, su historia clínica y
// abrir la consulta", "asistente para una primera consulta pediátrica"), el agente propone una SECUENCIA
// ORDENADA de pasos —cada uno apunta a un recurso a crear o a una plantilla registrada a abrir— con
// DEPENDENCIAS entre entidades (la consulta depende de que exista el paciente). Esta capa valida cada
// paso contra el catálogo + RBAC, calcula qué falta y resuelve cuál es el PASO ACTUAL (el primero
// pendiente cuyas dependencias ya están hechas). Es ORQUESTACIÓN read-only sobre el camino P1: NADA se
// persiste aquí; el agente avanza UN paso a la vez con la tool de escritura de ese paso (cada guardado
// pasa por la aprobación P1). No es un camino de escritura nuevo ni ejecuta nada en lote.
//
// Reusa el catálogo + RBAC de [[detected-actions]] (creatable/knownResources/schemaFields/requiredFields).
// Mismas reglas que [[task-plan]]: sin permiso o recurso desconocido BLOQUEA con motivo (no se descarta
// en silencio), los campos fuera del esquema se DESCARTAN (no se inventan) y la ausencia de un campo NO
// es un valor negativo (queda vacío / se marca como requerido faltante).

import {
  reviewContextFromCatalog,
  type CatalogResourceLike,
  type ReviewContext,
} from "./detected-actions";

export { reviewContextFromCatalog };
export type { CatalogResourceLike, ReviewContext };

const MAX_STEPS = 30;

/** Paso propuesto por el agente (entrada al seam). Los valores son propuestas, nunca se guardan. */
export interface WizardStepInput {
  id: string;
  title?: string;
  /** Tipo de acción (create_patient | open_template:<id> | create_consultation | ...). */
  type?: string;
  target_resource: string;
  template_id?: string;
  proposed_values?: Record<string, unknown>;
  /** El agente marca 'done' si el paso ya se completó (p. ej. el paciente ya existe); por defecto pendiente. */
  status?: "pending" | "done";
  /** Ids de pasos previos que deben completarse antes (dependencias entre entidades). */
  depends_on?: string[];
  source_fragment?: string;
}

export interface WizardInput {
  patient_id?: string;
  consultation_id?: string;
  steps: WizardStepInput[];
}

export type WizardStepState = "done" | "current" | "pending" | "blocked";

export interface WizardStep {
  id: string;
  title: string;
  type: string;
  target_resource: string;
  template_id?: string;
  state: WizardStepState;
  /** Motivo cuando queda bloqueado por RBAC/recurso desconocido; si no, null. */
  reason: string | null;
  /** Valores efectivos SÓLO de campos del esquema (los ajenos caen en ``dropped_fields``). */
  values: Record<string, unknown>;
  /** Campos propuestos que NO existen en el esquema de creación: se descartan (no se inventan). */
  dropped_fields: string[];
  /** Campos REQUERIDOS por el esquema que faltan en la propuesta (ausencia ≠ negativo). */
  missing_required: string[];
  depends_on: string[];
  /** Dependencias aún NO completadas (subconjunto de depends_on); si no está vacío, el paso no puede iniciar. */
  blocked_by: string[];
  source_fragment?: string;
}

export interface WizardSummary {
  total: number;
  done: number;
  pending: number;
  blocked: number;
}

export interface WizardPlan {
  patient_id?: string;
  consultation_id?: string;
  steps: WizardStep[];
  /** Id del paso ACTUAL (primer pendiente con dependencias hechas y sin bloqueo RBAC); null si no hay. */
  current_step_id: string | null;
  summary: WizardSummary;
}

export type WizardResult = { ok: true; plan: WizardPlan } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Id de plantilla de un paso (``open_template:<id>`` en el type, o el ``template_id`` explícito). */
function templateOf(step: WizardStepInput): string | undefined {
  const type = step.type ?? "";
  if (type.startsWith("open_template:")) {
    const suffix = type.slice("open_template:".length).trim();
    if (suffix) return suffix;
  }
  return step.template_id;
}

function buildStep(
  step: WizardStepInput,
  ctx: ReviewContext,
  doneIds: ReadonlySet<string>,
): WizardStep {
  const resource = step.target_resource;
  const type = step.type ?? `create:${resource}`;
  const templateId = templateOf(step);
  const title = step.title ?? type;

  // 1) Validación contra el catálogo + RBAC (MISMA señal que el gating de tools del 0120/0129).
  let blockedReason: string | null = null;
  if (type.startsWith("open_template:") && !templateId) {
    blockedReason = "Falta el id de la plantilla del paso.";
  } else if (ctx.knownResources.size > 0 && !ctx.knownResources.has(resource)) {
    blockedReason = `Recurso desconocido: '${resource}'.`;
  } else if (!ctx.creatable.has(resource)) {
    blockedReason = `El médico no tiene permiso para crear en '${resource}'.`;
  }

  // 2) Valores efectivos, descartando los campos ajenos al esquema (no se inventan ni coaccionan).
  const proposed = isObject(step.proposed_values) ? step.proposed_values : {};
  const allowed = ctx.schemaFields?.get(resource);
  const values: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(proposed)) {
    if (allowed && !allowed.has(field)) dropped.push(field);
    else values[field] = value;
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

  // 4) Dependencias aún no completadas (las que no están en el conjunto de pasos ya hechos).
  const dependsOn = Array.isArray(step.depends_on) ? step.depends_on.filter((d) => typeof d === "string") : [];
  const blockedBy = dependsOn.filter((d) => !doneIds.has(d));

  // 5) Estado del paso: el bloqueo RBAC/recurso gana; luego 'done' del agente; el resto queda pendiente
  //    (más tarde se eleva UNO a 'current'). Las dependencias no cumplidas no marcan 'blocked' (es
  //    temporal: se resuelven al avanzar), pero sí impiden ser el paso actual.
  let state: WizardStepState;
  if (blockedReason) state = "blocked";
  else if (step.status === "done") state = "done";
  else state = "pending";

  const entry: WizardStep = {
    id: step.id,
    title,
    type,
    target_resource: resource,
    state,
    reason: blockedReason,
    values,
    dropped_fields: dropped,
    missing_required: missingRequired,
    depends_on: dependsOn,
    blocked_by: blockedBy,
  };
  if (templateId) entry.template_id = templateId;
  if (step.source_fragment) entry.source_fragment = step.source_fragment;
  return entry;
}

function summarize(steps: ReadonlyArray<Pick<WizardStep, "state">>): WizardSummary {
  const summary: WizardSummary = { total: steps.length, done: 0, pending: 0, blocked: 0 };
  for (const step of steps) {
    if (step.state === "done") summary.done += 1;
    else if (step.state === "blocked") summary.blocked += 1;
    else summary.pending += 1; // pending + current
  }
  return summary;
}

/**
 * Construye el PLAN del asistente a partir de los pasos propuestos. READ-ONLY: valida cada paso contra el
 * catálogo + RBAC (desconocido/sin permiso = ``blocked`` con motivo), descarta campos fuera del esquema,
 * marca los requeridos que faltan, respeta las dependencias entre pasos y resuelve el PASO ACTUAL (el
 * primero pendiente cuyas dependencias ya están hechas y sin bloqueo). No persiste nada: el agente avanza
 * un paso a la vez con la tool de escritura del paso (cada guardado pasa por la aprobación P1).
 */
export function buildWizardPlan(input: WizardInput, ctx: ReviewContext): WizardResult {
  if (!isObject(input) || !Array.isArray(input.steps)) {
    return { ok: false, error: "Se requiere una lista de pasos en 'steps'." };
  }
  if (input.steps.length === 0) {
    return { ok: false, error: "El asistente no tiene pasos." };
  }
  if (input.steps.length > MAX_STEPS) {
    return { ok: false, error: `Demasiados pasos (máximo ${MAX_STEPS}).` };
  }

  const ids = new Set<string>();
  for (const step of input.steps) {
    if (!isObject(step) || typeof step.id !== "string" || !step.id) {
      return { ok: false, error: "Cada paso requiere un 'id' de texto." };
    }
    if (ids.has(step.id)) {
      return { ok: false, error: `Paso duplicado: '${step.id}'.` };
    }
    ids.add(step.id);
    if (typeof step.target_resource !== "string" || !step.target_resource) {
      return { ok: false, error: `El paso '${step.id}' requiere 'target_resource'.` };
    }
  }
  // Las dependencias deben referir a pasos existentes (no se inventan ni se ignoran en silencio).
  for (const step of input.steps) {
    for (const dep of Array.isArray(step.depends_on) ? step.depends_on : []) {
      if (typeof dep === "string" && !ids.has(dep)) {
        return { ok: false, error: `El paso '${step.id}' depende de un paso inexistente: '${dep}'.` };
      }
    }
  }

  const doneIds = new Set(
    input.steps.filter((step) => step.status === "done").map((step) => step.id),
  );
  const steps = input.steps.map((step) => buildStep(step, ctx, doneIds));

  // PASO ACTUAL: el primero pendiente, sin bloqueo RBAC y con todas sus dependencias ya hechas.
  let currentStepId: string | null = null;
  for (const step of steps) {
    if (step.state === "pending" && step.blocked_by.length === 0) {
      step.state = "current";
      currentStepId = step.id;
      break;
    }
  }

  const plan: WizardPlan = {
    steps,
    current_step_id: currentStepId,
    summary: summarize(steps),
  };
  if (input.patient_id) plan.patient_id = input.patient_id;
  if (input.consultation_id) plan.consultation_id = input.consultation_id;
  return { ok: true, plan };
}

/** Especificación de UI del asistente (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface WizardSpec {
  kind: "wizard";
  title?: string;
  plan: WizardPlan;
  confirm_label: string;
  confirm_prompt: string;
}

function describeStepTarget(step: WizardStep): string {
  return step.template_id
    ? `abre la plantilla '${step.template_id}'`
    : `usa la herramienta de creación de ${step.target_resource}`;
}

/**
 * Mensaje de seguimiento del asistente: NO escribe nada; describe el orden de los pasos y le pide al
 * agente avanzar SÓLO con el PASO ACTUAL (uno a la vez) con su tool de escritura, que pasa por la
 * aprobación P1. Nunca dispara los pasos en lote ni se salta el orden/las dependencias.
 */
export function buildWizardSubmission(prompt: string, plan: WizardPlan): string {
  const lines: string[] = [prompt];
  lines.push(`Pasos (${plan.summary.done}/${plan.summary.total} hechos):`);
  plan.steps.forEach((step, index) => {
    const tag =
      step.state === "done"
        ? "[hecho]"
        : step.state === "current"
          ? "[actual]"
          : step.state === "blocked"
            ? `[bloqueado: ${step.reason ?? "no disponible"}]`
            : step.blocked_by.length > 0
              ? `[espera: ${step.blocked_by.join(", ")}]`
              : "[pendiente]";
    const missing = step.missing_required.length > 0 ? ` — faltan: ${step.missing_required.join(", ")}` : "";
    lines.push(`${index + 1}. ${tag} ${step.title} [${step.target_resource}]${missing}`);
  });

  const current = plan.steps.find((step) => step.id === plan.current_step_id);
  if (current) {
    lines.push(
      `Avanza SÓLO con el paso actual ("${current.title}"): ${describeStepTarget(current)}. ` +
        `Requiere mi aprobación (P1). Cuando lo apruebe, continúa con el siguiente paso; no te saltes el ` +
        `orden ni las dependencias, y no ejecutes pasos en lote.`,
    );
  } else if (plan.summary.done === plan.summary.total) {
    lines.push("Todos los pasos están hechos; el flujo está completo.");
  } else {
    lines.push("No hay un paso disponible ahora (pasos bloqueados o a la espera de dependencias).");
  }
  return lines.join("\n");
}
