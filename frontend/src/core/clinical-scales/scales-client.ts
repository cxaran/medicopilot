"use client";

import { browserApi } from "@/core/api/browser-client";
import type { ScaleComputeResult } from "@/core/clinical-scales/scales";

// Cliente de navegador de la calculadora de escalas. El listado se lee server-side en la página
// (con cookie); el cómputo es interactivo (POST con los insumos del formulario). Sin estado en el
// backend: cada compute es una llamada pura.

export function computeScale(
  scaleId: string,
  inputs: Record<string, boolean | number | string>,
): Promise<ScaleComputeResult> {
  return browserApi<ScaleComputeResult>(
    `/api/v1/clinical-scales/${encodeURIComponent(scaleId)}/compute`,
    { method: "POST", body: { inputs } },
  );
}
