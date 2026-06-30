import { cookies } from "next/headers";

import { requireSession } from "@/core/auth/session";
import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { ScalesCalculator } from "@/components/scales/ScalesCalculator";
import type { ScaleDefinition } from "@/core/clinical-scales/scales";

// Ruta dedicada de ESCALAS clínicas (cobertura backend↔frontend: antes /clinical-scales solo lo
// tocaba el agente). Server component: lee el listado de escalas (con cookie) y delega el cómputo
// interactivo al client component. Degrada a lista vacía ante 403 (sin clinical_scales:read) u otro
// error: la calculadora muestra el aviso de "sin acceso". Sólo lectura (compute no persiste).

export default async function ScalesPage() {
  await requireSession();

  let scales: ScaleDefinition[] = [];
  try {
    const cookie = (await cookies()).toString();
    scales = await serverApi<ScaleDefinition[]>("/api/v1/clinical-scales", { cookie });
  } catch (error) {
    if (!(error instanceof ApiRequestError)) {
      throw error;
    }
    // 403 u otro error de lectura: lista vacía → la calculadora avisa que no hay acceso.
    scales = [];
  }

  return <ScalesCalculator scales={scales} />;
}
