// Web Worker de transcripción: corre Whisper con transformers.js FUERA del hilo principal.
//
// Es el ÚNICO módulo que importa @huggingface/transformers, de modo que el bundler lo aísla en el
// chunk del worker (carga perezosa). Usa WebGPU cuando está disponible y cae a WASM. Los pesos del
// modelo se descargan una vez y transformers.js los cachea en IndexedDB. El AUDIO entra como
// Float32 ya decodificado por el hilo principal; NO se hace ninguna petición de red con el audio.

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
  audio: Float32Array;
  model: WhisperModel;
  /** Pista de idioma (p. ej. 'spanish'); opcional. */
  language?: string;
}

interface PreloadRequest {
  type: "preload";
  model: WhisperModel;
}

type WorkerIn = TranscribeRequest | PreloadRequest;

type WorkerOut =
  | { type: "progress"; stage: "download" | "transcribe"; progress?: number; file?: string }
  | { type: "ready" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerOut): void {
  ctx.postMessage(message);
}

// Cachea el pipeline por modelo para no recargar pesos entre transcripciones.
const pipelines = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();

async function getPipeline(model: WhisperModel): Promise<AutomaticSpeechRecognitionPipeline> {
  let cached = pipelines.get(model);
  if (!cached) {
    const device = "gpu" in navigator ? "webgpu" : "wasm";
    cached = pipeline("automatic-speech-recognition", model, {
      device,
      progress_callback: (progress: { status?: string; progress?: number; file?: string }) => {
        if (progress.status === "progress" || progress.status === "download") {
          post({
            type: "progress",
            stage: "download",
            progress: typeof progress.progress === "number" ? progress.progress : undefined,
            file: progress.file,
          });
        }
      },
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
    pipelines.set(model, cached);
  }
  return cached;
}

ctx.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const data = event.data;
  if (!data) {
    return;
  }
  // Precarga: calienta (y cachea en IndexedDB) los pesos del modelo sin transcribir.
  if (data.type === "preload") {
    try {
      await getPipeline(data.model);
      post({ type: "ready" });
    } catch (error) {
      post({ type: "error", message: error instanceof Error ? error.message : "error desconocido" });
    }
    return;
  }
  if (data.type !== "transcribe") {
    return;
  }
  try {
    const transcriber = await getPipeline(data.model);
    post({ type: "progress", stage: "transcribe" });
    const output = await transcriber(data.audio, {
      // Audio largo: ventanas de 30s con solape para no cortar palabras.
      chunk_length_s: 30,
      stride_length_s: 5,
      language: data.language,
    });
    const text = Array.isArray(output)
      ? output.map((part) => part.text ?? "").join(" ").trim()
      : (output.text ?? "").trim();
    post({ type: "result", text });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "error desconocido" });
  }
};
