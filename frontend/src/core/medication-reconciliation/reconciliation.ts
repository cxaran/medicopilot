// Tipos y lógica PURA de la conciliación de medicación (GET /patients/{id}/medication-reconciliation).
// El backend consolida lo PRESCRITO (recetas activas) y lo REPORTADO (medicamento actual del
// paciente), de-duplica por ingrediente/clase y MARCA discrepancias para revisión del médico. No
// muta nada ni inventa. Este módulo no toca red: define los shapes y helpers de presentación,
// unit-testeables. La obtención es server-only (en la página).

export interface ConsolidatedMedication {
  key: string;
  display_name: string;
  ingredient_or_class: string | null;
  resolver_status: string;
  prescribed_refs: readonly string[];
  reported_refs: readonly string[];
}

export interface ReconciliationFlag {
  kind: string;
  message: string;
  source_refs: readonly string[];
  ingredient_or_class: string | null;
  resolver_status: string;
}

export interface MedicationReconciliation {
  patient_id: string;
  consolidated: readonly ConsolidatedMedication[];
  flags: readonly ReconciliationFlag[];
  flag_count: number;
  resolver_available: boolean;
}

export type MedicationSource = "both" | "prescribed" | "reported" | "none";

/** ¿De dónde proviene un medicamento consolidado (prescrito, reportado o ambos)? */
export function medicationSource(med: ConsolidatedMedication): MedicationSource {
  const prescribed = med.prescribed_refs.length > 0;
  const reported = med.reported_refs.length > 0;
  if (prescribed && reported) {
    return "both";
  }
  if (prescribed) {
    return "prescribed";
  }
  if (reported) {
    return "reported";
  }
  return "none";
}

/** Etiqueta en español de la procedencia de un medicamento. */
export function sourceLabel(source: MedicationSource): string {
  switch (source) {
    case "both":
      return "Prescrito y reportado";
    case "prescribed":
      return "Solo prescrito";
    case "reported":
      return "Solo reportado (lo refiere el paciente)";
    default:
      return "Sin origen";
  }
}
