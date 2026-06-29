// CIERRE CONSCIENTE POST-TRANSCRIPCIÓN (MP-CTRL-0120). Capa de ORQUESTACIÓN read-only sobre el
// camino de aprobación P1 POR ACCIÓN: dado un conjunto de acciones que el agente DETECTÓ de una
// consulta/transcripción, el médico las revisa TODAS juntas (aceptar/editar/rechazar cada una) y ve
// un resumen de cierre (qué se guardará como borrador / pendiente / descartado / bloqueado) ANTES de
// escribir nada. No es un camino de escritura nuevo: cada acción aceptada se ejecuta por su propia
// tool de escritura (cada una pasa por la aprobación P1). Aquí NADA se persiste; la extracción que
// PRODUCE las acciones es del runtime del agente (fuera de alcance).

export type DetectedActionStatus = "pending" | "accepted" | "edited" | "rejected";
export type ActionCategory = "clinical" | "administrative";

/** Acción detectada por el agente (entrada al seam). Los valores son propuestas, nunca se guardan. */
export interface DetectedAction {
  id: string;
  /** create_consultation | create_diagnosis | open_template:<id> | create_task | ... */
  type: string;
  label?: string;
  target_resource: string;
  template_id?: string;
  proposed_values?: Record<string, unknown>;
  /** Valores que el médico editó (se usan en vez de proposed_values cuando status = "edited"). */
  edited_values?: Record<string, unknown>;
  /** Estado actual del expediente para el diff (lo lee el agente; vacío en altas). */
  current_values?: Record<string, unknown>;
  source_fragment?: string;
  status?: DetectedActionStatus;
  category?: ActionCategory;
}

export interface DetectedActionsInput {
  patient_id?: string;
  consultation_id?: string;
  actions: DetectedAction[];
}

export type CloseOutDisposition = "save_draft" | "pending" | "discarded" | "blocked";

export interface FieldDiff {
  field: string;
  before: unknown; // undefined si el campo es nuevo
  after: unknown;
  change: "added" | "changed";
}

export interface CloseOutEntry {
  id: string;
  type: string;
  label: string;
  target_resource: string;
  template_id?: string;
  category: ActionCategory;
  disposition: CloseOutDisposition;
  /** Motivo cuando la acción queda bloqueada (recurso desconocido / sin permiso); si no, null. */
  reason: string | null;
  /** Valores efectivos SÓLO de campos del esquema (los ajenos caen en dropped_fields). */
  values: Record<string, unknown>;
  /** Campos propuestos que NO existen en el esquema del recurso: se descartan (no se inventan). */
  dropped_fields: string[];
  /** Diferencia read-only contra el expediente actual (qué agregaría/cambiaría si se aprueba). */
  diff: FieldDiff[];
  /** Estado actual del expediente (para recomputar el diff si el médico edita en el panel). */
  current_values?: Record<string, unknown>;
  source_fragment?: string;
}

export interface CloseOutSummary {
  save_draft: number;
  pending: number;
  discarded: number;
  blocked: number;
}

export interface CloseOutPlan {
  patient_id?: string;
  consultation_id?: string;
  entries: CloseOutEntry[];
  summary: CloseOutSummary;
}

/** Contexto de validación (señales de RBAC/esquema del catálogo de recursos, read-only). */
export interface ReviewContext {
  /** Recursos en los que el rol PUEDE crear (forms.create presente). */
  creatable: ReadonlySet<string>;
  /** Recursos que existen en el catálogo (para distinguir "desconocido" de "sin permiso"). */
  knownResources: ReadonlySet<string>;
  /** Campos del formulario de creación por recurso (para descartar campos ajenos al esquema). */
  schemaFields?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Campos REQUERIDOS del formulario de creación por recurso (para marcar lo que falta). */
  requiredFields?: ReadonlyMap<string, ReadonlySet<string>>;
}

export type CloseOutResult = { ok: true; plan: CloseOutPlan } | { ok: false; error: string };

