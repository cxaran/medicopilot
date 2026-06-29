// PROMOCIÓN DINÁMICA→PLANTILLA (MP-CTRL-0132, arquitectura de UI híbrida sección 13). Cierra la
// última pieza nombrada de [[hybrid-ui-architecture]]: un mecanismo SÓLO-PROPUESTA para detectar
// cuándo una UI DINÁMICA (0117 [[dynamic-ui-whitelist-slice]]) debería convertirse en una PLANTILLA
// REGISTRADA (ResourceDefinition del catálogo 0115 [[template-catalog-slice]]) y RECOMENDARLO.
//
// CRÍTICO: NUNCA registra una ResourceDefinition ni muta el backend/registro — registrar una
// plantilla real es un cambio de CÓDIGO del desarrollador. La salida es una RECOMENDACIÓN legible y
// aprobada por humano que se muestra en el chat. Read-only, sin renderizador paralelo.
//
// SEÑAL DE FRECUENCIA: el sistema NO persiste el reuso de las UIs dinámicas (son efímeras: se generan
// por turno y no se guardan). Por eso la promoción se decide por los CRITERIOS ESTRUCTURALES de la
// sección 13 de la spec dada (campos regulados, involucra recetas/diagnósticos/órdenes/referencias,
// implicaciones legales, requiere validaciones, debe persistir estructurado) más cualquier señal que
// el caller provea EXPLÍCITAMENTE (reuso frecuente, multiespecialidad, institucional). La AUSENCIA de
// una señal NO cuenta como cumplimiento: no se inventa nada.

import type { DynamicFormSpec, DynamicWidget } from "./dynamic-form";

/** Umbral de "reuso frecuente" cuando el caller SÍ aporta un conteo (no se persiste en el sistema). */
export const FREQUENT_REUSE_THRESHOLD = 3;

/** Señales que el caller (agente) puede afirmar EXPLÍCITAMENTE; su ausencia ≠ cumplimiento. */
export interface PromotionSignals {
  /** Conteo de reuso aportado por el caller (no persistido). >= umbral ⇒ criterio frecuente. */
  reuse_count?: number;
  /** El caller afirma que involucra campos regulados. */
  regulated?: boolean;
  /** El caller afirma que se usa en varias especialidades. */
  multi_specialty?: boolean;
  /** El caller afirma que es un flujo institucional. */
  institutional?: boolean;
  /** El caller afirma implicaciones legales. */
  legal_implications?: boolean;
  /** El caller afirma que debe persistir estructurado. */
  must_persist_structured?: boolean;
}

export interface PromotionContext {
  signals?: PromotionSignals;
  /** Recursos ya registrados (para no proponer un nombre que colisione). */
  knownResources?: ReadonlySet<string>;
}

export type CriterionKey =
  | "frequent_reuse"
  | "regulated_fields"
  | "involves_clinical_orders"
  | "legal_implications"
  | "multi_specialty"
  | "institutional"
  | "requires_validations"
  | "must_persist_structured";

export interface MatchedCriterion {
  key: CriterionKey;
  label: string;
  detail: string;
}

export type SuggestedFieldType =
  | "string"
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "enum_multi";

export interface SuggestedField {
  name: string;
  label: string;
  suggested_type: SuggestedFieldType;
  required: boolean;
  /** El nombre/etiqueta del campo coincide con vocabulario regulado (revisar al registrar). */
  regulated: boolean;
  options?: { value: string; label: string }[];
}

export interface SuggestedTemplateShape {
  suggested_resource_name: string;
  /** El nombre propuesto choca con un recurso ya registrado (renombrar o reutilizar). */
  name_collision: boolean;
  label: string;
  fields: SuggestedField[];
  /** Observaciones (p. ej. widgets que no mapean a un campo persistible). */
  notes: string[];
}

