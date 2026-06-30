// COMPARACIÓN DEDICADA ANTES/DESPUÉS para una ACTUALIZACIÓN de un registro existente (MP-CTRL-0137).
// Cuando el médico quiere cambiar un dato YA guardado (ajustar la dosis de una receta vigente, corregir
// la fecha de nacimiento, conciliar una medicación), el agente LEE el estado actual del registro y
// PROPONE los nuevos valores; esta capa arma una vista campo-a-campo (actual → propuesto) para revisar
// ANTES de escribir. Es READ-ONLY y ORQUESTACIÓN sobre el camino P1: NADA se guarda aquí; al confirmar,
// el agente aplica la edición con la tool de actualización del recurso (que pasa por la aprobación P1).
//
// A diferencia del panel de cierre (detected-actions, orientado a ALTAS y gateado por `creatable`), esto
// valida contra el permiso de EDICIÓN (`updatable` = forms.update presente) y compara contra UN único
// registro existente. Reusa la MISMA aritmética de diff (computeDiff) y el MISMO contexto de RBAC
// (reviewContextFromCatalog), sin duplicar lógica ni parseo del catálogo.

import { computeDiff, type FieldDiff, type ReviewContext } from "./detected-actions";

/** Entrada de la comparación: el registro existente + los valores nuevos propuestos por el agente. */
export interface RecordUpdateInput {
  target_resource: string;
  /** Id del registro existente a actualizar. */
  resource_id: string;
  /** Estado actual del registro (lo lee el agente vía clinical.get_*); es el "antes" del diff. */
  current_values: Record<string, unknown>;
  /** Valores nuevos propuestos por campo (el diff filtra los que no cambian). */
  proposed_values: Record<string, unknown>;
  label?: string;
  source_fragment?: string;
}

export type RecordUpdateDisposition = "update" | "blocked";

/** Especificación de UI de la comparación (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface RecordUpdateSpec {
  kind: "record_update";
  title?: string;
  target_resource: string;
  resource_id: string;
  label: string;
  disposition: RecordUpdateDisposition;
  /** Motivo cuando queda bloqueada (recurso desconocido / sin permiso de edición); si no, null. */
  reason: string | null;
  /** Valores propuestos efectivos SÓLO de campos del esquema de edición (los ajenos caen en dropped). */
  values: Record<string, unknown>;
  /** Campos propuestos que NO existen en el esquema de edición: se descartan (no se inventan). */
  dropped_fields: string[];
  /** Diferencia campo-a-campo contra el estado actual (qué cambiaría si se aprueba). */
  diff: FieldDiff[];
  /** Estado actual del registro (para mostrar el "antes" completo). */
  current_values: Record<string, unknown>;
  source_fragment?: string;
  confirm_label: string;
  confirm_prompt: string;
}

export type RecordUpdateResult = { ok: true; spec: RecordUpdateSpec } | { ok: false; error: string };

export interface RecordUpdateOptions {
  title?: string;
  confirm_label?: string;
  confirm_prompt?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Construye la comparación antes/después a partir del registro actual + los valores propuestos.
 * READ-ONLY: valida el recurso contra el catálogo + permiso de EDICIÓN (desconocido o sin permiso =
 * `blocked` con motivo, NO se descarta en silencio), descarta los campos fuera del esquema de edición
 * (no se inventan) y calcula el diff contra el estado actual (nunca toca lo no propuesto). No persiste:
 * la escritura real ocurre vía la tool de actualización del recurso, con aprobación P1.
 */
export function buildRecordUpdate(
  input: RecordUpdateInput,
  ctx: ReviewContext,
  options: RecordUpdateOptions = {},
): RecordUpdateResult {
  if (!isObject(input)) {
    return { ok: false, error: "La actualización debe ser un objeto." };
  }
  if (typeof input.target_resource !== "string" || !input.target_resource) {
    return { ok: false, error: "Se requiere 'target_resource'." };
  }
  if (typeof input.resource_id !== "string" || !input.resource_id) {
    return { ok: false, error: "Se requiere 'resource_id' del registro a actualizar." };
  }
  if (!isObject(input.proposed_values) || Object.keys(input.proposed_values).length === 0) {
    return { ok: false, error: "Se requiere 'proposed_values' con al menos un campo." };
  }

  const resource = input.target_resource;
  const current = isObject(input.current_values) ? input.current_values : {};
  const updatable = ctx.updatable ?? new Set<string>();

  // 1) Validación contra el catálogo + RBAC de EDICIÓN (misma señal que el gating, pero forms.update).
  let blockedReason: string | null = null;
  if (ctx.knownResources.size > 0 && !ctx.knownResources.has(resource)) {
    blockedReason = `Recurso desconocido: '${resource}'.`;
  } else if (!updatable.has(resource)) {
    blockedReason = `El médico no tiene permiso para editar '${resource}'.`;
  }

  // 2) Valores efectivos, descartando los campos ajenos al esquema de edición (no se inventan).
  const allowed = ctx.updateSchemaFields?.get(resource);
  const values: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(input.proposed_values)) {
    if (allowed && !allowed.has(field)) {
      dropped.push(field);
    } else {
      values[field] = value;
    }
  }

  // 3) Diff campo-a-campo contra el estado actual (sólo si no está bloqueada; nunca toca lo no propuesto).
  const diff = blockedReason ? [] : computeDiff(values, current);

  const spec: RecordUpdateSpec = {
    kind: "record_update",
    target_resource: resource,
    resource_id: input.resource_id,
    label: input.label ?? `Actualizar ${resource}`,
    disposition: blockedReason ? "blocked" : "update",
    reason: blockedReason,
    values,
    dropped_fields: dropped,
    diff,
    current_values: current,
    confirm_label: options.confirm_label ?? "Aplicar cambios",
    confirm_prompt: options.confirm_prompt ?? "Actualización revisada:",
  };
  if (options.title) spec.title = options.title;
  if (input.source_fragment) spec.source_fragment = input.source_fragment;
  return { ok: true, spec };
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Mensaje de seguimiento al confirmar la comparación: NO escribe nada; describe los cambios revisados y
 * pide al agente APLICAR la actualización al registro con la tool de edición del recurso (pasa por la
 * aprobación P1). Si está bloqueada, lo dice y no pide ninguna escritura.
 */
export function buildRecordUpdateSubmission(spec: RecordUpdateSpec): string {
  if (spec.disposition === "blocked") {
    return `No se puede actualizar ${spec.target_resource} (${spec.resource_id}): ${spec.reason ?? "no disponible"}.`;
  }
  const lines: string[] = [spec.confirm_prompt];
  if (spec.diff.length === 0) {
    lines.push("No hay cambios respecto al registro actual; nada que aplicar.");
    return lines.join("\n");
  }
  lines.push(`Registro: ${spec.target_resource} (${spec.resource_id}).`);
  for (const d of spec.diff) {
    lines.push(
      d.change === "added"
        ? `- ${d.field}: (vacío) → ${formatValue(d.after)}`
        : `- ${d.field}: ${formatValue(d.before)} → ${formatValue(d.after)}`,
    );
  }
  if (spec.dropped_fields.length > 0) {
    lines.push(`Campos ignorados (fuera del esquema de edición): ${spec.dropped_fields.join(", ")}.`);
  }
  lines.push(
    `Aplica estos cambios al registro ${spec.resource_id} con la herramienta de actualización de ` +
      `${spec.target_resource}; el guardado requiere mi aprobación (P1). No cambies ningún otro campo.`,
  );
  return lines.join("\n");
}
