// GOBIERNO DE BOTONES ACCIONABLES DE LA UI GENERATIVA (MP-CTRL-0130, épica conversación→expediente /
// generative-UI). La UI de LECTURA del copiloto (gráficas/tablas/info) ya es segura; el punto
// permisivo eran los BOTONES accionables: hoy ``ui.render_buttons`` podía declarar
// ``{type:'tool', tool:<cualquiera>, args:<arbitrarios>}`` SIN validar la tool ni los argumentos.
// Este seam endurece eso espejando cómo 0117 gobernó la UI dinámica y 0120/0129 gobernaron las
// acciones detectadas / el plan de tareas: cada botón se RESUELVE contra el catálogo de tools +
// RBAC y se clasifica de forma DETERMINISTA, sin un renderizador paralelo ni un camino nuevo.
//
// Reglas (mismas que los otros seams): los argumentos fuera del esquema de la tool se DESCARTAN
// (nunca se inventan; ausencia ≠ valor negativo); una tool desconocida o una escritura sin permiso
// quedan BLOQUEADAS con motivo (no se descartan en silencio). Un botón accionable NUNCA produce una
// llamada arbitraria: dispara una tool de ESCRITURA resuelta que sigue pasando por la aprobación P1
// (el clic continúa la conversación; el modelo ejecuta la tool y el médico aprueba). Los botones de
// sólo lectura (mensaje, re-consulta, navegación, tool de lectura) NO pueden mutar y se conservan.

import { isSafeButtonUrl, type ButtonAction, type ButtonGovernance, type ButtonSpec, type ButtonsSpec } from "./ui-spec";

const MAX_BUTTONS = 12;

/** Metadata mínima de una tool del catálogo que el seam necesita para resolver un botón. */
export interface ButtonToolEntry {
  name: string;
  kind: "read" | "write";
  /** Tools de escritura: recurso destino gateado por RBAC (de approval.targetResource). */
  targetResource?: string;
  /** Escritura OWNER-SCOPED (p. ej. memorias): no se gatea por catálogo, pero SÍ pasa por P1. */
  ownerScoped?: boolean;
  /** Nombres de argumentos permitidos (propiedades del inputSchema). undefined = esquema permisivo. */
  schemaProps?: ReadonlySet<string>;
}

/** Contexto de validación: catálogo de tools (estático) + recursos creables del actor (RBAC). */
export interface ButtonReviewContext {
  tools: ReadonlyMap<string, ButtonToolEntry>;
  /** Recursos en los que el rol PUEDE crear (forms.create presente en /api/v1/resources). */
  creatable: ReadonlySet<string>;
}

export interface ButtonsInput {
  title?: string;
  buttons: Array<{ label?: unknown; action?: unknown }>;
}

export type ButtonsModelResult = { ok: true; spec: ButtonsSpec } | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Sanea los argumentos de una acción de tool contra el esquema de la tool: conserva sólo las claves
 * declaradas (las demás caen en ``dropped``); si la tool no declara propiedades (esquema permisivo),
 * no se puede validar campo a campo y se conservan tal cual. No inventa ni coacciona valores.
 */
function sanitizeArgs(
  args: Record<string, unknown> | undefined,
  allowed: ReadonlySet<string> | undefined,
): { args?: Record<string, unknown>; dropped: string[] } {
  if (!isObject(args)) return { dropped: [] };
  if (!allowed) return { args, dropped: [] };
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (allowed.has(key)) kept[key] = value;
    else dropped.push(key);
  }
  return { args: kept, dropped };
}

