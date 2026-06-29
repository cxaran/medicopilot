// UI DINÁMICA EN LISTA BLANCA (MP-CTRL-0117), paso 3 de la arquitectura de UI híbrida.
//
// Para los casos ESPECIALES que ninguna plantilla registrada cubre, el agente puede componer
// una UI declarativa, pero SOLO con un conjunto cerrado de widgets aprobados. Este módulo es la
// FRONTERA DE SEGURIDAD: valida la spec que propone el modelo contra una lista blanca estricta
// de tipos de widget y de props permitidas, rechaza cualquier contenido ejecutable (HTML, script,
// URL, iframe, manejadores de eventos) y aplica límites de complejidad. El renderizador solo pinta
// tipos de la lista blanca; nada se ejecuta ni se persiste por sí mismo: los valores recolectados
// continúan la conversación y cualquier acción clínica real sigue pasando por la aprobación (P1).
//
// NO es un renderizador paralelo: la spec se integra al tipo `UiSpec` y se pinta dentro de
// `GeneratedUi`, junto a form/chart/buttons. La validación de args de la tool reutiliza el
// validador acotado (PASSTHROUGH + parseo aquí), igual que `ui.render_form`.

export type DynamicWidgetType =
  | "heading"
  | "info_card"
  | "section"
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "multiselect"
  | "radio"
  | "decision_list";

export interface DfOption {
  value: string;
  label: string;
}

/** Widget de solo presentación: título/encabezado. */
export interface DfHeading {
  type: "heading";
  text: string;
}

/** Tarjeta informativa de solo lectura. `text` es texto plano (NUNCA HTML crudo). */
export interface DfInfoCard {
  type: "info_card";
  text: string;
  tone?: "info" | "warn" | "muted";
}

/** Contenedor de maquetación. Aporta un nivel de anidación (limitado). */
export interface DfSection {
  type: "section";
  title?: string;
  children: DynamicWidget[];
}

/** Campo de texto (una línea) o área (multilínea). */
export interface DfText {
  type: "text" | "textarea";
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  max?: number;
}

export interface DfNumber {
  type: "number";
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
}

export interface DfDate {
  type: "date";
  name: string;
  label: string;
  required?: boolean;
  help?: string;
}

/** Casilla única (sí/no). */
export interface DfCheckbox {
  type: "checkbox";
  name: string;
  label: string;
  required?: boolean;
  help?: string;
}

/** Selección a partir de opciones cerradas. */
export interface DfChoice {
  type: "select" | "multiselect" | "radio";
  name: string;
  label: string;
  required?: boolean;
  help?: string;
  options: DfOption[];
}

export interface DfDecisionItem {
  value: string;
  text: string;
}

/** Lista de propuestas; el médico acepta/edita/rechaza cada ítem. */
export interface DfDecisionList {
  type: "decision_list";
  name: string;
  label?: string;
  items: DfDecisionItem[];
}

export type DynamicWidget =
  | DfHeading
  | DfInfoCard
  | DfSection
  | DfText
  | DfNumber
  | DfDate
  | DfCheckbox
  | DfChoice
  | DfDecisionList;

export interface DynamicFormSpec {
  kind: "dynamic_form";
  title?: string;
  description?: string;
  widgets: DynamicWidget[];
  submit_label: string;
  submit_prompt: string;
}

export type DfParseResult =
  | { ok: true; spec: DynamicFormSpec }
  | { ok: false; error: string };

// Límites de complejidad: cota dura a lo que el modelo puede componer. Rechazar por encima del
// límite NOMBRA la causa, para que el agente reduzca la spec en vez de inundar la UI.
export const DF_LIMITS = {
  maxWidgets: 40, // total de nodos, incluidos los anidados
  maxDepth: 3, // profundidad máxima de anidación de `section`
  maxOptions: 20, // opciones por select/multiselect/radio
  maxItems: 30, // ítems por decision_list
  maxStringLen: 2000, // longitud máxima de cualquier cadena
} as const;

