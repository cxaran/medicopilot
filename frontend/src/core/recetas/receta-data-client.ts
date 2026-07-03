"use client";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { buildRecetaView, type RecetaView } from "@/core/recetas/receta-print";

/**
 * Carga (lado navegador) las lecturas del CONTRATO necesarias para armar la vista de una receta y las
 * compone con ``buildRecetaView`` (puro). Espeja lo que hacía la ruta de impresión server-side, pero
 * para el diálogo de impresión: prescription + items + consulta → paciente + alergias. SÓLO LECTURA;
 * tolera 403/404/red por sección (degrada a null) salvo la receta, que es obligatoria. El RBAC lo
 * aplica el backend en cada request.
 */

type Dict = Record<string, unknown>;
interface OffsetPage<T> {
  items: T[];
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return await browserApi<T>(path);
  } catch (error) {
    if (error instanceof ApiRequestError) return null;
    throw error;
  }
}

export async function loadRecetaView(prescriptionId: string): Promise<RecetaView | null> {
  const prescription = await readJson<Dict>(
    `/api/v1/prescriptions/${encodeURIComponent(prescriptionId)}`,
  );
  if (!prescription) return null;

  const itemsPage = await readJson<OffsetPage<Dict>>(
    `/api/v1/prescription-items?prescription_id=${encodeURIComponent(prescriptionId)}&sort=position&limit=100`,
  );
  const items = itemsPage?.items ?? [];

  let patient: Dict | null = null;
  let allergyItems: Dict[] = [];

  const consultationId =
    typeof prescription.consultation_id === "string" ? prescription.consultation_id : null;
  if (consultationId) {
    const consultation = await readJson<Dict>(
      `/api/v1/consultations/${encodeURIComponent(consultationId)}`,
    );
    const patientId =
      consultation && typeof consultation.patient_id === "string" ? consultation.patient_id : null;
    if (patientId) {
      patient = await readJson<Dict>(`/api/v1/patients/${encodeURIComponent(patientId)}`);
      const allergyPage = await readJson<OffsetPage<Dict>>(
        `/api/v1/patient-clinical-items?patient_id=${encodeURIComponent(patientId)}&item_type=allergy&limit=100`,
      );
      allergyItems = allergyPage?.items ?? [];
    }
  }

  // Zona horaria del navegador para la fecha de emisión (documento del médico local).
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return buildRecetaView({ prescription, items, patient, allergyItems }, { timeZone });
}
