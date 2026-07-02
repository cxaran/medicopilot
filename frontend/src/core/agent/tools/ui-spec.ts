// Generación de UI declarativa (B9, Parte B). El modelo emite una ESPECIFICACION JSON
// que el panel mapea a componentes React seguros (primitivos R2). NUNCA se inyecta HTML/
// JS crudo del modelo: solo specs validadas y normalizadas aquí.

export type FormFieldType = "text" | "number" | "textarea" | "select";

export interface FormFieldSpec {
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  /** Valor inicial (prellenado) del campo, p. ej. al crear con datos ya proporcionados. */
  value?: string;
}

export interface FormSpec {
  kind: "form";
  title?: string;
  description?: string;
  fields: FormFieldSpec[];
  submit_label: string;
  submit_prompt: string;
}

/**
 * Formulario de un RECURSO del contrato (Camino A) montado en el chat. A diferencia de `FormSpec`
 * (formulario ad-hoc que el modelo describe campo a campo), aquí el agente sólo nombra el recurso y
 * el modo; el FORMULARIO lo deriva el frontend del contrato `/resources` (campos, validaciones,
 * allowlist) y, en particular, las RELACIONES (FK como patient_id/doctor_id) se renderizan como
 * BUSCADORES por nombre — el médico nunca teclea UUIDs. Al guardar escribe directo por la API del
 * recurso (RBAC server-side) y devuelve una nota de contexto al hilo; no obliga al modelo a invocar
 * la tool de escritura. `values` PRELLENA con datos ya dados; `resource_id` es obligatorio en update.
 */
export interface ResourceFormSpec {
  kind: "resource_form";
  resource: string;
  mode: "create" | "update";
  title?: string;
  /** Requerido en modo "update": id del registro a editar (resuelve detalle + URL de mutación). */
  resource_id?: string;
  /** Prellenado: pares campo→valor con los datos ya proporcionados (p. ej. el nombre). */
  values?: Record<string, string>;
}

export interface ChartDatum {
  label: string;
  value: number;
}

export interface ChartSpec {
  kind: "chart";
  chart_type: "bar";
  title?: string;
  data: ChartDatum[];
}

export type ButtonAction =
  | { type: "message"; prompt: string }
  | { type: "tool"; tool: string; args?: Record<string, unknown> }
  // Enlace de CONTACTO externo (p. ej. abrir WhatsApp con un texto). No muta el sistema; al hacer
  // clic abre la URL en otra pestaña. La URL se valida con `isSafeButtonUrl` (lista blanca estricta).
  | { type: "link"; url: string };

/**
 * ¿La URL de un botón de enlace es segura para abrirse desde la UI generada por el modelo? Lista
 * blanca ESTRICTA de canales de contacto: WhatsApp (wa.me / api.whatsapp.com), teléfono, correo y
 * SMS. Se rechaza todo lo demás (http inseguro, dominios arbitrarios, javascript:/data:) para no
 * abrir vías de phishing/exfiltración desde la salida del modelo.
 */
export function isSafeButtonUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme === "tel:" || scheme === "mailto:" || scheme === "sms:") {
    return true;
  }
  if (scheme === "https:") {
    const host = parsed.hostname.toLowerCase();
    return host === "wa.me" || host === "api.whatsapp.com";
  }
  return false;
}

// Clasificación de gobierno de un botón (MP-CTRL-0130). La resolución la calcula button-actions.ts
// (catálogo + RBAC); parseButtonsSpec sólo valida la ESTRUCTURA y NO la fija (queda undefined hasta
// que el seam la resuelve). "read_only" = no puede mutar (mensaje o tool de lectura); "actionable" =
// dispara una tool de escritura resuelta que pasa por la aprobación P1; "blocked" = no se permite.
export type ButtonGovernance = "read_only" | "actionable" | "blocked";

export interface ButtonSpec {
  label: string;
  action: ButtonAction;
  /** Clasificación de gobierno (la fija el seam button-actions; ausente = sin resolver aún). */
  governance?: ButtonGovernance;
  /** Motivo cuando el botón queda bloqueado (tool desconocida / sin permiso); si no, ausente. */
  reason?: string;
  /** Argumentos propuestos descartados por estar fuera del esquema de la tool (no se inventan). */
  dropped_args?: string[];
}

