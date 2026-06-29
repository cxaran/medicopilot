// CHECKLIST DE CIERRE DE CONSULTA (MP-CTRL-0131, épica conversación→expediente). Cierra el ÚLTIMO
// tramo del flujo post-consulta 1-17 de [[hybrid-ui-architecture]]: tras revisar las acciones
// detectadas (0120 [[detected-actions]]) y los planes de tareas (0129 [[task-plan]]) y guardarlas
// como BORRADOR, antes de firmar la nota y cerrar la consulta, el médico revisa una CHECKLIST de
// cierre + un RESUMEN consolidado (guardado/pendiente/descartado). Es ORQUESTACIÓN read-only: la
// plataforma clasifica los ítems de forma DETERMINISTA y calcula si la consulta está LISTA PARA
// CERRAR, pero NADA se cierra/firma solo — firmar la nota y cerrar la consulta siguen por el camino
// de aprobación/escritura EXISTENTE (P1). El agente PROPONE los ítems (su evaluación de la consulta);
// la plataforma los valida contra el contrato + RBAC y NO inventa ítems ni estados (ausencia ≠
// negativo). Reusa el contexto catálogo+RBAC de [[detected-actions]]; sin renderizador paralelo.

import {
  reviewContextFromCatalog,
  type CatalogResourceLike,
  type ReviewContext,
} from "./detected-actions";

export { reviewContextFromCatalog };
export type { CatalogResourceLike, ReviewContext };

const MAX_ITEMS = 40;

/** Estado de un ítem de cierre. ``blocked`` lo fija la plataforma (RBAC/recurso), no el médico. */
export type ChecklistStatus = "done" | "pending" | "not_applicable" | "blocked";
/** Nivel de exigencia: los ``required`` pendientes impiden marcar la consulta como lista. */
export type ChecklistRequirement = "required" | "recommended" | "optional";

const STATUSES: ReadonlySet<string> = new Set(["done", "pending", "not_applicable", "blocked"]);
const REQUIREMENTS: ReadonlySet<string> = new Set(["required", "recommended", "optional"]);

/** Ítem de cierre PROPUESTO por el agente (su evaluación). Los estados son propuestas, no verdades. */
export interface ProposedChecklistItem {
  id: string;
  label: string;
  status?: ChecklistStatus;
  requirement?: ChecklistRequirement;
  detail?: string;
  source_fragment?: string;
  /** Recurso relacionado (p. ej. clinical_notes, prescriptions); se valida contra el contrato. */
  related_resource?: string;
}

/** Resumen consolidado de lo que el médico ya decidió sobre las acciones detectadas (post-confirm). */
export interface ActionsSummary {
  saved: number;
  pending: number;
  discarded: number;
  blocked: number;
}

export interface CloseChecklistInput {
  consultation_id?: string;
  patient_id?: string;
  items: ProposedChecklistItem[];
  /** Conteos del cierre de acciones (0120) ya confirmado; sólo para mostrar el resumen consolidado. */
  actions_summary?: ActionsSummary;
}

export interface ChecklistEntry {
  id: string;
  label: string;
  status: ChecklistStatus;
  requirement: ChecklistRequirement;
  detail?: string;
  source_fragment?: string;
  related_resource?: string;
  /** Motivo cuando el ítem queda ``blocked`` (recurso fuera del contrato/permiso); si no, null. */
  reason: string | null;
}

export interface ChecklistSummary {
  done: number;
  pending: number;
  not_applicable: number;
  blocked: number;
  /** Requeridos NO satisfechos (pending o blocked): si > 0, la consulta no está lista para cerrar. */
  required_pending: number;
}

export interface CloseChecklist {
  consultation_id?: string;
  patient_id?: string;
  entries: ChecklistEntry[];
  summary: ChecklistSummary;
  actions_summary?: ActionsSummary;
  /** true sólo si NINGÚN ítem requerido está pendiente o bloqueado. El médico igual confirma. */
  ready_to_close: boolean;
}

