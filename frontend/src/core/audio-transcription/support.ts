// Detección de soporte y configuración de la transcripción LOCAL. Módulo puro: NO importa
// transformers.js ni toca el worker (es seguro importarlo en cualquier contexto, incluido el
// loader de tests de node).

import { DEFAULT_WHISPER_MODEL, type WhisperModel } from "./types";

/** ¿El entorno permite transcribir en el navegador?
 *
 * Requiere ``window``, Web Worker y Web Audio API (para decodificar el audio). WebGPU es
 * OPCIONAL: si no está, transformers.js cae a WASM. En node (tests/SSR) devuelve ``false``,
 * por lo que el flujo cae al proveedor del servidor sin tocar el worker. */
export function isLocalTranscriptionSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const hasWorker = typeof Worker !== "undefined";
  const hasAudio =
    typeof AudioContext !== "undefined" ||
    typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined";
  return hasWorker && hasAudio;
}

/** ¿Está habilitada la transcripción local? Por defecto SÍ (es el camino que protege el PHID:
 *  el audio no sale del dispositivo). Se puede desactivar con NEXT_PUBLIC_LOCAL_TRANSCRIPTION=off
 *  para forzar el proveedor del servidor. */
export function localTranscriptionEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_LOCAL_TRANSCRIPTION;
  return flag !== "off" && flag !== "false" && flag !== "0";
}

/** Indica si WebGPU está disponible (sólo informativo para la UI; no es obligatorio). */
export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function defaultWhisperModel(): WhisperModel {
  return DEFAULT_WHISPER_MODEL;
}
