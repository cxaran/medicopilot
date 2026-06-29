// Resolución de un plan de "abrir plantilla con prellenado" (UI híbrida, paso 3) hacia los
// insumos que el RENDERIZADOR DE FORMULARIOS EXISTENTE (``ResourceFormFields``) consume. NO es un
// renderizador paralelo: produce los ``initialValues`` (que ResourceFormFields ya acepta) y un
// mapa de MARCAS por campo (prellenado / sugerido / a confirmar) + el fragmento de origen, para
// que la UI marque los campos sugeridos y a confirmar y muestre la trazabilidad. Nada se guarda:
// la aceptación del médico se enruta por la ruta P1 existente.

/** Plan resuelto y validado que devuelve el backend (POST /agent/templates/{id}/prefill). */
export interface OpenTemplateResolved {
  readonly template_id: string;
  readonly resource: string;
  readonly label: string;
  readonly mode: "create" | "edit" | "review";
  readonly method: string;
  readonly url_template: string;
  readonly values: Record<string, unknown>;
  readonly prefilled_fields: readonly string[];
  readonly suggested_fields: readonly string[];
  readonly fields_requiring_confirmation: readonly string[];
  readonly dropped_fields: readonly string[];
  readonly source_fragments: Record<string, string>;
  readonly source_overall?: string | null;
  readonly allowed_actions: readonly string[];
}

/** Marca de un campo en el formulario prellenado (para resaltar en la UI). */
export type FieldMark = "prefilled" | "suggested" | "confirm";

export interface PrefillFormModel {
  /** Valores iniciales que se pasan tal cual a ``ResourceFormFields`` (initialValues). */
  readonly initialValues: Record<string, unknown>;
  /** Marca por campo: sugerido y a-confirmar se resaltan; prellenado es alta confianza. */
  readonly marks: Record<string, FieldMark>;
  /** Fragmento de origen por campo (trazabilidad), sólo de campos con respaldo. */
  readonly sourceByField: Record<string, string>;
  /** Campos propuestos por el agente que NO existen en el esquema: se descartan (se avisan). */
  readonly droppedFields: readonly string[];
  /** Fragmento de origen general (si lo hay). */
  readonly sourceOverall: string | null;
}

/**
 * Construye el modelo de formulario prellenado a partir del plan resuelto. Las marcas priorizan
 * "a confirmar" (obligatorio) > "sugerido" > "prellenado" para que la UI destaque lo más
 * importante a revisar. Sólo se marcan campos con un valor inicial; los obligatorios sin valor
 * también se marcan ``confirm`` (el médico debe completarlos). No inventa campos.
 */
export function buildPrefillFormModel(plan: OpenTemplateResolved): PrefillFormModel {
  const initialValues: Record<string, unknown> = { ...plan.values };
  const marks: Record<string, FieldMark> = {};

  for (const field of plan.prefilled_fields) {
    marks[field] = "prefilled";
  }
  for (const field of plan.suggested_fields) {
    marks[field] = "suggested"; // menor confianza: se resalta como sugerencia
  }
  // "A confirmar" (obligatorio) tiene prioridad de resaltado sobre prellenado/sugerido.
  for (const field of plan.fields_requiring_confirmation) {
    marks[field] = "confirm";
  }

  const sourceByField: Record<string, string> = { ...plan.source_fragments };

  return {
    initialValues,
    marks,
    sourceByField,
    droppedFields: [...plan.dropped_fields],
    sourceOverall: plan.source_overall ?? null,
  };
}
