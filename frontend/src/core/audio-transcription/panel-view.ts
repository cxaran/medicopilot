// Lógica PURA de presentación del panel de transcripción (sin JSX): decide dónde se monta y
// deriva los textos/estados en español que muestra la UI. Se testea aquí; el componente .tsx
// sólo la consume (idéntico patrón a components/copilot/a11y.ts).

import type { TranscriptionOutcome, TranscriptionProgress, WhisperModel } from "./types";

/** Banner de privacidad, siempre visible y prominente. */
export const PRIVACY_BANNER =
  "La transcripción se hace en tu dispositivo; el audio no se envía a terceros. Sólo se " +
  "descargan, una vez, los pesos del modelo (código público, sin datos del paciente). El texto " +
  "es un borrador no confiable que debes revisar.";

/** Pista para el usuario de que la segunda corrida es instantánea (caché de IndexedDB). */
export const CACHE_HINT =
  "Si ya descargaste el modelo antes, se carga al instante desde la caché del navegador.";

export const MODEL_LABELS: Record<WhisperModel, string> = {
  "Xenova/whisper-base": "Base (mejor precisión)",
  "Xenova/whisper-tiny": "Tiny (más rápido, equipos de gama baja)",
};

/** Idioma que se le pasa a Whisper: las consultas son en español. */
export const WHISPER_LANGUAGE = "spanish";

/**
 * ¿Debe el detalle de un recurso mostrar el panel de transcripción local?
 *
 * Sólo para un ClinicalDocument cuyo ``document_type`` es 'audio'. Cualquier otro recurso o
 * tipo de documento NO lo muestra.
 */
export function shouldShowAudioTranscription(
  resourceName: string,
  detail: Record<string, unknown> | null | undefined,
): boolean {
  if (resourceName !== "clinical_documents" || !detail) {
    return false;
  }
  return detail.document_type === "audio";
}

/** Porcentaje de descarga del modelo (0..100) si se conoce; null en otras etapas. */
export function progressPercent(progress: TranscriptionProgress | null): number | null {
  if (progress?.stage === "download" && typeof progress.progress === "number") {
    return Math.max(0, Math.min(100, Math.round(progress.progress)));
  }
  return null;
}

/** Texto del estado en curso (descarga con %, o transcribiendo). */
export function progressMessage(progress: TranscriptionProgress | null): string {
  if (progress?.stage === "download") {
    const pct = progressPercent(progress);
    return pct !== null ? `Descargando el modelo (${pct}%)` : "Descargando el modelo…";
  }
  if (progress?.stage === "transcribe") {
    return "Transcribiendo el audio…";
  }
  return "Preparando…";
}

/** Mensaje de la fuente usada (para el resultado disponible). */
export function sourceMessage(outcome: TranscriptionOutcome): string {
  if (outcome.source === "browser-local") {
    return "Fuente: navegador local (el audio no salió del dispositivo). Borrador no confiable: revísalo.";
  }
  const provider = outcome.provider ? ` (${outcome.provider})` : "";
  return `Fuente: proveedor del servidor${provider}. Borrador no confiable: revísalo.`;
}

/** Aviso cuando el navegador no soporta la transcripción local o está deshabilitada por config.
 *  Devuelve null cuando sí está disponible (no se muestra aviso). */
export function unsupportedNote(localSupported: boolean, localEnabled: boolean): string | null {
  if (!localEnabled) {
    return "La transcripción local está deshabilitada por configuración; se usará el proveedor del servidor si está configurado.";
  }
  if (!localSupported) {
    return "Este navegador no soporta la transcripción local; se usará el proveedor del servidor si está configurado.";
  }
  return null;
}

/** Aviso de aceleración: WebGPU disponible vs WASM (informativo). */
export function accelerationNote(localSupported: boolean, webgpu: boolean): string | null {
  if (!localSupported) {
    return null;
  }
  return webgpu
    ? "Aceleración por WebGPU disponible."
    : "WebGPU no disponible: se usará WASM (más lento).";
}

/** Mensaje cuando el resultado no está disponible (sin fabricar texto). */
export function unavailableMessage(outcome: TranscriptionOutcome): string {
  const notes = outcome.notes ? ` ${outcome.notes}` : "";
  return `Transcripción no disponible.${notes} No se inventa texto.`;
}