export interface ButtonsSpec {
  kind: "buttons";
  title?: string;
  buttons: ButtonSpec[];
}

/**
 * RESPUESTAS SUGERIDAS (quick replies): el agente propone las posibles SIGUIENTES respuestas del
 * médico como chips bajo su mensaje. Al hacer clic, el texto elegido se envía AUTOMÁTICAMENTE como
 * mensaje del médico (un turno normal) y los chips se contraen (interfaz de un solo uso; además
 * caducan al enviar cualquier otro mensaje). Sólo texto plano: nunca ejecutan tools ni escriben.
 */
export interface SuggestedRepliesSpec {
  kind: "suggested_replies";
  title?: string;
  replies: string[];
}

// La spec de UI DINÁMICA en lista blanca (MP-CTRL-0117), el panel de CIERRE post-transcripción
// (MP-CTRL-0120), el PLAN DE TAREAS revisable (MP-CTRL-0129) y la CHECKLIST DE CIERRE (MP-CTRL-0131)
// se integran a la unión: se validan en su propio módulo y se pintan dentro de `GeneratedUi`, sin un
// renderizador paralelo.
import type { DynamicFormSpec } from "./dynamic-form";
import type { DetectedActionsSpec } from "./detected-actions";
import type { TaskPlanSpec } from "./task-plan";
import type { CloseChecklistSpec } from "./close-checklist";
import type { TemplatePromotionSpec } from "./template-promotion";
import type { RecordUpdateSpec } from "./record-update";
import type { OpenRecordSpec } from "./open-record";
import type { WizardSpec } from "./wizard";

export type UiSpec =
  | FormSpec
  | ResourceFormSpec
  | ChartSpec
  | ButtonsSpec
  | SuggestedRepliesSpec
  | DynamicFormSpec
  | DetectedActionsSpec
  | TaskPlanSpec
  | CloseChecklistSpec
  | TemplatePromotionSpec
  | RecordUpdateSpec
  | OpenRecordSpec
  | WizardSpec;

export type ParseResult<T> = { ok: true; spec: T } | { ok: false; error: string };

export function isUiSpec(value: unknown): value is UiSpec {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "form" ||
    kind === "resource_form" ||
    kind === "chart" ||
    kind === "buttons" ||
    kind === "suggested_replies" ||
    kind === "dynamic_form" ||
    kind === "detected_actions" ||
    kind === "task_plan" ||
    kind === "close_checklist" ||
    kind === "template_promotion_proposal" ||
    kind === "record_update" ||
    kind === "open_record" ||
    kind === "wizard"
  );
}

