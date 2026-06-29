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
}

export interface FormSpec {
  kind: "form";
  title?: string;
  description?: string;
  fields: FormFieldSpec[];
  submit_label: string;
  submit_prompt: string;
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
  | { type: "tool"; tool: string; args?: Record<string, unknown> };

export interface ButtonSpec {
  label: string;
  action: ButtonAction;
}

export interface ButtonsSpec {
  kind: "buttons";
  title?: string;
  buttons: ButtonSpec[];
}

// La spec de UI DINÁMICA en lista blanca (MP-CTRL-0117) y el panel de CIERRE post-transcripción
// (MP-CTRL-0120) se integran a la unión: se validan en su propio módulo y se pintan dentro de
// `GeneratedUi`, sin un renderizador paralelo.
import type { DynamicFormSpec } from "./dynamic-form";
import type { DetectedActionsSpec } from "./detected-actions";

export type UiSpec = FormSpec | ChartSpec | ButtonsSpec | DynamicFormSpec | DetectedActionsSpec;

export type ParseResult<T> = { ok: true; spec: T } | { ok: false; error: string };

export function isUiSpec(value: unknown): value is UiSpec {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "form" ||
    kind === "chart" ||
    kind === "buttons" ||
    kind === "dynamic_form" ||
    kind === "detected_actions"
  );
}

const MAX_FIELDS = 30;
const MAX_DATA_POINTS = 60;
const MAX_BUTTONS = 12;
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
  const argsText = action.args ? ` con argumentos ${JSON.stringify(action.args)}` : "";
  return `Usa la herramienta ${action.tool}${argsText}.`;
}
