// Orquestador PURO de la selección de fuente de transcripción: navegador-local por defecto,
// proveedor del servidor como respaldo. Sin dependencias de navegador ni de transformers.js: las
// capacidades reales se inyectan, de modo que es unit-testeable sin worker ni red.

import type { TranscriptionOutcome } from "./types";

/** Mensaje fijo que deja claro al médico que el audio no salió del dispositivo. */
export const LOCAL_PRIVACY_NOTE =
  "Transcripción generada LOCALMENTE en este dispositivo; el audio NO se envió a ningún " +
  "tercero. Es un borrador no confiable: revísalo y corrígelo.";

export interface ResolveTranscriptionDeps {
  /** ¿Preferir el navegador-local? (config; por defecto true). */
  preferLocal: boolean;
  /** ¿El navegador soporta la transcripción local? */
  localSupported: () => boolean;
  /** Ejecuta la transcripción local. Debe LANZAR si falla (worker/WebGPU/decodificación). */
  runLocal: () => Promise<{ text: string; model: string }>;
  /** Respaldo: consulta el proveedor STT del servidor. Devuelve su JSON tal cual. */
  runServer: () => Promise<TranscriptionOutcome>;
}

/**
 * Decide la fuente y devuelve el resultado normalizado.
 *
 * - Si se prefiere local Y el navegador lo soporta: intenta local. Si tiene éxito, devuelve la
 *   transcripción con ``source='browser-local'`` y la nota de privacidad; NUNCA toca el servidor.
 * - Si local está deshabilitado, no soportado, o FALLA: cae al proveedor del servidor y devuelve
 *   su respuesta tal cual (que puede ser ``available=false`` / 'no disponible' sin fabricar).
 */
export async function resolveAudioTranscript(
  deps: ResolveTranscriptionDeps,
): Promise<TranscriptionOutcome> {
  if (deps.preferLocal && deps.localSupported()) {
    try {
      const { text, model } = await deps.runLocal();
      return {
        available: true,
        transcript: text,
        source: "browser-local",
        model,
        provider: null,
        notes: LOCAL_PRIVACY_NOTE,
      };
    } catch (err) {
      // Falla local (worker/WebGPU/decodificación no disponible): caemos al servidor. Se deja
      // rastro en consola — sin el warn, un fallo local con el proveedor de servidor sin
      // configurar se percibía como "la transcripción está rota" sin ninguna pista del porqué.
      // El error del worker no contiene audio ni PHI (mensajes de inicialización/decodificación).
      console.warn("Transcripción local falló; se intenta el proveedor del servidor.", err);
    }
  }
  return deps.runServer();
}
