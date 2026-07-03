"use client";

import { browserApi } from "@/core/api/browser-client";
import type { PatientSummaryRead } from "@/core/api/contracts";

/**
 * Obtiene el RESUMEN clínico compacto de un paciente (`GET /patients/{id}/summary`) para el
 * contexto del copiloto. Lectura con la cookie del médico (browserApi, credentials:"include");
 * el backend gatea con ``patient_summary:read`` y filtra los campos irrelevantes. Se llama sólo
 * al fijar el paciente activo y cuando el expediente cambia (dirty), no en cada turno.
 */
export function getPatientSummary(patientId: string): Promise<PatientSummaryRead> {
  return browserApi<PatientSummaryRead>(
    `/api/v1/patients/${encodeURIComponent(patientId)}/summary`,
    { method: "GET" },
  );
}
