"use client";

import { browserApi } from "@/core/api/browser-client";
import { ApiRequestError } from "@/core/api/api-error";
import type { DoctorRead } from "@/core/api/contracts";

/**
 * Obtiene el PERFIL DE MÉDICO del usuario autenticado (`GET /doctors/me`) para anclar el contexto
 * del copiloto (quién atiende, con qué cédula firma los borradores). Devuelve ``null`` si el usuario
 * NO tiene perfil de médico (404): no todos los usuarios son doctores. Lectura con la cookie del
 * usuario (browserApi); es el perfil PROPIO, sin permiso de recurso.
 */
export async function getMyDoctor(): Promise<DoctorRead | null> {
  try {
    return await browserApi<DoctorRead>("/api/v1/doctors/me", { method: "GET" });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
