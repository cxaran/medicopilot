// Sugerencias de inicio del chat, DERIVADAS de las herramientas realmente disponibles para el
// médico (no una lista fija). Cada sugerencia declara las tools que la habilitan; solo se ofrece
// si TODAS están disponibles (no gateadas por rol) en el catálogo proyectado por permisos. De las
// elegibles se muestra una SELECCIÓN ALEATORIA, distinta según el contexto (agente global vs un
// paciente activo). Así el médico ve atajos pertinentes a lo que su rol puede hacer y al contexto,
// y no siempre los mismos.
//
// El módulo es PURO: el muestreo aleatorio se inyecta (``shuffle``) para poder testearlo. El
// catálogo de tools (procedencia + gating) ya viene proyectado por permisos desde el cliente
// (``buildToolCatalog`` sobre ``/api/v1/resources``).

import type { ToolCatalogEntry } from "./tool-catalog";

/** Contexto del chat: el agente global (sin paciente) o el chat de un paciente activo. */
export type SuggestionContext = "global" | "patient";

interface SuggestionCandidate {
  /** Texto del prompt sugerido (se inserta en el composer; el médico lo revisa antes de enviar). */
  readonly text: string;
  /** Tools que deben estar DISPONIBLES (no gateadas) para ofrecer la sugerencia. Vacío = siempre. */
  readonly requires: readonly string[];
  /** Dónde aplica: solo agente global, solo paciente, o ambos. */
  readonly context: SuggestionContext | "both";
}

// Catálogo curado de sugerencias. Mapea cada prompt a las tools que el agente usaría para
// responderlo; si el rol no tiene esas tools (gated_out), la sugerencia no aparece. Las de
// ESCRITURA (create_*) solo se ofrecen si el médico puede crear ese recurso.
const SUGGESTIONS: readonly SuggestionCandidate[] = [
  // ----- Agente global -----
  { text: "¿Cómo van las consultas de esta semana?", requires: ["clinical.list_recent_consultations"], context: "global" },
  { text: "Muéstrame una gráfica de la actividad reciente", requires: ["ui.render_chart", "clinical.list_recent_consultations"], context: "global" },
  { text: "¿Qué tengo en la agenda de hoy?", requires: ["clinical.list_appointments"], context: "global" },
  { text: "Busca un paciente por nombre o CURP", requires: ["clinical.search_patients"], context: "global" },
  { text: "¿Qué pendientes de seguimiento hay?", requires: ["clinical.list_follow_ups"], context: "global" },
  { text: "Muéstrame mis tareas pendientes", requires: ["clinical.list_tasks"], context: "global" },
  { text: "Arma una cohorte de pacientes con un criterio", requires: ["clinical.query_cohort"], context: "global" },
  { text: "Busca evidencia en PubMed sobre un tema", requires: ["pubmed.search"], context: "global" },
  { text: "Dar de alta a un paciente nuevo", requires: ["clinical.create_patient_draft"], context: "global" },
  { text: "Agendar una cita", requires: ["clinical.create_appointment_draft"], context: "global" },

  // ----- Paciente activo -----
  { text: "Dame un resumen del paciente", requires: ["clinical.patient_summary"], context: "patient" },
  { text: "¿Qué medicación toma actualmente?", requires: ["clinical.list_prescriptions"], context: "patient" },
  { text: "Concilia su medicación", requires: ["clinical.reconcile_medications"], context: "patient" },
  { text: "¿Cuáles son sus últimos signos vitales?", requires: ["clinical.list_vital_signs"], context: "patient" },
  { text: "Muéstrame una gráfica de sus signos vitales", requires: ["ui.render_chart", "clinical.list_vital_signs"], context: "patient" },
  { text: "Últimos resultados de laboratorio", requires: ["clinical.list_lab_results"], context: "patient" },
  { text: "Diagnósticos registrados", requires: ["clinical.list_diagnoses"], context: "patient" },
  { text: "Antecedentes e historia clínica", requires: ["clinical.list_history_items"], context: "patient" },
  { text: "Inmunizaciones registradas", requires: ["clinical.list_immunizations"], context: "patient" },
  { text: "Próximas citas del paciente", requires: ["clinical.list_appointments"], context: "patient" },
  { text: "Corre las verificaciones de calidad y seguridad", requires: ["clinical.run_quality_checks"], context: "patient" },
  { text: "Calcula una escala clínica (p. ej. qSOFA)", requires: ["clinical.compute_scale"], context: "patient" },
  { text: "Genera una nota SOAP en borrador", requires: ["clinical.create_soap_note_draft"], context: "patient" },
  { text: "Prepara una receta para revisar", requires: ["clinical.create_prescription_draft"], context: "patient" },
];

/** Mezcla Fisher-Yates (in-place sobre una copia). Aleatorio por defecto vía ``Math.random``. */
function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Construye las sugerencias de inicio para el contexto dado: filtra las candidatas cuyo contexto
 * coincide y cuyas tools están TODAS disponibles (no gateadas) en el catálogo, muestrea ``count``
 * al azar (``shuffle`` inyectable) y devuelve sus textos. Devuelve ``[]`` si no hay elegibles (el
 * caller decide el fallback, p. ej. una lista fija mientras carga el catálogo).
 */
export function buildStartSuggestions(
  catalog: readonly ToolCatalogEntry[],
  context: SuggestionContext,
  count = 4,
  shuffle: <T>(items: readonly T[]) => T[] = fisherYatesShuffle,
): string[] {
  const available = new Set(
    catalog.filter((entry) => entry.status !== "gated_out").map((entry) => entry.name),
  );
  const eligible = SUGGESTIONS.filter(
    (candidate) =>
      (candidate.context === context || candidate.context === "both") &&
      candidate.requires.every((name) => available.has(name)),
  );
  return shuffle(eligible)
    .slice(0, Math.max(0, count))
    .map((candidate) => candidate.text);
}