const MAX_FIELDS = 30;
const MAX_DATA_POINTS = 60;
const MAX_BUTTONS = 12;
const MAX_REPLIES = 6;
const MAX_REPLY_LENGTH = 140;
const ALLOWED_FIELD_TYPES: FormFieldType[] = ["text", "number", "textarea", "select"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseFormSpec(input: unknown): ParseResult<FormSpec> {
  if (!isObject(input)) {
    return { ok: false, error: "La especificación del formulario debe ser un objeto." };
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    return { ok: false, error: "El formulario debe declarar al menos un campo en 'fields'." };
  }
  if (input.fields.length > MAX_FIELDS) {
    return { ok: false, error: `Demasiados campos (máximo ${MAX_FIELDS}).` };
  }

  const fields: FormFieldSpec[] = [];
  for (const raw of input.fields) {
    if (!isObject(raw)) {
      return { ok: false, error: "Cada campo debe ser un objeto." };
    }
    const name = asString(raw.name);
    const label = asString(raw.label) ?? name;
    const type = (asString(raw.type) ?? "text") as FormFieldType;
    if (!name) {
      return { ok: false, error: "Cada campo requiere 'name'." };
    }
    if (!ALLOWED_FIELD_TYPES.includes(type)) {
      return { ok: false, error: `Tipo de campo no permitido: ${type}.` };
    }
    const field: FormFieldSpec = { name, label: label ?? name, type };
    const placeholder = asString(raw.placeholder);
    if (placeholder) field.placeholder = placeholder;
    if (raw.required === true) field.required = true;
    // Valor inicial (prellenado): permite renderizar el formulario ya con los datos que el médico
    // proporcionó (p. ej. el nombre al crear un paciente), en vez de pedirlos por texto.
    const value = asString(raw.value);
    if (value !== undefined) field.value = value;
    if (type === "select") {
      if (!Array.isArray(raw.options) || raw.options.length === 0) {
        return { ok: false, error: `El campo select '${name}' requiere 'options'.` };
      }
      const options: { label: string; value: string }[] = [];
      for (const opt of raw.options) {
        if (!isObject(opt)) {
          return { ok: false, error: `Opciones inválidas en '${name}'.` };
        }
        const value = asString(opt.value);
        if (value === undefined) {
          return { ok: false, error: `Cada opción de '${name}' requiere 'value'.` };
        }
        options.push({ value, label: asString(opt.label) ?? value });
      }
      field.options = options;
    }
    fields.push(field);
  }

  return {
    ok: true,
    spec: {
      kind: "form",
      ...(asString(input.title) ? { title: asString(input.title) } : {}),
      ...(asString(input.description) ? { description: asString(input.description) } : {}),
      fields,
      submit_label: asString(input.submit_label) ?? "Enviar",
      submit_prompt: asString(input.submit_prompt) ?? asString(input.title) ?? "Formulario enviado",
    },
  };
}

export function parseResourceFormSpec(input: unknown): ParseResult<ResourceFormSpec> {
  if (!isObject(input)) {
    return { ok: false, error: "La especificación del formulario de recurso debe ser un objeto." };
  }
  const resource = asString(input.resource);
  if (!resource) {
    return { ok: false, error: "Se requiere 'resource' (nombre del recurso del contrato)." };
  }
  const mode = asString(input.mode) ?? "create";
  if (mode !== "create" && mode !== "update") {
    return { ok: false, error: "El 'mode' debe ser 'create' o 'update'." };
  }
  const resourceId = asString(input.resource_id);
  if (mode === "update" && !resourceId) {
    return { ok: false, error: "El modo 'update' requiere 'resource_id'." };
  }
  // Prellenado: sólo valores escalares (string/number/boolean) → string. Se descarta lo demás (no se
  // inventan estructuras); los campos fuera del esquema los filtra después el formulario del contrato.
  const values: Record<string, string> = {};
  if (isObject(input.values)) {
    for (const [key, raw] of Object.entries(input.values)) {
      if (typeof raw === "string") {
        values[key] = raw;
      } else if (typeof raw === "number" || typeof raw === "boolean") {
        values[key] = String(raw);
      }
    }
  }

  const spec: ResourceFormSpec = { kind: "resource_form", resource, mode };
  const title = asString(input.title);
  if (title) spec.title = title;
  if (resourceId) spec.resource_id = resourceId;
  if (Object.keys(values).length > 0) spec.values = values;
  return { ok: true, spec };
}

export function parseChartSpec(input: unknown): ParseResult<ChartSpec> {
  if (!isObject(input)) {
    return { ok: false, error: "La especificación del gráfico debe ser un objeto." };
  }
  const chartType = asString(input.chart_type) ?? "bar";
  if (chartType !== "bar") {
    return { ok: false, error: "Solo se soporta chart_type 'bar'." };
  }
  if (!Array.isArray(input.data) || input.data.length === 0) {
    return { ok: false, error: "El gráfico requiere 'data' con al menos un punto." };
  }
  if (input.data.length > MAX_DATA_POINTS) {
    return { ok: false, error: `Demasiados puntos (máximo ${MAX_DATA_POINTS}).` };
  }

  const data: ChartDatum[] = [];
  for (const raw of input.data) {
    if (!isObject(raw)) {
      return { ok: false, error: "Cada punto del gráfico debe ser un objeto." };
    }
    const label = asString(raw.label);
    const value = raw.value;
    if (label === undefined) {
      return { ok: false, error: "Cada punto requiere 'label'." };
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { ok: false, error: `El punto '${label}' requiere un 'value' numérico.` };
    }
    data.push({ label, value });
  }

  return {
    ok: true,
    spec: { kind: "chart", chart_type: "bar", ...(asString(input.title) ? { title: asString(input.title) } : {}), data },
  };
}

function parseButtonAction(raw: unknown): ButtonAction | null {
  if (!isObject(raw)) {
    return null;
  }
  const type = asString(raw.type);
  if (type === "message") {
    const prompt = asString(raw.prompt);
    return prompt ? { type: "message", prompt } : null;
  }
  if (type === "tool") {
    const tool = asString(raw.tool);
    if (!tool) {
      return null;
    }
    return isObject(raw.args) ? { type: "tool", tool, args: raw.args } : { type: "tool", tool };
  }
  if (type === "link") {
    const url = asString(raw.url);
    return url && isSafeButtonUrl(url) ? { type: "link", url } : null;
  }
  return null;
}

export function parseButtonsSpec(input: unknown): ParseResult<ButtonsSpec> {
  if (!isObject(input)) {
    return { ok: false, error: "La especificación de botones debe ser un objeto." };
  }
  if (!Array.isArray(input.buttons) || input.buttons.length === 0) {
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
    const action = parseButtonAction(raw.action);
    if (!action) {
      return { ok: false, error: `Acción inválida en el botón '${label}'.` };
    }
    buttons.push({ label, action });
  }

  return {
    ok: true,
    spec: { kind: "buttons", ...(asString(input.title) ? { title: asString(input.title) } : {}), buttons },
  };
}

/**
 * Valida la spec de RESPUESTAS SUGERIDAS. Sólo texto plano corto (los chips se envían como mensaje
 * del médico al hacer clic); se descartan entradas vacías/duplicadas y se acota cantidad y largo
 * para que la interfaz no degenere en un menú interminable.
 */
export function parseSuggestedRepliesSpec(input: unknown): ParseResult<SuggestedRepliesSpec> {
  if (!isObject(input)) {
    return { ok: false, error: "La especificación de respuestas sugeridas debe ser un objeto." };
  }
  if (!Array.isArray(input.replies) || input.replies.length === 0) {
    return { ok: false, error: "Se requiere al menos una respuesta en 'replies'." };
  }
  if (input.replies.length > MAX_REPLIES) {
    return { ok: false, error: `Demasiadas respuestas sugeridas (máximo ${MAX_REPLIES}).` };
  }
  const replies: string[] = [];
  for (const raw of input.replies) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Cada respuesta sugerida debe ser texto." };
    }
    const reply = raw.trim();
    if (!reply) {
      return { ok: false, error: "Las respuestas sugeridas no pueden estar vacías." };
    }
    if (reply.length > MAX_REPLY_LENGTH) {
      return {
        ok: false,
        error: `Cada respuesta sugerida debe tener como máximo ${MAX_REPLY_LENGTH} caracteres.`,
      };
    }
    if (!replies.includes(reply)) {
      replies.push(reply);
    }
  }
  return {
    ok: true,
    spec: {
      kind: "suggested_replies",
      ...(asString(input.title) ? { title: asString(input.title) } : {}),
      replies,
    },
  };
}

/**
 * Mensaje de seguimiento al enviar un formulario generado: el envío continúa la
 * conversación con el modelo (no escribe nada por sí mismo; si el modelo decide una
 * acción clínica de escritura, pasa por la aprobación de B8).
 */
export function buildFormSubmissionMessage(spec: FormSpec, values: Record<string, string>): string {
  const lines = spec.fields.map((field) => `- ${field.label}: ${values[field.name] ?? ""}`);
  return `${spec.submit_prompt}\n${lines.join("\n")}`;
}

/** Traduce la acción de un botón generado a un mensaje de seguimiento para el modelo. */
export function buttonActionToMessage(action: ButtonAction): string {
  if (action.type === "message") {
    return action.prompt;
  }
  // Los enlaces se abren directamente en el render (no continúan la conversación); este texto es un
  // respaldo defensivo y no debería usarse en el flujo normal.
  if (action.type === "link") {
    return action.url;
  }
  const argsText = action.args ? ` con argumentos ${JSON.stringify(action.args)}` : "";
  return `Usa la herramienta ${action.tool}${argsText}.`;
}
