// Tipos y lógica PURA de la calculadora de escalas clínicas (GET /api/v1/clinical-scales y
// POST /clinical-scales/{id}/compute). El cómputo es determinista y SIN ESTADO en el backend; toda
// salida es APOYO A LA DECISIÓN que el médico confirma (no es diagnóstico). Este módulo no toca red
// ni navegador: define los shapes y la coerción/validación de insumos del formulario, unit-testeable.
// La validación final es del servidor (422 nombrando campos); aquí solo se coercionan tipos y se
// marca lo faltante para no enviar un payload incompleto.

export type ScaleInputType = "boolean" | "enum" | "number";

export interface ScaleInputSpec {
  key: string;
  label: string;
  type: ScaleInputType;
  description?: string | null;
  allowed_values?: readonly string[] | null;
  min?: number | null;
  max?: number | null;
}

export interface ScaleDefinition {
  id: string;
  name: string;
  description: string;
  source: string;
  inputs: readonly ScaleInputSpec[];
}

export interface ScaleComputeResult {
  scale_id: string;
  score: number;
  interpretation_label: string;
  interpretation_detail: string;
  sources: readonly string[];
}

/** Valores iniciales del formulario (todo como string para inputs/selects controlados). Boolean
 *  arranca en "false" (No); enum y number arrancan vacíos para forzar la elección/captura. */
export function initialInputValues(scale: ScaleDefinition): Record<string, string> {
  const values: Record<string, string> = {};
  for (const input of scale.inputs) {
    values[input.key] = input.type === "boolean" ? "false" : "";
  }
  return values;
}

export interface ComputePayload {
  /** Insumos coercionados por tipo, listos para el POST (solo si no hay errores). */
  inputs: Record<string, boolean | number | string>;
  /** Errores por clave de insumo (vacío = todo válido). */
  errors: Record<string, string>;
}

/**
 * Coerciona los valores del formulario (strings) a su tipo real y valida lo mínimo en cliente:
 * boolean → true/false; enum → debe ser uno de allowed_values; number → finito y dentro de
 * [min, max] si se declaran. Marca faltantes/ inválidos en ``errors`` (la validación autoritativa
 * la hace el backend).
 */
export function buildComputePayload(
  scale: ScaleDefinition,
  raw: Record<string, string>,
): ComputePayload {
  const inputs: Record<string, boolean | number | string> = {};
  const errors: Record<string, string> = {};

  for (const input of scale.inputs) {
    const value = (raw[input.key] ?? "").trim();

    if (input.type === "boolean") {
      inputs[input.key] = value === "true";
      continue;
    }

    if (value === "") {
      errors[input.key] = "Captura este dato.";
      continue;
    }

    if (input.type === "enum") {
      const allowed = input.allowed_values ?? [];
      if (!allowed.includes(value)) {
        errors[input.key] = "Selecciona un valor válido.";
        continue;
      }
      inputs[input.key] = value;
      continue;
    }

    // number
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      errors[input.key] = "Debe ser un número.";
      continue;
    }
    if (typeof input.min === "number" && parsed < input.min) {
      errors[input.key] = `Mínimo ${input.min}.`;
      continue;
    }
    if (typeof input.max === "number" && parsed > input.max) {
      errors[input.key] = `Máximo ${input.max}.`;
      continue;
    }
    inputs[input.key] = parsed;
  }

  return { inputs, errors };
}

/** ¿El payload coercionado no tiene errores (se puede enviar)? */
export function hasNoErrors(payload: ComputePayload): boolean {
  return Object.keys(payload.errors).length === 0;
}
