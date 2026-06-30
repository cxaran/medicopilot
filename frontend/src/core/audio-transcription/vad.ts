// Segmentación del dictado CONTINUO por PAUSAS (detección de actividad de voz por nivel). Este
// módulo es PURO: recibe niveles de audio (RMS 0..1) con su marca de tiempo y decide cuándo se
// CIERRA un fragmento (silencio sostenido después de haber hablado). No toca la Web Audio API ni
// el micrófono — los niveles se inyectan, de modo que la lógica es unit-testeable en node.

export interface SilenceSegmenterOptions {
  /** Nivel RMS (0..1) por debajo del cual el instante se considera silencio. */
  silenceThreshold: number;
  /** Silencio sostenido (ms) que cierra un fragmento (la "pausa prolongada"). */
  silenceMs: number;
  /** Voz acumulada mínima (ms) para que un corte cuente; evita fragmentos de puro ruido/silencio. */
  minSpeechMs: number;
}

/** Por defecto: pausa media (~2 s), umbral conservador, 400 ms de voz mínima. */
export const DEFAULT_SEGMENTER_OPTIONS: SilenceSegmenterOptions = {
  silenceThreshold: 0.015,
  silenceMs: 2000,
  minSpeechMs: 400,
};

/** Presets de sensibilidad de la pausa, expuestos en la UI del dictado continuo. */
export type PausePresetId = "short" | "medium" | "long";

export interface PausePreset {
  id: PausePresetId;
  label: string;
  options: SilenceSegmenterOptions;
}

export const PAUSE_PRESETS: readonly PausePreset[] = [
  {
    id: "short",
    label: "Corta (~1.2 s)",
    options: { silenceThreshold: 0.015, silenceMs: 1200, minSpeechMs: 300 },
  },
  {
    id: "medium",
    label: "Media (~2 s)",
    options: { ...DEFAULT_SEGMENTER_OPTIONS },
  },
  {
    id: "long",
    label: "Larga (~3.5 s)",
    options: { silenceThreshold: 0.015, silenceMs: 3500, minSpeechMs: 500 },
  },
];

export const DEFAULT_PAUSE_PRESET_ID: PausePresetId = "medium";

/** Resuelve las opciones del segmentador a partir del id de preset (cae al default si no existe). */
export function pauseOptionsFor(id: PausePresetId): SilenceSegmenterOptions {
  return PAUSE_PRESETS.find((preset) => preset.id === id)?.options ?? DEFAULT_SEGMENTER_OPTIONS;
}

export interface SilenceSegmenter {
  /** Procesa un nivel en ``nowMs``; devuelve true si en este instante se CIERRA un fragmento. */
  push: (level: number, nowMs: number) => boolean;
  /** ¿Hay voz suficiente acumulada (para decidir si el corte final emite un fragmento)? */
  hasPendingSpeech: () => boolean;
  reset: () => void;
}

/**
 * Crea un segmentador por silencio. Acumula la voz mientras el nivel supera el umbral y, cuando el
 * silencio se sostiene ``silenceMs`` tras haber hablado al menos ``minSpeechMs``, marca un corte y
 * se reinicia para el siguiente fragmento. Durante un silencio largo NO corta repetidamente: tras
 * un corte exige nueva voz acumulada antes del siguiente.
 */
export function createSilenceSegmenter(
  options: SilenceSegmenterOptions = DEFAULT_SEGMENTER_OPTIONS,
): SilenceSegmenter {
  let speechMs = 0;
  let silenceStart: number | null = null;
  let lastTs: number | null = null;

  return {
    push(level, nowMs) {
      const dt = lastTs === null ? 0 : Math.max(0, nowMs - lastTs);
      lastTs = nowMs;

      if (level >= options.silenceThreshold) {
        // Voz: acumula y cancela cualquier cuenta de silencio en curso.
        speechMs += dt;
        silenceStart = null;
        return false;
      }

      // Silencio.
      if (silenceStart === null) {
        silenceStart = nowMs;
      }
      const silentFor = nowMs - silenceStart;
      if (silentFor >= options.silenceMs && speechMs >= options.minSpeechMs) {
        // Cierra el fragmento y reinicia (exige nueva voz antes de volver a cortar).
        speechMs = 0;
        silenceStart = null;
        return true;
      }
      return false;
    },
    hasPendingSpeech() {
      return speechMs >= options.minSpeechMs;
    },
    reset() {
      speechMs = 0;
      silenceStart = null;
      lastTs = null;
    },
  };
}

/** Calcula el nivel RMS (0..1) de una ventana de muestras en el dominio del tiempo (-1..1). */
export function rmsLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
