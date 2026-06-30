import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { MedicationReconciliationView } from "@/components/medication-reconciliation/MedicationReconciliationView";
import type { MedicationReconciliation } from "@/core/medication-reconciliation/reconciliation";

// Ruta dedicada de CONCILIACIÓN DE MEDICACIÓN por paciente (cobertura backend↔frontend: antes
// /patients/{id}/medication-reconciliation solo lo tocaba el agente). Server component: lee el
// endpoint con cookie; 404 si el paciente no existe; degrada a aviso si falta el permiso
// medication_reconciliation:read. Sólo lectura — no muta nada.

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MedicationReconciliationPage({ params }: PageProps) {
  await requireSession();
  const { id } = await params;

  let data: MedicationReconciliation | null = null;
  let forbidden = false;
  try {
    const cookie = (await cookies()).toString();
    data = await serverApi<MedicationReconciliation>(
      `/api/v1/patients/${encodeURIComponent(id)}/medication-reconciliation`,
      { cookie },
    );
  } catch (error) {
    if (!(error instanceof ApiRequestError)) {
      throw error;
    }
    if (error.status === 404) {
      notFound();
    }
    forbidden = error.status === 403;
  }

  return (
    <MedicationReconciliationView patientId={id} data={data} forbidden={forbidden} />
  );
}
