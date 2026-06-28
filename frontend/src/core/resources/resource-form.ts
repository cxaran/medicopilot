import type {
  ResourceFormCapability,
  ResourceFormFieldCapability,
  WidgetType,
} from "@/core/api/contracts";

const SUPPORTED_CREATE_WIDGETS = new Set<WidgetType>([
  "text",
  "email",
  "password",
  "switch",
  "textarea",
  // ``select`` (enum/opciones cerradas) y ``date`` (literal YYYY-MM-DD) son necesarios
  // para los formularios clínicos (p. ej. sexo/estado y fecha de nacimiento del paciente).
  "select",
  "date",
  // ``datetime`` (YYYY-MM-DDTHH:MM), ``number`` (entero/decimal) y ``time`` (HH:MM)
  // habilitan las pantallas clínicas centrales: consultas, signos vitales y agenda.
  "datetime",
  "number",
  "time",
]);

// La actualización no admite ``password``: el cambio de contraseña, si existe, tiene
// su propio contrato y flujo separado.
const SUPPORTED_UPDATE_WIDGETS = new Set<WidgetType>([
  "text",
  "email",
  "switch",
  "textarea",
  "select",
  "date",
  "datetime",
  "number",
  "time",
]);

export class FormContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormContractError";
  }
}

function assertSupportedFields(
  form: ResourceFormCapability,
  supported: Set<WidgetType>,
  context: string,
): void {
  const seen = new Set<string>();
  for (const field of form.fields) {
    if (!field.name || seen.has(field.name)) {
      throw new FormContractError(`Formulario de ${context} con campos inválidos.`);
    }
    seen.add(field.name);

    if (!field.widget || !supported.has(field.widget)) {
      throw new FormContractError(`Widget de ${context} no soportado: ${field.widget}.`);
    }
  }
}

export function assertSupportedCreateForm(form: ResourceFormCapability): void {
  if (form.method !== "POST") {
    throw new FormContractError("El formulario de creación debe usar POST.");
  }
  assertSupportedFields(form, SUPPORTED_CREATE_WIDGETS, "creación");
}

export function assertSupportedUpdateForm(form: ResourceFormCapability): void {
  if (form.method !== "PATCH" && form.method !== "PUT") {
    throw new FormContractError("El formulario de actualización debe usar PATCH o PUT.");
  }
  assertSupportedFields(form, SUPPORTED_UPDATE_WIDGETS, "actualización");
}

// Centinela: el campo se OMITE del payload (no se envía ninguna clave). Distinto de
// enviar ``null``: omitir deja que el backend aplique el default del campo (p. ej.
// ``status`` del paciente, que tiene default pero NO es nullable) y, en PATCH, deja el
// valor sin cambios (``exclude_unset``). Enviar ``null`` rompería los campos con default
// no-nullable y enviar ``""`` rompería validadores estrictos (EmailStr/date/datetime).
const OMIT = Symbol("omit-field");

function fieldValue(
  field: ResourceFormFieldCapability,
  formData: FormData,
): unknown {
  if (field.widget === "switch") {
    return formData.has(field.name);
  }
  const raw = formData.get(field.name);
  const text = typeof raw === "string" ? raw : "";
  // Campo vacío: si es opcional se OMITE (el backend aplica default / no cambia en PATCH);
  // si es requerido conserva ``""`` para que el backend lo reporte como faltante.
  if (text === "") {
    return field.required ? "" : OMIT;
  }
  // ``number`` se emite como valor numérico JSON (no string), entero o decimal. Si el texto
  // no fuera numérico (no debería con ``<input type="number">``) se conserva el texto y el
  // backend lo valida. ``datetime``/``date``/``time`` viajan como literal (YYYY-MM-DD[THH:MM]).
  if (field.widget === "number") {
    const numeric = Number(text);
    return Number.isNaN(numeric) ? text : numeric;
  }
  return text;
}

export function buildCreatePayload(
  fields: readonly ResourceFormFieldCapability[],
  formData: FormData,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = fieldValue(field, formData);
    if (value !== OMIT) {
      payload[field.name] = value;
    }
  }
  return payload;
}

// Payload allowlisted de actualización: solo campos editables declarados.
export function buildUpdatePayload(
  fields: readonly ResourceFormFieldCapability[],
  formData: FormData,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.editable === false) {
      continue;
    }
    const value = fieldValue(field, formData);
    if (value !== OMIT) {
      payload[field.name] = value;
    }
  }
  return payload;
}
