// Transcripción LOCAL en el navegador: descarga el audio del documento, lo decodifica con la Web
// Audio API (mono, 16 kHz Float32 — lo que Whisper espera) y se lo pasa al Web Worker que corre
// el modelo. Sólo se carga dinámicamente cuando ``isLocalTranscriptionSupported()`` es true, así
// que este módulo (y transformers.js vía el worker) NUNCA se evalúa en SSR ni en los tests de node.
//
// CONFIDENCIALIDAD: la única petición de red es DESCARGAR el audio del propio backend (mismo
// origen). El audio se procesa en memoria; no se envía a ningún tercero. Los pesos del modelo se
// descargan del CDN de Hugging Face (código público, sin PHI) y se cachean en IndexedDB.

import type { TranscriptionProgress, WhisperModel } from "./types";

export interface LocalTranscribeOptions {
  /** URL de descarga del audio (mismo origen; el navegador adjunta la cookie de sesión). */
  audioUrl: string;
  model: WhisperModel;
  language?: string;
  onProgress?: (progress: TranscriptionProgress) => void;
  signal?: AbortSignal;
}

const TARGET_SAMPLE_RATE = 16000;

/** Descarga el audio y lo decodifica a Float32 mono 16 kHz con la Web Audio API. */
async function decodeAudioToMono16k(audioUrl: string, signal?: AbortSignal): Promise<Float32Array> {
  const response = await fetch(audioUrl, { credentials: "include", signal });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio (${response.status}).`);
  }
  const encoded = await response.arrayBuffer();

  const AudioCtor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) {
    throw new Error("La Web Audio API no está disponible para decodificar el audio.");
  }
  // OfflineAudioContext permite remuestrear a 16 kHz al renderizar.
  const decodeCtx = new AudioCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(encoded.slice(0));
  } finally {
    void decodeCtx.close();
  }

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
  const sourceNode = offline.createBufferSource();
  sourceNode.buffer = decoded;
  sourceNode.connect(offline.destination);
  sourceNode.start();
  const rendered = await offline.startRendering();
  // Canal 0 = mono ya mezclado por el OfflineAudioContext (1 canal de salida).
  return rendered.getChannelData(0);
}

/** Crea el Web Worker del transcriptor. Aislado para poder mockearlo en pruebas si hiciera falta. */
function createWorker(): Worker {
  return new Worker(new URL("./transcriber.worker.ts", import.meta.url), { type: "module" });
}

/** Transcribe el audio del documento localmente. Resuelve con el texto o LANZA si algo falla
 *  (worker no soportado, audio no decodificable, error del modelo) para que el caller caiga al
 *  proveedor del servidor. */
export async function transcribeLocally(options: LocalTranscribeOptions): Promise<string> {
  const audio = await decodeAudioToMono16k(options.audioUrl, options.signal);

  const worker = createWorker();
  try {
    return await new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new Error("Transcripción cancelada."));
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });

      worker.onmessage = (event: MessageEvent) => {
        const message = event.data;
        if (message?.type === "progress") {
          options.onProgress?.({
            stage: message.stage,
            progress: message.progress,
            file: message.file,
          });
        } else if (message?.type === "result") {
          resolve(typeof message.text === "string" ? message.text : "");
        } else if (message?.type === "error") {
          reject(new Error(message.message || "Error del transcriptor local."));
        }
      };
      worker.onerror = (event) => reject(new Error(event.message || "Error del worker."));

      worker.postMessage(
        { type: "transcribe", audio, model: options.model, language: options.language },
        [audio.buffer],
      );
    });
  } finally {
    worker.terminate();
  }
}