export type CloseChecklistResult =
  | { ok: true; checklist: CloseChecklist }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): ChecklistStatus {
  // El estado lo PROPONE el agente; un valor inválido o ausente cae a "pending" (nunca se asume
  // "done": ausencia ≠ satisfecho). "blocked" propuesto por el agente se ignora aquí (lo fija la
  // plataforma por RBAC/recurso); se trata como "pending" hasta que la validación lo bloquee.
  if (typeof value === "string" && STATUSES.has(value) && value !== "blocked") {
    return value as ChecklistStatus;
  }
  return "pending";
}

function normalizeRequirement(value: unknown): ChecklistRequirement {
  if (typeof value === "string" && REQUIREMENTS.has(value)) {
    return value as ChecklistRequirement;
  }
  return "recommended";
}

function buildEntry(item: ProposedChecklistItem, ctx: ReviewContext): ChecklistEntry {
  const requirement = normalizeRequirement(item.requirement);
  let status = normalizeStatus(item.status);
  let reason: string | null = null;

  // Validación contra el contrato: si el ítem nombra un recurso, debe existir en el catálogo
  // (proyectado por permiso ⇒ misma señal RBAC que 0120/0129). Si no, se BLOQUEA con motivo (no se
  // marca como hecho ni se descarta en silencio).
  const resource = item.related_resource;
  if (resource && ctx.knownResources.size > 0 && !ctx.knownResources.has(resource)) {
    status = "blocked";
    reason = `Recurso fuera del contrato o sin acceso: '${resource}'.`;
  }

  const entry: ChecklistEntry = { id: item.id, label: item.label, status, requirement, reason };
  if (resource) entry.related_resource = resource;
  if (typeof item.detail === "string" && item.detail) entry.detail = item.detail;
  if (typeof item.source_fragment === "string" && item.source_fragment) {
    entry.source_fragment = item.source_fragment;
  }
  return entry;
}

/** ¿El ítem satisface el cierre? done o not_applicable cuentan como resueltos; pending/blocked no. */
function isResolved(status: ChecklistStatus): boolean {
  return status === "done" || status === "not_applicable";
}

/** Resume los estados y calcula los requeridos no satisfechos (reutilizable tras cambios del médico). */
export function summarizeChecklist(
  entries: ReadonlyArray<Pick<ChecklistEntry, "status" | "requirement">>,
): ChecklistSummary {
  const summary: ChecklistSummary = {
    done: 0,
    pending: 0,
    not_applicable: 0,
    blocked: 0,
    required_pending: 0,
  };
  for (const entry of entries) {
    summary[entry.status] += 1;
    if (entry.requirement === "required" && !isResolved(entry.status)) {
      summary.required_pending += 1;
    }
  }
  return summary;
}

/** La consulta está lista para cerrar sólo si ningún requerido quedó pendiente/bloqueado. */
export function isReadyToClose(
  entries: ReadonlyArray<Pick<ChecklistEntry, "status" | "requirement">>,
): boolean {
  return summarizeChecklist(entries).required_pending === 0;
}

/**
 * Aplica la decisión del médico sobre un ítem (en el panel). Los ítems BLOQUEADOS no cambian (no se
 * pueden forzar a hecho). Pura: el panel la usa para recomputar el resumen/listo sin lógica paralela.
 */
export function applyChecklistStatus(
  entry: ChecklistEntry,
  status: Exclude<ChecklistStatus, "blocked">,
): ChecklistEntry {
  if (entry.status === "blocked") return entry;
  return { ...entry, status };
}

function normalizeActionsSummary(value: unknown): ActionsSummary | undefined {
  if (!isObject(value)) return undefined;
  const num = (key: string): number => {
    const raw = value[key];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  };
  return { saved: num("saved"), pending: num("pending"), discarded: num("discarded"), blocked: num("blocked") };
}

/**
 * Construye la CHECKLIST DE CIERRE a partir de los ítems propuestos por el agente. READ-ONLY: valida
 * cada ítem contra el contrato + RBAC (los que nombran un recurso desconocido/sin acceso quedan
 * ``blocked`` con motivo), clasifica el estado de forma determinista (sin inventar ni asumir "done")
 * y calcula si la consulta está lista para cerrar. No cierra ni firma nada: eso es P1.
 */