export interface PromotionProposal {
  qualifies: boolean;
  /** Criterios FUERTES que justifican promover (al menos uno ⇒ califica). */
  matched_criteria: MatchedCriterion[];
  /** Criterios de APOYO (no bastan por sí solos para promover). */
  supporting_criteria: MatchedCriterion[];
  /** Forma sugerida de la plantilla; sólo presente si califica. */
  suggested_template_shape?: SuggestedTemplateShape;
  rationale: string;
  /** Cuando NO califica: por qué parece una UI puntual. */
  reasons?: string[];
}

export type PromotionResult =
  | { ok: true; proposal: PromotionProposal }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normaliza texto para coincidencias insensibles a acentos y mayúsculas. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Vocabulario de la sección 13. Determinista: se busca como subcadena sobre el texto normalizado de
// los campos (name + label + help) y de los textos de encabezado/tarjeta de la spec.
const REGULATED_TERMS = [
  "medicament",
  "farmac",
  "dosis",
  "dosific",
  "receta",
  "prescrip",
  "controlad",
  "estupefacient",
  "psicotrop",
  "narcotic",
  "consentimient",
  "firma",
  "incapacid",
  "certificad",
  "licencia",
];
const CLINICAL_ORDER_TERMS = [
  "receta",
  "prescrip",
  "diagnostic",
  "cie-10",
  "cie10",
  "orden",
  "estudio",
  "laboratori",
  "imagen",
  "radiograf",
  "tomograf",
  "referencia",
  "referral",
  "interconsult",
];
const LEGAL_TERMS = ["legal", "consentimient", "incapacid", "medico-legal", "certificad", "firma"];

function anyTermIn(haystack: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    if (haystack.includes(term)) return term;
  }
  return null;
}

/** Aplana los widgets (entra a las secciones) para recorrer todos los nodos. */
function flatten(widgets: readonly DynamicWidget[]): DynamicWidget[] {
  const out: DynamicWidget[] = [];
  for (const widget of widgets) {
    out.push(widget);
    if (widget.type === "section") out.push(...flatten(widget.children));
  }
  return out;
}

const INPUT_TYPES = new Set<DynamicWidget["type"]>([
  "text",
  "textarea",
  "number",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "radio",
]);

function widgetText(widget: DynamicWidget): string {
  const parts: string[] = [];
  if ("label" in widget && widget.label) parts.push(widget.label);
  if ("name" in widget && widget.name) parts.push(widget.name);
  if ("help" in widget && widget.help) parts.push(widget.help);
  if (widget.type === "heading") parts.push(widget.text);
  if (widget.type === "info_card") parts.push(widget.text);
  if (widget.type === "section" && widget.title) parts.push(widget.title);
  return norm(parts.join(" "));
}

const TYPE_MAP: Record<string, SuggestedFieldType> = {
  text: "string",
  textarea: "text",
  number: "number",
  date: "date",
  checkbox: "boolean",
  select: "enum",
  radio: "enum",
  multiselect: "enum_multi",
};