const MAX_ACTIONS = 50;
const ADMINISTRATIVE_RESOURCES = new Set(["appointments", "clinical_tasks"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Id de plantilla de una acción ``open_template:<id>`` (o el template_id explícito). */
export function templateIdOf(action: DetectedAction): string | undefined {
  if (action.type.startsWith("open_template:")) {
    const suffix = action.type.slice("open_template:".length).trim();
    if (suffix) return suffix;
  }
  return action.template_id;
}

/** Valores efectivos: los editados por el médico si la acción fue editada; si no, los propuestos. */
export function effectiveValues(action: DetectedAction): Record<string, unknown> {
  if (action.status === "edited" && isObject(action.edited_values)) {
    return action.edited_values;
  }
  return isObject(action.proposed_values) ? action.proposed_values : {};
}

function categoryOf(action: DetectedAction): ActionCategory {
  if (action.category) return action.category;
  return ADMINISTRATIVE_RESOURCES.has(action.target_resource) ? "administrative" : "clinical";
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Diff read-only de los valores efectivos contra el estado actual (nunca inventa ausentes). */
function computeDiff(
  values: Record<string, unknown>,
  current: Record<string, unknown> | undefined,
): FieldDiff[] {
  const base = isObject(current) ? current : {};
  const diff: FieldDiff[] = [];
  for (const [field, after] of Object.entries(values)) {
    if (!(field in base)) {
      diff.push({ field, before: undefined, after, change: "added" });
    } else if (!valuesEqual(base[field], after)) {
      diff.push({ field, before: base[field], after, change: "changed" });
    }
  }
  return diff;
}

/** Cuenta las disposiciones (reutilizable tras los cambios del médico en el panel). */
export function summarize(entries: ReadonlyArray<Pick<CloseOutEntry, "disposition">>): CloseOutSummary {
  const summary: CloseOutSummary = { save_draft: 0, pending: 0, discarded: 0, blocked: 0 };
  for (const entry of entries) {
    summary[entry.disposition] += 1;
  }
  return summary;
}

function buildEntry(action: DetectedAction, ctx: ReviewContext): CloseOutEntry {
  const category = categoryOf(action);
  const label = action.label ?? action.type;
  const templateId = templateIdOf(action);
  const resource = action.target_resource;

  // 1) Validación contra el catálogo + RBAC (reusa la misma señal que el gating de tools).
  let blockedReason: string | null = null;
  if (action.type.startsWith("open_template:") && !templateId) {
    blockedReason = "Falta el id de la plantilla de la acción.";
  } else if (ctx.knownResources.size > 0 && !ctx.knownResources.has(resource)) {
    blockedReason = `Recurso desconocido: '${resource}'.`;
  } else if (!ctx.creatable.has(resource)) {
    blockedReason = `El médico no tiene permiso para crear en '${resource}'.`;
  }

  // 2) Valores efectivos, descartando los campos ajenos al esquema (no se inventan ni coaccionan).
  const effective = effectiveValues(action);
  const allowed = ctx.schemaFields?.get(resource);
  const values: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(effective)) {
    if (allowed && !allowed.has(field)) {
      dropped.push(field);
    } else {
      values[field] = value;
    }
  }

  // 3) Disposición de cierre.
  let disposition: CloseOutDisposition;
  if (blockedReason) {
    disposition = "blocked";
  } else if (action.status === "rejected") {
    disposition = "discarded";
  } else if (action.status === "accepted" || action.status === "edited") {
    disposition = "save_draft";
  } else {
    disposition = "pending"; // pendiente de confirmación (status pending o ausente)
  }

  // 4) Diff sólo de lo que podría guardarse (borrador o pendiente); bloqueadas/descartadas no.
  const diff =
    disposition === "save_draft" || disposition === "pending"
      ? computeDiff(values, action.current_values)
      : [];

  const entry: CloseOutEntry = {
    id: action.id,
    type: action.type,
    label,
    target_resource: resource,
    category,
    disposition,
    reason: blockedReason,
    values,
    dropped_fields: dropped,
    diff,
  };
  if (templateId) entry.template_id = templateId;
  if (isObject(action.current_values)) entry.current_values = action.current_values;
  if (action.source_fragment) entry.source_fragment = action.source_fragment;
  return entry;
}

/**
 * Aplica la decisión del médico sobre una entrada (en el panel), opcionalmente con valores editados.
 * Las entradas BLOQUEADAS no cambian (no se pueden forzar). Recalcula el diff con los valores
 * efectivos contra el estado actual. Pura: el panel la usa para recomputar sin lógica paralela.
 */
export function applyDecision(
  entry: CloseOutEntry,
  decision: "save_draft" | "pending" | "discarded",
  editedValues?: Record<string, unknown>,
): CloseOutEntry {
  if (entry.disposition === "blocked") return entry;
  const values = isObject(editedValues) ? { ...editedValues } : entry.values;
  const diff = decision === "discarded" ? [] : computeDiff(values, entry.current_values);
  return { ...entry, disposition: decision, values, diff };
}

/**
 * Construye el PLAN DE CIERRE a partir del conjunto de acciones detectadas. READ-ONLY: valida cada
 * acción contra el catálogo + RBAC (las desconocidas/sin permiso quedan ``blocked`` con motivo, NO
 * se descartan en silencio), calcula el diff contra el expediente y reparte en save_draft / pending
 * / discarded / blocked. No persiste nada: la escritura real ocurre acción por acción vía P1.
 */
export function buildCloseOutPlan(
  input: DetectedActionsInput,
  ctx: ReviewContext,
): CloseOutResult {
  if (!isObject(input) || !Array.isArray(input.actions)) {
    return { ok: false, error: "Se requiere una lista de acciones detectadas en 'actions'." };
  }
  if (input.actions.length === 0) {
    return { ok: false, error: "No hay acciones detectadas para revisar." };
  }
  if (input.actions.length > MAX_ACTIONS) {
    return { ok: false, error: `Demasiadas acciones (máximo ${MAX_ACTIONS}).` };
  }

  const entries: CloseOutEntry[] = [];
  const seen = new Set<string>();
  for (const action of input.actions) {
    if (!isObject(action) || typeof action.id !== "string" || !action.id) {
      return { ok: false, error: "Cada acción requiere un 'id' de texto." };
    }
    if (seen.has(action.id)) {
      return { ok: false, error: `Acción duplicada: '${action.id}'.` };
    }
    seen.add(action.id);
    if (typeof action.type !== "string" || !action.type) {
      return { ok: false, error: `La acción '${action.id}' requiere 'type'.` };
    }
    if (typeof action.target_resource !== "string" || !action.target_resource) {
      return { ok: false, error: `La acción '${action.id}' requiere 'target_resource'.` };
    }
    entries.push(buildEntry(action, ctx));
  }

  const plan: CloseOutPlan = {
    entries,
    summary: summarize(entries),
  };
  if (input.patient_id) plan.patient_id = input.patient_id;
  if (input.consultation_id) plan.consultation_id = input.consultation_id;
  return { ok: true, plan };
}

/** Entrada mínima del catálogo de recursos que necesita el seam (subconjunto de ResourceCatalog). */
export interface CatalogResourceLike {
  name: string;
  forms?: { create?: { fields?: ReadonlyArray<{ name: string; required?: boolean }> } | null } | null;
}

/**
 * Deriva el contexto de validación del catálogo de recursos (``/api/v1/resources``), ya proyectado
 * por permiso: ``forms.create`` sólo está presente si el rol puede crear ese recurso (MISMA señal
 * que el gating de tools). Read-only; no infiere permisos ajenos al catálogo. ``requiredFields``
 * lista los campos requeridos de la creación (aditivo: 0120 no lo usa; 0129 marca lo que falta).
 */
export function reviewContextFromCatalog(
  catalog: ReadonlyArray<CatalogResourceLike>,
): ReviewContext {
  const creatable = new Set<string>();
  const knownResources = new Set<string>();
  const schemaFields = new Map<string, ReadonlySet<string>>();
  const requiredFields = new Map<string, ReadonlySet<string>>();
  for (const resource of catalog) {
    knownResources.add(resource.name);
    const create = resource.forms?.create;
    if (create) {
      creatable.add(resource.name);
      const fields = create.fields ?? [];
      schemaFields.set(resource.name, new Set(fields.map((field) => field.name)));
      requiredFields.set(
        resource.name,
        new Set(fields.filter((field) => field.required).map((field) => field.name)),
      );
    }
  }
  return { creatable, knownResources, schemaFields, requiredFields };
}

/** Especificación de UI del panel de cierre (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface DetectedActionsSpec {
  kind: "detected_actions";
  title?: string;
  plan: CloseOutPlan;
  confirm_label: string;
  confirm_prompt: string;
}

function describeDiff(diff: FieldDiff[]): string {
  if (diff.length === 0) return "sin cambios";
  return diff
    .map((d) =>
      d.change === "added"
        ? `${d.field}: ${formatValue(d.after)}`
        : `${d.field}: ${formatValue(d.before)} → ${formatValue(d.after)}`,
    )
    .join("; ");
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Mensaje de seguimiento del cierre: NO escribe nada; describe qué decidió el médico y le pide al
 * agente proceder ACCIÓN POR ACCIÓN con su propia tool de escritura (cada una pasa por la
 * aprobación P1). Nunca dispara una escritura en lote que evite la aprobación.
 */
export function buildCloseOutSubmission(prompt: string, entries: ReadonlyArray<CloseOutEntry>): string {
  const byDisposition = (target: CloseOutDisposition): CloseOutEntry[] =>
    entries.filter((entry) => entry.disposition === target);

  const lines: string[] = [prompt];
  const save = byDisposition("save_draft");
  if (save.length > 0) {
    lines.push(`Guardar como borrador (${save.length}):`);
    for (const entry of save) {
      lines.push(`- ${entry.label} [${entry.target_resource}]: ${describeDiff(entry.diff)}`);
    }
  }
  const pending = byDisposition("pending");
  if (pending.length > 0) {
    lines.push(`Pendientes de confirmación (${pending.length}):`);
    for (const entry of pending) lines.push(`- ${entry.label} [${entry.target_resource}]`);
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
    "Procede acción por acción usando la herramienta de escritura de cada una; cada guardado " +
      "requiere mi aprobación (P1). No guardes nada en lote.",
  );
  return lines.join("\n");
}
