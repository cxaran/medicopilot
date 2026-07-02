// Web Worker de transcripción: corre Whisper con transformers.js FUERA del hilo principal.
//
// Es el ÚNICO módulo que importa @huggingface/transformers, de modo que el bundler lo aísla en el
// chunk del worker (carga perezosa). Usa WebGPU cuando hay un adapter REAL disponible y cae a
// WASM. Los pesos del modelo se descargan una vez y transformers.js los cachea en IndexedDB. El
// AUDIO entra como Float32 ya decodificado por el hilo principal; NO se hace ninguna petición de
// red con el audio.
//
// El worker es un SINGLETON de larga vida (lo reutiliza local-transcriber.ts entre llamadas): las
// peticiones llevan ``id`` y cada respuesta lo devuelve, para correlacionar varias en vuelo. Así
// el caché de pipelines de abajo por fin sirve — antes se creaba un worker por transcripción y
// cada fragmento del dictado re-pagaba pesos + sesión completos.

/// <reference lib="webworker" />
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

import type { WhisperModel } from "./types";

// WASM de un solo hilo: no exige SharedArrayBuffer (que requeriría aislamiento de origen
// COOP/COEP y podría romper otras partes de la app). Si hay WebGPU, se usará y será más rápido.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

interface TranscribeRequest {
  type: "transcribe";
  id: number;
  audio: Float32Array;
  model: WhisperModel;
  /** Pista de idioma (p. ej. 'spanish'); opcional. */
  language?: string;
}

interface PreloadRequest {
  type: "preload";
  id: number;
  model: WhisperModel;
}

type WorkerIn = TranscribeRequest | PreloadRequest;

type WorkerOut =
  | { type: "progress"; id: number; stage: "download" | "transcribe"; progress?: number; file?: string }
  | { type: "ready"; id: number }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerOut): void {
  ctx.postMessage(message);
}

// Cachea el pipeline por modelo para no recargar pesos entre transcripciones (el worker vive
// entre llamadas). El progreso de la carga se reporta a la petición que la DISPARÓ.
const pipelines = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();

/** Dispositivo real: WebGPU sólo si hay un adapter utilizable (en Windows con la GPU bloqueada
 *  ``navigator.gpu`` existe pero ``requestAdapter`` devuelve null y el pipeline fallaría). */
async function pickDevice(): Promise<"webgpu" | "wasm"> {
  const gpu = (navigator as { gpu?: { requestAdapter?: () => Promise<unknown | null> } }).gpu;
  if (!gpu?.requestAdapter) {
    return "wasm";
  }
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

async function getPipeline(
  model: WhisperModel,
  requestId: number,
): Promise<AutomaticSpeechRecognitionPipeline> {
  let cached = pipelines.get(model);
  if (!cached) {
    cached = (async () => {
      const device = await pickDevice();
      return (await pipeline("automatic-speech-recognition", model, {
        device,
        progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
          if (progress.status === "progress" || progress.status === "download") {
            post({
              type: "progress",
              id: requestId,
              stage: "download",
              progress: typeof progress.progress === "number" ? progress.progress : undefined,
              file: progress.file,
            });
          }
        },
      })) as AutomaticSpeechRecognitionPipeline;
    })();
    pipelines.set(model, cached);
    // Una carga fallida no debe envenenar el caché: la siguiente petición reintenta.
    cached.catch(() => pipelines.delete(model));
  }
  return cached;
}

ctx.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const data = event.data;
  if (!data) {
    return;
  }
  // Precarga: calienta (y cachea en IndexedDB + sesión en memoria) los pesos del modelo.
  if (data.type === "preload") {
    try {
      await getPipeline(data.model, data.id);
      post({ type: "ready", id: data.id });
    } catch (error) {
      post({
        type: "error",
        id: data.id,
        message: error instanceof Error ? error.message : "error desconocido",
      });
    }
    return;
  }
  if (data.type !== "transcribe") {
    return;
  }
  try {
    const transcriber = await getPipeline(data.model, data.id);
    post({ type: "progress", id: data.id, stage: "transcribe" });
    const output = await transcriber(data.audio, {
      // Audio largo: ventanas de 30s con solape para no cortar palabras.
      chunk_length_s: 30,
      stride_length_s: 5,
      language: data.language,
    });
    const text = Array.isArray(output)
      ? output.map((part) => part.text ?? "").join(" ").trim()
      : (output.text ?? "").trim();
    post({ type: "result", id: data.id, text });
  } catch (error) {
    post({
      type: "error",
      id: data.id,
      message: error instanceof Error ? error.message : "error desconocido",
    });
  }
};
