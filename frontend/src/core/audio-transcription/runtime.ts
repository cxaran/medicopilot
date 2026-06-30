// Cableado de la transcripción para la tool del agente ``clinical.get_audio_transcript``:
// navegador-local por defecto, proveedor del servidor como respaldo. El transcriptor local se
// importa DINÁMICAMENTE y sólo cuando el navegador lo soporta, de modo que ni transformers.js ni
// el worker se cargan en SSR ni en los tests de node (donde el flujo cae directo al servidor).

import { WHISPER_LANGUAGE } from "./panel-view";
import {
  defaultWhisperModel,
  isLocalTranscriptionSupported,
  localTranscriptionEnabled,
} from "./support";
import { LOCAL_PRIVACY_NOTE, resolveAudioTranscript } from "./transcribe";
import type { TranscriptionOutcome, TranscriptionProgress, WhisperModel } from "./types";

/** Mínimo contrato del contexto de la tool (evita acoplar con todo ToolContext). */
export interface TranscriptApi {
  api: (path: string) => Promise<unknown>;
}

export interface RunAudioTranscriptOptions {
  model?: WhisperModel;
  onProgress?: (progress: TranscriptionProgress) => void;
  /** Forzar el proveedor del servidor (la UI lo expone como respaldo manual). */
  forceServer?: boolean;
}

function downloadUrl(documentId: string): string {
  return `/api/v1/clinical-documents/${encodeURIComponent(documentId)}/download`;
}

function transcriptUrl(documentId: string): string {
  return `/api/v1/clinical-documents/${encodeURIComponent(documentId)}/transcript`;
}

/**
 * Ejecuta la transcripción del documento de audio eligiendo la fuente.
 *
 * Por defecto intenta el navegador-local (Whisper en el dispositivo; el audio no sale de aquí) y
 * sólo cae al proveedor del servidor si el local está deshabilitado, no soportado o falla.
 */
export async function runAudioTranscript(
  documentId: string,
  ctx: TranscriptApi,
  options: RunAudioTranscriptOptions = {},
): Promise<TranscriptionOutcome> {
  const model = options.model ?? defaultWhisperModel();
  return resolveAudioTranscript({
    preferLocal: !options.forceServer && localTranscriptionEnabled(),
    localSupported: isLocalTranscriptionSupported,
    runLocal: async () => {
      const { transcribeLocally } = await import("./local-transcriber");
      const text = await transcribeLocally({
        audioUrl: downloadUrl(documentId),
        model,
        language: WHISPER_LANGUAGE,
        onProgress: options.onProgress,
      });
      return { text, model };
    },
    runServer: async () => {
      const result = (await ctx.api(transcriptUrl(documentId))) as TranscriptionOutcome;
      return result;
    },
  });
}

/**
 * Transcribe una GRABACIÓN EN VIVO (Blob del micrófono) LOCALMENTE en el navegador.
 *
 * A diferencia de ``runAudioTranscript``, NO hay respaldo de servidor: una grabación en vivo no es
 * un documento subido, así que enviarla a un proveedor STT violaría la confidencialidad del PHI.
 * Si el navegador no soporta el modo local, devuelve ``available=false`` con una nota clara (nunca
 * fabrica texto). El Blob se expone vía un object URL efímero que se revoca al terminar.
 */
export async function runRecordingTranscript(
  blob: Blob,
  options: RunAudioTranscriptOptions = {},
): Promise<TranscriptionOutcome> {
  const model = options.model ?? defaultWhisperModel();
  if (!localTranscriptionEnabled() || !isLocalTranscriptionSupported()) {
    return {
      available: false,
      transcript: null,
      source: null,
      model: null,
      provider: null,
      notes:
        "La transcripción local no está disponible en este navegador y una grabación en vivo no " +
        "se envía a ningún servidor. Usa un navegador con soporte o sube el audio como documento.",
    };
  }
  const { transcribeLocally } = await import("./local-transcriber");
  const objectUrl = URL.createObjectURL(blob);
  try {
    const text = await transcribeLocally({
      audioUrl: objectUrl,
      model,
      language: WHISPER_LANGUAGE,
      onProgress: options.onProgress,
    });
    return {
      available: true,
      transcript: text,
      source: "browser-local",
      model,
      provider: null,
      notes: LOCAL_PRIVACY_NOTE,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Precarga el modelo Whisper en el dispositivo (caché de IndexedDB) para que la primera
 *  transcripción real arranque al instante. No-op si el navegador no soporta el modo local. */
export async function preloadModel(
  model: WhisperModel = defaultWhisperModel(),
  onProgress?: (progress: TranscriptionProgress) => void,
): Promise<boolean> {
  if (!localTranscriptionEnabled() || !isLocalTranscriptionSupported()) {
    return false;
  }
  const { preloadModelLocally } = await import("./local-transcriber");
  await preloadModelLocally({ model, onProgress });
  return true;
}