// Lista blanca de props por tipo de widget. Cualquier clave fuera de este conjunto (p. ej.
// `onclick`, `src`, `url`, `href`, `style`, `html`) se RECHAZA: el modelo no puede inyectar
// props arbitrarias ni manejadores de eventos.
const ALLOWED_PROPS: Record<DynamicWidgetType, readonly string[]> = {
  heading: ["text"],
  info_card: ["text", "tone"],
  section: ["title", "children"],
  text: ["name", "label", "required", "placeholder", "help", "max"],
  textarea: ["name", "label", "required", "placeholder", "help", "max"],
  number: ["name", "label", "required", "placeholder", "help", "min", "max"],
  date: ["name", "label", "required", "help"],
  checkbox: ["name", "label", "required", "help"],
  select: ["name", "label", "required", "help", "options"],
  multiselect: ["name", "label", "required", "help", "options"],
  radio: ["name", "label", "required", "help", "options"],
  decision_list: ["name", "label", "items"],
};

const WIDGET_TYPES = new Set<string>(Object.keys(ALLOWED_PROPS));
const CHOICE_TYPES = new Set<string>(["select", "multiselect", "radio"]);
const INPUT_TYPES = new Set<string>([
  "text",
  "textarea",
  "number",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "radio",
]);

// Patrones de contenido EJECUTABLE/no permitido en cualquier cadena (label, text, placeholder,
// help, value...). Una cadena que case con alguno se rechaza: así no se puede contrabandear
// HTML, script, URLs ni manejadores de eventos a través de un campo de texto.
const UNSAFE_CONTENT: readonly { re: RegExp; why: string }[] = [
  { re: /[<>]/, why: "no puede contener marcado HTML (caracteres < o >)" },
  { re: /javascript:/i, why: "no puede contener 'javascript:'" },
  { re: /https?:\/\//i, why: "no puede contener URLs" },
  { re: /\bon[a-z]+\s*=/i, why: "no puede contener manejadores de eventos" },
];

class DfFail extends Error {}

function fail(message: string): never {
  throw new DfFail(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Devuelve una cadena no vacía, validada contra contenido ejecutable y longitud. */
function safeString(value: unknown, where: string): string {
  if (typeof value !== "string") {
    fail(`${where} debe ser texto.`);
  }
  if (value.length > DF_LIMITS.maxStringLen) {
    fail(`${where} excede la longitud máxima (${DF_LIMITS.maxStringLen}).`);
  }
  for (const { re, why } of UNSAFE_CONTENT) {
    if (re.test(value)) {
      fail(`${where} ${why}.`);
    }
  }
  return value;
}

function optionalSafeString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return safeString(value, where);
}

function safeNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail(`${where} debe ser numérico.`);
  }
  return value;
}

/** Rechaza cualquier prop fuera de la lista blanca del tipo de widget. */
function rejectUnknownProps(raw: Record<string, unknown>, type: DynamicWidgetType): void {
  const allowed = ALLOWED_PROPS[type];
  for (const key of Object.keys(raw)) {
    if (key === "type") continue;
    if (!allowed.includes(key)) {
      fail(`Prop no permitida '${key}' en el widget '${type}'.`);
    }
  }
}

function parseOptions(raw: unknown, type: string, name: string): DfOption[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(`El widget '${type}' '${name}' requiere 'options'.`);
  }
  if (raw.length > DF_LIMITS.maxOptions) {
    fail(`El widget '${name}' excede el máximo de opciones (${DF_LIMITS.maxOptions}).`);
  }
  return raw.map((opt) => {
    if (!isObject(opt)) {
      fail(`Opciones inválidas en '${name}'.`);
    }
    const value = safeString(opt.value, `El 'value' de una opción de '${name}'`);
    const label = optionalSafeString(opt.label, `La etiqueta de una opción de '${name}'`) ?? value;
    return { value, label };
  });
}