/** Resuelve UN botón ya estructuralmente válido a su clasificación de gobierno (determinista). */
function resolveButton(
  label: string,
  action: ButtonAction,
  ctx: ButtonReviewContext,
): ButtonSpec {
  // Acción de MENSAJE: continúa la conversación; no puede mutar por sí misma (las escrituras del
  // modelo siguen gateadas por P1). Es de sólo lectura.
  if (action.type === "message") {
    return { label, action, governance: "read_only" };
  }

  // Acción de ENLACE de contacto (WhatsApp/tel/correo): abre una URL externa; no muta el sistema.
  // La URL ya se validó en parseAction (lista blanca); es de sólo lectura.
  if (action.type === "link") {
    return { label, action, governance: "read_only" };
  }

  // Acción de TOOL: debe RESOLVERSE contra el catálogo. Una tool desconocida se bloquea (nunca se
  // emite una llamada arbitraria).
  const entry = ctx.tools.get(action.tool);
  if (!entry) {
    return {
      label,
      action,
      governance: "blocked",
      reason: `Herramienta desconocida: '${action.tool}'.`,
    };
  }

  // Saneo de argumentos contra el esquema de la tool (fuera de esquema → descartado, no se inventa).
  const { args: sanitized, dropped } = sanitizeArgs(action.args, entry.schemaProps);
  const safeAction: ButtonAction = sanitized
    ? { type: "tool", tool: entry.name, args: sanitized }
    : { type: "tool", tool: entry.name };

  // Tool de LECTURA: no muta; es de sólo lectura aunque dispare una tool.
  if (entry.kind === "read") {
    return withDropped({ label, action: safeAction, governance: "read_only" }, dropped);
  }

  // Tool de ESCRITURA: requiere permiso. Las owner-scoped (memorias propias) se permiten (igual
  // pasan por P1); el resto exige poder crear en el recurso destino (misma señal RBAC que 0120/0129).
  const allowed = entry.ownerScoped || (entry.targetResource ? ctx.creatable.has(entry.targetResource) : false);
  if (!allowed) {
    return {
      label,
      action: safeAction,
      governance: "blocked",
      reason: entry.targetResource
        ? `El médico no tiene permiso para crear en '${entry.targetResource}'.`
        : `Acción de escritura no permitida: '${entry.name}'.`,
    };
  }

  // Escritura permitida: ACCIONABLE. Al hacer clic, el modelo ejecuta la tool y la escritura pasa
  // por la aprobación P1 (no es un despacho directo ni una llamada arbitraria).
  return withDropped({ label, action: safeAction, governance: "actionable" }, dropped);
}

function withDropped(spec: ButtonSpec, dropped: string[]): ButtonSpec {
  return dropped.length > 0 ? { ...spec, dropped_args: dropped } : spec;
}

function parseAction(raw: unknown): ButtonAction | null {
  if (!isObject(raw)) return null;
  const type = asString(raw.type);
  if (type === "message") {
    const prompt = asString(raw.prompt);
    return prompt ? { type: "message", prompt } : null;
  }
  if (type === "tool") {
    const tool = asString(raw.tool);
    if (!tool) return null;
    return isObject(raw.args) ? { type: "tool", tool, args: raw.args } : { type: "tool", tool };
  }
  if (type === "link") {
    const url = asString(raw.url);
    return url && isSafeButtonUrl(url) ? { type: "link", url } : null;
  }
  return null;
}

/**
 * Construye el MODELO DE BOTONES GOBERNADO a partir de los botones propuestos: valida la estructura,
 * resuelve cada botón contra el catálogo de tools + RBAC y lo clasifica (read_only / actionable /
 * blocked). READ-ONLY: no ejecuta ni guarda nada; sólo produce la spec que pinta GeneratedUi.
 */
export function buildButtonsModel(input: ButtonsInput, ctx: ButtonReviewContext): ButtonsModelResult {
  if (!isObject(input) || !Array.isArray(input.buttons)) {
    return { ok: false, error: "Se requiere una lista de botones en 'buttons'." };
  }
  if (input.buttons.length === 0) {
    return { ok: false, error: "Se requiere al menos un botón en 'buttons'." };
  }
  if (input.buttons.length > MAX_BUTTONS) {
    return { ok: false, error: `Demasiados botones (máximo ${MAX_BUTTONS}).` };
  }

  const buttons: ButtonSpec[] = [];
  for (const raw of input.buttons) {
    if (!isObject(raw)) {
      return { ok: false, error: "Cada botón debe ser un objeto." };
    }
    const label = asString(raw.label);
    if (!label) {
      return { ok: false, error: "Cada botón requiere 'label'." };
    }
    const action = parseAction(raw.action);
    if (!action) {
      return { ok: false, error: `Acción inválida en el botón '${label}'.` };
    }
    buttons.push(resolveButton(label, action, ctx));
  }

  const spec: ButtonsSpec = { kind: "buttons", buttons };
  const title = asString(input.title);
  if (title) spec.title = title;
  return { ok: true, spec };
}

/** ¿El botón está bloqueado? Ayuda al renderizador a deshabilitarlo (defensa en el render). */
export function isButtonBlocked(button: Pick<ButtonSpec, "governance">): boolean {
  return button.governance === "blocked";
}

/** Etiquetas legibles de la clasificación (para el panel/tooltips). */
export const GOVERNANCE_LABEL: Record<ButtonGovernance, string> = {
  read_only: "Sólo lectura",
  actionable: "Acción (requiere tu aprobación)",
  blocked: "Bloqueada",
};
