// Cableado de la transcripción para la tool del agente ``clinical.get_audio_transcript``:
// navegador-local por defecto, proveedor del servidor como respaldo. El transcriptor local se
// importa DINÁMICAMENTE y sólo cuando el navegador lo soporta, de modo que ni transformers.js ni
// el worker se cargan en SSR ni en los tests de node (donde el flujo cae directo al servidor).

import {
  defaultWhisperModel,
  isLocalTranscriptionSupported,
  localTranscriptionEnabled,
} from "./support";
import { resolveAudioTranscript } from "./transcribe";
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
        language: "spanish",
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