export function buildCloseChecklist(
  input: CloseChecklistInput,
  ctx: ReviewContext,
): CloseChecklistResult {
  if (!isObject(input) || !Array.isArray(input.items)) {
    return { ok: false, error: "Se requiere una lista de ítems de cierre en 'items'." };
  }
  if (input.items.length === 0) {
    return { ok: false, error: "No hay ítems de cierre para revisar." };
  }
  if (input.items.length > MAX_ITEMS) {
    return { ok: false, error: `Demasiados ítems (máximo ${MAX_ITEMS}).` };
  }

  const entries: ChecklistEntry[] = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!isObject(item) || typeof item.id !== "string" || !item.id) {
      return { ok: false, error: "Cada ítem requiere un 'id' de texto." };
    }
    if (seen.has(item.id)) {
      return { ok: false, error: `Ítem duplicado: '${item.id}'.` };
    }
    seen.add(item.id);
    if (typeof item.label !== "string" || !item.label) {
      return { ok: false, error: `El ítem '${item.id}' requiere 'label'.` };
    }
    entries.push(buildEntry(item, ctx));
  }

  const summary = summarizeChecklist(entries);
  const checklist: CloseChecklist = {
    entries,
    summary,
    ready_to_close: summary.required_pending === 0,
  };
  if (input.consultation_id) checklist.consultation_id = input.consultation_id;
  if (input.patient_id) checklist.patient_id = input.patient_id;
  const actionsSummary = normalizeActionsSummary(input.actions_summary);
  if (actionsSummary) checklist.actions_summary = actionsSummary;
  return { ok: true, checklist };
}

/** Especificación de UI de la checklist (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface CloseChecklistSpec {
  kind: "close_checklist";
  title?: string;
  checklist: CloseChecklist;
  confirm_label: string;
  confirm_prompt: string;
}

const STATUS_TEXT: Record<ChecklistStatus, string> = {
  done: "hecho",
  pending: "pendiente",
  not_applicable: "no aplica",
  blocked: "bloqueado",
};

/**
 * Mensaje de seguimiento del cierre: NO cierra ni firma nada; describe el estado de la checklist y
 * deja explícito que firmar la nota y cerrar la consulta siguen por el camino de aprobación (P1). Si
 * quedan requeridos pendientes, lo dice y NO sugiere cerrar. Nunca dispara un cierre automático.
 */
export function buildCloseChecklistSubmission(
  prompt: string,
  checklist: CloseChecklist,
): string {
  const lines: string[] = [prompt];

  if (checklist.actions_summary) {
    const a = checklist.actions_summary;
    lines.push(
      `Resumen de acciones: ${a.saved} guardadas (borrador) · ${a.pending} pendientes · ` +
        `${a.discarded} descartadas · ${a.blocked} bloqueadas.`,
    );
  }

  const byStatus = (status: ChecklistStatus): ChecklistEntry[] =>
    checklist.entries.filter((entry) => entry.status === status);

  const pendingRequired = checklist.entries.filter(
    (entry) => entry.requirement === "required" && !isResolved(entry.status),
  );
  const done = byStatus("done");
  if (done.length > 0) {
    lines.push(`Cumplido (${done.length}):`);
    for (const entry of done) lines.push(`- ${entry.label}`);
  }
  const pending = checklist.entries.filter(
    (entry) => entry.status === "pending" || entry.status === "blocked",
  );
  if (pending.length > 0) {
    lines.push(`Por resolver (${pending.length}):`);
    for (const entry of pending) {
      const reqTag = entry.requirement === "required" ? " [requerido]" : "";
      const reasonTag = entry.reason ? ` (${entry.reason})` : "";
      lines.push(`- ${entry.label}${reqTag}: ${STATUS_TEXT[entry.status]}${reasonTag}`);
    }
  }

  if (checklist.ready_to_close) {
    lines.push(
      "La checklist no tiene requeridos pendientes. Si decides cerrar, firma la nota y cierra la " +
        "consulta por el camino de aprobación habitual (P1); nada se cierra ni se firma de forma " +
        "automática.",
    );
  } else {
    lines.push(
      `Aún hay ${pendingRequired.length} requerido(s) sin resolver: NO cierres la consulta todavía. ` +
        "Resuélvelos primero (cada acción por su herramienta, con mi aprobación P1).",
    );
  }
  return lines.join("\n");
}