/** Deriva un nombre de recurso snake_case a partir del título (o un nombre por defecto). */
function slugifyResourceName(title: string | undefined): string {
  const base = norm(title ?? "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "plantilla_propuesta";
}

function buildSuggestedShape(
  spec: DynamicFormSpec,
  knownResources: ReadonlySet<string> | undefined,
): SuggestedTemplateShape {
  const fields: SuggestedField[] = [];
  const notes: string[] = [];
  for (const widget of flatten(spec.widgets)) {
    if (widget.type === "decision_list") {
      notes.push(
        `El widget 'decision_list' '${widget.name}' no mapea a un campo persistible directo; ` +
          "modélalo como un sub-recurso o como varios campos al registrar la plantilla.",
      );
      continue;
    }
    if (!INPUT_TYPES.has(widget.type)) continue; // heading/info_card/section no son campos
    const input = widget as Extract<DynamicWidget, { name: string }>;
    const suggestedType = TYPE_MAP[widget.type] ?? "string";
    const field: SuggestedField = {
      name: input.name,
      label: "label" in input && input.label ? input.label : input.name,
      suggested_type: suggestedType,
      required: "required" in input && input.required === true,
      regulated: anyTermIn(widgetText(widget), REGULATED_TERMS) !== null,
    };
    if ((widget.type === "select" || widget.type === "radio" || widget.type === "multiselect")) {
      field.options = widget.options.map((option) => ({ value: option.value, label: option.label }));
    }
    fields.push(field);
  }

  const name = slugifyResourceName(spec.title);
  return {
    suggested_resource_name: name,
    name_collision: knownResources ? knownResources.has(name) : false,
    label: spec.title ?? "Plantilla propuesta",
    fields,
    notes,
  };
}

/**
 * Evalúa una spec de UI DINÁMICA (ya validada por la lista blanca 0117) contra los criterios de
 * promoción de la sección 13 y, si califica, produce una PROPUESTA de plantilla. READ-ONLY y SÓLO
 * PROPUESTA: nunca registra ni muta nada. No inventa criterios: la ausencia de una señal no cuenta.
 */
export function buildPromotionProposal(
  spec: DynamicFormSpec,
  ctx: PromotionContext = {},
): PromotionResult {
  if (!isObject(spec) || spec.kind !== "dynamic_form" || !Array.isArray(spec.widgets)) {
    return { ok: false, error: "Se requiere una especificación de UI dinámica válida." };
  }

  const signals = ctx.signals ?? {};
  const nodes = flatten(spec.widgets);
  const inputs = nodes.filter((w) => INPUT_TYPES.has(w.type) || w.type === "decision_list");
  const allText = nodes.map(widgetText).join(" ");

  const strong: MatchedCriterion[] = [];
  const supporting: MatchedCriterion[] = [];

  // --- Criterios FUERTES (cualquiera ⇒ califica) ---
  if (typeof signals.reuse_count === "number" && signals.reuse_count >= FREQUENT_REUSE_THRESHOLD) {
    strong.push({
      key: "frequent_reuse",
      label: "Reuso frecuente",
      detail: `El caller reporta ${signals.reuse_count} usos (≥ ${FREQUENT_REUSE_THRESHOLD}).`,
    });
  }
  const regulatedTerm = anyTermIn(allText, REGULATED_TERMS);
  if (regulatedTerm || signals.regulated === true) {
    strong.push({
      key: "regulated_fields",
      label: "Campos regulados",
      detail: regulatedTerm
        ? `Vocabulario regulado detectado ('${regulatedTerm}').`
        : "El caller afirma que involucra campos regulados.",
    });
  }
  const orderTerm = anyTermIn(allText, CLINICAL_ORDER_TERMS);
  if (orderTerm) {
    strong.push({
      key: "involves_clinical_orders",
      label: "Recetas/diagnósticos/órdenes/referencias",
      detail: `Involucra elementos clínicos formales ('${orderTerm}').`,
    });
  }
  const legalTerm = anyTermIn(allText, LEGAL_TERMS);
  if (legalTerm || signals.legal_implications === true) {
    strong.push({
      key: "legal_implications",
      label: "Implicaciones legales",
      detail: legalTerm
        ? `Vocabulario médico-legal detectado ('${legalTerm}').`
        : "El caller afirma implicaciones legales.",
    });
  }
  if (signals.multi_specialty === true) {
    strong.push({
      key: "multi_specialty",
      label: "Multiespecialidad",
      detail: "El caller afirma que se usa en varias especialidades.",
    });
  }
  if (signals.institutional === true) {
    strong.push({
      key: "institutional",
      label: "Flujo institucional",
      detail: "El caller afirma que es un flujo institucional.",
    });
  }

  // --- Criterios de APOYO (no bastan por sí solos) ---
  const hasValidations = nodes.some(
    (w) =>
      ("required" in w && w.required === true) ||
      (w.type === "number" && (w.min !== undefined || w.max !== undefined)) ||
      w.type === "select" ||
      w.type === "multiselect" ||
      w.type === "radio",
  );
  if (hasValidations) {
    supporting.push({
      key: "requires_validations",
      label: "Requiere validaciones",
      detail: "Tiene campos obligatorios, rangos numéricos u opciones cerradas.",
    });
  }
  if (signals.must_persist_structured === true || inputs.length >= 4) {
    supporting.push({
      key: "must_persist_structured",
      label: "Debe persistir estructurado",
      detail:
        signals.must_persist_structured === true
          ? "El caller afirma que debe persistir estructurado."
          : `Recoge ${inputs.length} campos estructurados.`,
    });
  }

  const qualifies = strong.length > 0;

  if (!qualifies) {
    const reasons = [
      "No coincide ningún criterio FUERTE de la sección 13: sin campos regulados, sin recetas/" +
        "diagnósticos/órdenes/referencias, sin implicaciones legales, y sin señal de reuso " +
        "frecuente/multiespecialidad/institucional aportada por el caller.",
    ];
    if (supporting.length > 0) {
      reasons.push(
        "Hay criterios de apoyo (" +
          supporting.map((c) => c.label.toLowerCase()).join(", ") +
          "), pero por sí solos no justifican promover: parece una UI puntual.",
      );
    }
    return {
      ok: true,
      proposal: {
        qualifies: false,
        matched_criteria: [],
        supporting_criteria: supporting,
        rationale:
          "Esta UI dinámica parece un caso puntual; conviene mantenerla como UI dinámica y NO " +
          "registrarla como plantilla por ahora.",
        reasons,
      },
    };
  }

  const shape = buildSuggestedShape(spec, ctx.knownResources);
  const rationale =
    `Esta UI dinámica parece candidata a PLANTILLA REGISTRADA porque cumple: ` +
    strong.map((c) => c.label.toLowerCase()).join(", ") +
    ". Es una RECOMENDACIÓN: registrar la plantilla es un cambio de código del desarrollador " +
    "(ResourceDefinition en el backend); no se registra de forma automática.";

  return {
    ok: true,
    proposal: {
      qualifies: true,
      matched_criteria: strong,
      supporting_criteria: supporting,
      suggested_template_shape: shape,
      rationale,
    },
  };
}

/** Especificación de UI de la propuesta (se integra a la unión UiSpec; se pinta en GeneratedUi). */
export interface TemplatePromotionSpec {
  kind: "template_promotion_proposal";
  title?: string;
  proposal: PromotionProposal;
  follow_up_label: string;
  follow_up_prompt: string;
}

/**
 * Mensaje de seguimiento de la propuesta: NO registra nada. Resume la recomendación para que un
 * humano (desarrollador) la evalúe; deja EXPLÍCITO que registrar la plantilla es un cambio de código
 * y nunca ocurre de forma automática.
 */
export function buildPromotionSubmission(prompt: string, proposal: PromotionProposal): string {
  const lines: string[] = [prompt];
  if (!proposal.qualifies) {
    lines.push("No se recomienda promover esta UI dinámica a plantilla por ahora.");
    for (const reason of proposal.reasons ?? []) lines.push(`- ${reason}`);
    return lines.join("\n");
  }
  lines.push("Recomendación: promover esta UI dinámica a plantilla registrada.");
  lines.push(`Criterios cumplidos: ${proposal.matched_criteria.map((c) => c.label).join(", ")}.`);
  const shape = proposal.suggested_template_shape;
  if (shape) {
    lines.push(
      `Forma sugerida: recurso '${shape.suggested_resource_name}'` +
        (shape.name_collision ? " (¡nombre en uso, renombrar!)" : "") +
        ` con ${shape.fields.length} campo(s).`,
    );
    for (const field of shape.fields) {
      lines.push(
        `- ${field.name} (${field.suggested_type})${field.required ? " *" : ""}` +
          `${field.regulated ? " [regulado]" : ""}`,
      );
    }
    for (const note of shape.notes) lines.push(`- Nota: ${note}`);
  }
  lines.push(
    "IMPORTANTE: esto es una recomendación para el equipo de desarrollo. Registrar la plantilla " +
      "(ResourceDefinition) es un cambio de código; NO se registra de forma automática.",
  );
  return lines.join("\n");
}
