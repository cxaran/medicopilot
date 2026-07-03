// Definición PURA de las pestañas del expediente (record panel) del paciente — MP-CTRL-0125,
// rebanada 5 del rediseño. Cada pestaña del diseño mapea a su(s) recurso(s) del CONTRATO
// (RESOURCE_REGISTRY), con su ámbito de filtrado real. NO hardcodea columnas/forms/acciones: sólo
// dice QUÉ recurso(s) renderizar; la UI los pinta con los componentes genéricos existentes
// (ResourceTable) ya scoped por paciente. Verificado contra el registry: patient_id es filtro EQ
// en todos los recursos "patient" — incluidos vital_signs y prescriptions, cuyo paciente se
// DERIVA de la consulta en el backend (subconsulta del modelo), así que la pestaña reúne los
// registros de TODAS las consultas del paciente.

export type RecordTabId =
  | "general"
  | "historia"
  | "consultas"
  | "notas"
  | "signos"
  | "recetas"
  | "laboratorio"
  | "seguimiento"
  | "archivos"
  | "citas";

/** Ámbito de filtrado de un recurso dentro del expediente. ``detail`` = ficha de UN registro
 *  (el propio paciente), no una lista filtrada. */
export type RecordResourceScope = "patient" | "detail";

export interface RecordTabResource {
  /** Nombre REGISTRADO del recurso en /api/v1/resources (no inventar). */
  resourceName: string;
  scope: RecordResourceScope;
}

export interface RecordTabDef {
  id: RecordTabId;
  label: string;
  resources: readonly RecordTabResource[];
}

// Recursos por-paciente (patient_id es filtro EQ en el registry): historia, antecedentes, items
// clínicos (alergias/problemas/medicación actual), inmunizaciones, notas, signos vitales,
// recetas, laboratorio, estudios, escalas, tareas, eventos, documentos, citas.
export const RECORD_TABS: readonly RecordTabDef[] = [
  {
    // Ficha del PACIENTE (detalle del recurso patients, no una lista): primera pestaña
    // y default, para que abrir el expediente muestre los datos generales de inmediato.
    id: "general",
    label: "Datos generales",
    resources: [{ resourceName: "patients", scope: "detail" }],
  },
  {
    id: "historia",
    label: "Historia clínica",
    resources: [
      { resourceName: "medical_history_versions", scope: "patient" },
      { resourceName: "patient_history_items", scope: "patient" },
      { resourceName: "patient_clinical_items", scope: "patient" },
      { resourceName: "patient_immunizations", scope: "patient" },
    ],
  },
  {
    id: "consultas",
    label: "Consultas",
    resources: [{ resourceName: "consultations", scope: "patient" }],
  },
  {
    id: "notas",
    label: "Notas",
    resources: [{ resourceName: "clinical_notes", scope: "patient" }],
  },
  {
    id: "signos",
    label: "Signos vitales",
    resources: [{ resourceName: "vital_signs", scope: "patient" }],
  },
  {
    id: "recetas",
    label: "Recetas",
    resources: [{ resourceName: "prescriptions", scope: "patient" }],
  },
  {
    id: "laboratorio",
    label: "Laboratorio y estudios",
    resources: [
      { resourceName: "lab_results", scope: "patient" },
      { resourceName: "study_orders", scope: "patient" },
      { resourceName: "scale_results", scope: "patient" },
    ],
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    resources: [
      { resourceName: "clinical_tasks", scope: "patient" },
      { resourceName: "clinical_events", scope: "patient" },
    ],
  },
  {
    id: "archivos",
    label: "Archivos",
    resources: [{ resourceName: "clinical_documents", scope: "patient" }],
  },
  {
    id: "citas",
    label: "Citas",
    resources: [{ resourceName: "appointments", scope: "patient" }],
  },
];

export const DEFAULT_RECORD_TAB: RecordTabId = "general";

const VALID_TAB_IDS = new Set<string>(RECORD_TABS.map((tab) => tab.id));

/** Normaliza un id de pestaña (de URL/estado) a uno válido; cae a la pestaña por defecto. */
export function resolveRecordTab(raw: string | null | undefined): RecordTabId {
  return raw && VALID_TAB_IDS.has(raw) ? (raw as RecordTabId) : DEFAULT_RECORD_TAB;
}

/** Devuelve la definición de una pestaña por id (o la por defecto). */
export function recordTabDef(id: RecordTabId): RecordTabDef {
  return RECORD_TABS.find((tab) => tab.id === id) ?? RECORD_TABS[0];
}