function parseDecisionItems(raw: unknown, name: string): DfDecisionItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail(`La lista de decisiones '${name}' requiere 'items'.`);
  }
  if (raw.length > DF_LIMITS.maxItems) {
    fail(`La lista '${name}' excede el máximo de ítems (${DF_LIMITS.maxItems}).`);
  }
  return raw.map((item) => {
    if (!isObject(item)) {
      fail(`Ítems inválidos en '${name}'.`);
    }
    const value = safeString(item.value, `El 'value' de un ítem de '${name}'`);
    const text = safeString(item.text, `El texto de un ítem de '${name}'`);
    return { value, text };
  });
}

interface WalkCtx {
  count: number;
}

function parseWidget(raw: unknown, ctx: WalkCtx, depth: number): DynamicWidget {
  if (!isObject(raw)) {
    fail("Cada widget debe ser un objeto.");
  }
  const type = typeof raw.type === "string" ? raw.type : "";
  if (!WIDGET_TYPES.has(type)) {
    fail(`Tipo de widget no permitido: '${type || "(vacío)"}'.`);
  }
  const widgetType = type as DynamicWidgetType;
  rejectUnknownProps(raw, widgetType);

  ctx.count += 1;
  if (ctx.count > DF_LIMITS.maxWidgets) {
    fail(`Demasiados widgets (máximo ${DF_LIMITS.maxWidgets}).`);
  }

  if (widgetType === "heading") {
    return { type: "heading", text: safeString(raw.text, "El texto del encabezado") };
  }

  if (widgetType === "info_card") {
    const tone = optionalSafeString(raw.tone, "El tono de la tarjeta");
    if (tone !== undefined && !["info", "warn", "muted"].includes(tone)) {
      fail("El tono de la tarjeta debe ser 'info', 'warn' o 'muted'.");
    }
    return {
      type: "info_card",
      text: safeString(raw.text, "El texto de la tarjeta"),
      ...(tone ? { tone: tone as DfInfoCard["tone"] } : {}),
    };
  }

  if (widgetType === "section") {
    if (depth + 1 > DF_LIMITS.maxDepth) {
      fail(`Anidación demasiado profunda (máximo ${DF_LIMITS.maxDepth} niveles).`);
    }
    if (!Array.isArray(raw.children) || raw.children.length === 0) {
      fail("Una sección requiere 'children' con al menos un widget.");
    }
    const children = raw.children.map((child) => parseWidget(child, ctx, depth + 1));
    return {
      type: "section",
      ...(optionalSafeString(raw.title, "El título de la sección")
        ? { title: optionalSafeString(raw.title, "El título de la sección") }
        : {}),
      children,
    };
  }

  // A partir de aquí, widgets de ENTRADA: requieren 'name' y 'label'.
  const name = safeString(raw.name, `El 'name' del widget '${widgetType}'`);
  const labelRequired = widgetType !== "decision_list";
  const label = labelRequired
    ? safeString(raw.label, `La etiqueta del widget '${name}'`)
    : optionalSafeString(raw.label, `La etiqueta del widget '${name}'`);
  const help = optionalSafeString(raw.help, `La ayuda del widget '${name}'`);
  const required = raw.required === true;

  if (CHOICE_TYPES.has(widgetType)) {
    return {
      type: widgetType as DfChoice["type"],
      name,
      label: label ?? name,
      ...(required ? { required } : {}),
      ...(help ? { help } : {}),
      options: parseOptions(raw.options, widgetType, name),
    };
  }

  if (widgetType === "decision_list") {
    return {
      type: "decision_list",
      name,
      ...(label ? { label } : {}),
      items: parseDecisionItems(raw.items, name),
    };
  }

  if (widgetType === "number") {
    const placeholder = optionalSafeString(raw.placeholder, `El placeholder del widget '${name}'`);
    return {
      type: "number",
      name,
      label: label ?? name,
      ...(required ? { required } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(help ? { help } : {}),
      ...(raw.min !== undefined ? { min: safeNumber(raw.min, `El 'min' del widget '${name}'`) } : {}),
      ...(raw.max !== undefined ? { max: safeNumber(raw.max, `El 'max' del widget '${name}'`) } : {}),
    };
  }

  if (widgetType === "date") {
    return {
      type: "date",
      name,
      label: label ?? name,
      ...(required ? { required } : {}),
      ...(help ? { help } : {}),
    };
  }

  if (widgetType === "checkbox") {
    return {
      type: "checkbox",
      name,
      label: label ?? name,
      ...(required ? { required } : {}),
      ...(help ? { help } : {}),
    };
  }

  // text | textarea
  const placeholder = optionalSafeString(raw.placeholder, `El placeholder del widget '${name}'`);
  return {
    type: widgetType as DfText["type"],
    name,
    label: label ?? name,
    ...(required ? { required } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(help ? { help } : {}),
    ...(raw.max !== undefined ? { max: safeNumber(raw.max, `El 'max' del widget '${name}'`) } : {}),
  };
}

/**
 * Valida y normaliza una spec de UI dinámica contra la lista blanca. Devuelve la spec normalizada
 * o un error LEGIBLE (que nombra la causa). No renderiza ni ejecuta nada.
 */
export function validateDynamicForm(input: unknown): DfParseResult {
  try {
    if (!isObject(input)) {
      return { ok: false, error: "La especificación debe ser un objeto." };
    }
    if (!Array.isArray(input.widgets) || input.widgets.length === 0) {
      return { ok: false, error: "Se requiere al menos un widget en 'widgets'." };
    }
    const ctx: WalkCtx = { count: 0 };
    const widgets = input.widgets.map((widget) => parseWidget(widget, ctx, 0));
    return {
      ok: true,
      spec: {
        kind: "dynamic_form",
        ...(optionalSafeString(input.title, "El título") ? { title: optionalSafeString(input.title, "El título") } : {}),
        ...(optionalSafeString(input.description, "La descripción")
          ? { description: optionalSafeString(input.description, "La descripción") }
          : {}),
        widgets,
        submit_label: optionalSafeString(input.submit_label, "La etiqueta de envío") ?? "Enviar",
        submit_prompt:
          optionalSafeString(input.submit_prompt, "El prompt de envío") ??
          optionalSafeString(input.title, "El título") ??
          "Formulario enviado",
      },
    };
  } catch (error) {
    if (error instanceof DfFail) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

/** ¿Es un widget que recolecta un valor del médico? */
export function isInputWidget(widget: DynamicWidget): boolean {
  return INPUT_TYPES.has(widget.type) || widget.type === "decision_list";
}

/**
 * Mensaje de seguimiento al enviar un formulario dinámico: continúa la conversación con los
 * valores recolectados. NO escribe nada por sí mismo; si el modelo decide una acción clínica de
 * escritura, esa acción pasa por la aprobación del médico (P1) como cualquier otra.
 */
export function buildDynamicFormSubmission(
  spec: DynamicFormSpec,
  values: Record<string, string>,
): string {
  const lines: string[] = [];
  const walk = (widgets: DynamicWidget[]): void => {
    for (const widget of widgets) {
      if (widget.type === "section") {
        walk(widget.children);
        continue;
      }
      if (widget.type === "decision_list") {
        for (const item of widget.items) {
          lines.push(`- ${item.text}: ${values[`${widget.name}.${item.value}`] ?? ""}`);
        }
        continue;
      }
      if (isInputWidget(widget)) {
        const input = widget as { name: string; label?: string };
        lines.push(`- ${input.label ?? input.name}: ${values[input.name] ?? ""}`);
      }
    }
  };
  walk(spec.widgets);
  return `${spec.submit_prompt}\n${lines.join("\n")}`;
}
