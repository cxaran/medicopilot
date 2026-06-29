// Definición PURA de las pestañas del expediente (record panel) del paciente — MP-CTRL-0125,
// rebanada 5 del rediseño. Cada pestaña del diseño mapea a su(s) recurso(s) del CONTRATO
// (RESOURCE_REGISTRY), con su ámbito de filtrado real. NO hardcodea columnas/forms/acciones: sólo
// dice QUÉ recurso(s) renderizar; la UI los pinta con los componentes genéricos existentes
// (ResourceTable) ya scoped por paciente. Verificado contra el registry:
//   - patient_id es filtro EQ en: medical_history_versions, patient_history_items, consultations,
//     clinical_documents, appointments.
//   - vital_signs y prescriptions se filtran por consultation_id (NO por paciente): se marcan
//     "consultation" y la UI explica que se registran por consulta (sin filtrar, para no fugar
//     datos de otros pacientes).

export type RecordTabId =
  | "historia"
  | "consultas"
  | "signos"
  | "recetas"
  | "archivos"
  | "citas";

/** Ámbito de filtrado de un recurso dentro del expediente. */
export type RecordResourceScope = "patient" | "consultation";

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

export const RECORD_TABS: readonly RecordTabDef[] = [
  {
    id: "historia",
    label: "Historia clínica",
    resources: [
      { resourceName: "medical_history_versions", scope: "patient" },
      { resourceName: "patient_history_items", scope: "patient" },
    ],
  },
  {
    id: "consultas",
    label: "Consultas",
    resources: [{ resourceName: "consultations", scope: "patient" }],
  },
  {
    id: "signos",
    label: "Signos vitales",
    resources: [{ resourceName: "vital_signs", scope: "consultation" }],
  },
  {
    id: "recetas",
    label: "Recetas",
    resources: [{ resourceName: "prescriptions", scope: "consultation" }],
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

export const DEFAULT_RECORD_TAB: RecordTabId = "historia";

const VALID_TAB_IDS = new Set<string>(RECORD_TABS.map((tab) => tab.id));

/** Normaliza un id de pestaña (de URL/estado) a uno válido; cae a la pestaña por defecto. */
export function resolveRecordTab(raw: string | null | undefined): RecordTabId {
  return raw && VALID_TAB_IDS.has(raw) ? (raw as RecordTabId) : DEFAULT_RECORD_TAB;
}

/** Devuelve la definición de una pestaña por id (o la por defecto). */
export function recordTabDef(id: RecordTabId): RecordTabDef {
  return RECORD_TABS.find((tab) => tab.id === id) ?? RECORD_TABS[0];
}
