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

function fieldValue(
  field: ResourceFormFieldCapability,
  formData: FormData,
): unknown {
  if (field.widget === "switch") {
    return formData.has(field.name);
  }
  const raw = formData.get(field.name);
  const text = typeof raw === "string" ? raw : "";
  // Un campo opcional vacío se envía como ``null`` (no ``""``): respeta los ``Optional``
  // del backend, permite limpiar el valor en PATCH (``exclude_unset``) y evita 422 en
  // validadores estrictos como ``EmailStr`` o ``date`` que rechazan la cadena vacía. Un
  // campo requerido vacío conserva ``""`` para que el backend lo reporte como tal.
  if (text === "" && !field.required) {
    return null;
  }
  return text;
}

export function buildCreatePayload(
  fields: readonly ResourceFormFieldCapability[],
  formData: FormData,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    payload[field.name] = fieldValue(field, formData);
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
    payload[field.name] = fieldValue(field, formData);
  }
  return payload;
}
