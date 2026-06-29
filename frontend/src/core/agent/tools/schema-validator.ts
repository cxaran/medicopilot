// Validador mínimo de un subconjunto de JSON Schema, suficiente para validar los
// argumentos de las tools del agente sin añadir una dependencia pesada. Soporta objetos
// con propiedades tipadas (string/integer/number/boolean/object), required, enum, minimum/
// maximum, format:"uuid" y additionalProperties:false.
//
// Para propiedades de tipo "object" la validación es SUPERFICIAL: se comprueba que el valor
// sea un objeto, pero no se recursan sus claves (p. ej. los insumos de una escala clínica,
// cuya validación estricta vive en el backend, que responde 422 nombrando el campo faltante).

export interface PropSchema {
  type: "string" | "integer" | "number" | "boolean" | "object";
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  format?: "uuid";
  additionalProperties?: boolean;
}

export interface ObjectSchema {
  type: "object";
  properties: Record<string, PropSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function checkProp(key: string, prop: PropSchema, value: unknown): string | null {
  if (prop.type === "integer" || prop.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return `El campo '${key}' debe ser numérico.`;
    }
    if (prop.type === "integer" && !Number.isInteger(value)) {
      return `El campo '${key}' debe ser un entero.`;
    }
    if (typeof prop.minimum === "number" && value < prop.minimum) {
      return `El campo '${key}' debe ser >= ${prop.minimum}.`;
    }
    if (typeof prop.maximum === "number" && value > prop.maximum) {
      return `El campo '${key}' debe ser <= ${prop.maximum}.`;
    }
    if (prop.enum && !prop.enum.includes(value)) {
      return `El campo '${key}' tiene un valor no permitido.`;
    }
    return null;
  }

  if (prop.type === "boolean") {
    return typeof value === "boolean" ? null : `El campo '${key}' debe ser booleano.`;
  }

  if (prop.type === "object") {
    // Validación superficial: debe ser un objeto (no arreglo ni null); no se recursa.
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? null
      : `El campo '${key}' debe ser un objeto.`;
  }

  // string
  if (typeof value !== "string") {
    return `El campo '${key}' debe ser texto.`;
  }
  if (prop.format === "uuid" && !UUID_RE.test(value)) {
    return `El campo '${key}' debe ser un UUID válido.`;
  }
  if (prop.enum && !prop.enum.includes(value)) {
    return `El campo '${key}' tiene un valor no permitido.`;
  }
  return null;
}

export function validateArgs(schema: ObjectSchema, value: unknown): ValidationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false, errors: ["Los argumentos deben ser un objeto."] };
  }

  const obj = value as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of schema.required ?? []) {
    if (obj[key] === undefined || obj[key] === null) {
      errors.push(`Falta el campo requerido '${key}'.`);
    }
  }

  for (const [key, raw] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) {
      if (schema.additionalProperties === false) {
        errors.push(`Campo no permitido '${key}'.`);
      }
      continue;
    }
    if (raw === undefined || raw === null) {
      continue;
    }
    const error = checkProp(key, prop, raw);
    if (error) {
      errors.push(error);
    }
  }

  return { valid: errors.length === 0, errors };
}
