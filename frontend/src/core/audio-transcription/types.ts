// Transcripción de audio de consulta EJECUTADA EN EL NAVEGADOR (F-MEDIOS fase 2b).
//
// El objetivo clínico: el audio del paciente NUNCA sale del dispositivo del médico (Whisper
// corre localmente con transformers.js). El servidor STT (fase 2) queda como respaldo OPCIONAL
// por configuración. Toda transcripción es un BORRADOR NO confiable que el médico revisa.

/** Modelos Whisper soportados (transformers.js / ONNX). 'base' por defecto; 'tiny' para equipos
 *  de gama baja. Ambos son multilingües (buenos para español). */
export type WhisperModel = "Xenova/whisper-base" | "Xenova/whisper-tiny";

export const DEFAULT_WHISPER_MODEL: WhisperModel = "Xenova/whisper-base";

/** De dónde provino la transcripción. */
export type TranscriptionSource = "browser-local" | "server";

/** Etapas de progreso que el worker reporta a la UI. */
export type TranscriptionStage = "download" | "transcribe";

export interface TranscriptionProgress {
  stage: TranscriptionStage;
  /** 0..100 cuando se conoce (descarga del modelo); ausente en etapas indeterminadas. */
  progress?: number;
  /** Archivo del modelo en descarga, si aplica. */
  file?: string;
}

/** Resultado normalizado de una transcripción (local o servidor). */
export interface TranscriptionOutcome {
  available: boolean;
  transcript: string | null;
  /** 'browser-local' cuando corrió en el dispositivo; 'server' cuando vino del proveedor STT. */
  source: TranscriptionSource | null;
  /** Modelo local usado (si fue local) o proveedor (si fue servidor). */
  model?: string | null;
  provider?: string | null;
  notes?: string | null;
}
