import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { requireSession } from "@/core/auth/session";
import { RecetaSheet } from "@/components/recetas/RecetaSheet";
import { buildRecetaView } from "@/core/recetas/receta-print";

// Vista de impresión de una receta EXISTENTE (MP-CTRL-0126). Ruta fuera del grupo (platform): usa
// sólo el layout raíz -> superficie limpia para imprimir (sin sidebar/topbar). SÓLO LECTURA: compone
// lecturas del CONTRATO (prescription + items + consulta -> paciente + alergias) vía serverApi con
// la cookie del médico. No emite, finaliza ni firma: la receta ya existe; esto sólo la imprime.
// El RBAC lo aplica el backend en cada lectura (403 -> se omite la sección; la receta es requerida).

// Zona del consultorio para la fecha de emisión (sólo fecha). UTC por defecto (determinista); la
// fecha de un documento no depende de la hora local. Mejorable con la zona configurada.
const DOCUMENT_TZ = "UTC";

type PageProps = { params: Promise<{ id: string }> };

interface OffsetPage<T> {
  items: T[];
}

/** Lee del backend tolerando errores de lectura (403/404/red) -> null para degradar la sección. */
async function readJson<T>(path: string, cookie: string): Promise<T | null> {
  try {
    return await serverApi<T>(path, { cookie });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return null;
    }
    throw error;
  }
}

export default async function RecetaImprimirPage({ params }: PageProps) {
  await requireSession();
  const { id } = await params;
  const cookie = (await cookies()).toString();

  const prescription = await readJson<Record<string, unknown>>(
    `/api/v1/prescriptions/${encodeURIComponent(id)}`,
    cookie,
  );
  if (!prescription) {
    // No existe o sin permiso de lectura: no se inventa una receta.
    notFound();
  }

  const itemsPage = await readJson<OffsetPage<Record<string, unknown>>>(
    `/api/v1/prescription-items?prescription_id=${encodeURIComponent(id)}&sort=position&limit=100`,
    cookie,
  );
  const items = itemsPage?.items ?? [];

  let patient: Record<string, unknown> | null = null;
  let allergyItems: Record<string, unknown>[] = [];

  const consultationId =
    typeof prescription.consultation_id === "string" ? prescription.consultation_id : null;
  if (consultationId) {
    const consultation = await readJson<Record<string, unknown>>(
      `/api/v1/consultations/${encodeURIComponent(consultationId)}`,
      cookie,
    );
    const patientId =
      consultation && typeof consultation.patient_id === "string" ? consultation.patient_id : null;
    if (patientId) {
      patient = await readJson<Record<string, unknown>>(
        `/api/v1/patients/${encodeURIComponent(patientId)}`,
        cookie,
      );
      const allergyPage = await readJson<OffsetPage<Record<string, unknown>>>(
        `/api/v1/patient-clinical-items?patient_id=${encodeURIComponent(patientId)}&item_type=allergy&limit=100`,
        cookie,
      );
      allergyItems = allergyPage?.items ?? [];
    }
  }

  const view = buildRecetaView(
    { prescription, items, patient, allergyItems },
    { timeZone: DOCUMENT_TZ },
  );

  return <RecetaSheet view={view} />;
}
