// Transcripción LOCAL en el navegador: descarga el audio del documento, lo decodifica con la Web
// Audio API (mono, 16 kHz Float32 — lo que Whisper espera) y se lo pasa al Web Worker que corre
// el modelo. Sólo se carga dinámicamente cuando ``isLocalTranscriptionSupported()`` es true, así
// que este módulo (y transformers.js vía el worker) NUNCA se evalúa en SSR ni en los tests de node.
//
// CONFIDENCIALIDAD: la única petición de red es DESCARGAR el audio del propio backend (mismo
// origen). El audio se procesa en memoria; no se envía a ningún tercero. Los pesos del modelo se
// descargan del CDN de Hugging Face (código público, sin PHI) y se cachean en IndexedDB.
//
// WORKER SINGLETON: el worker se crea una vez y se REUTILIZA entre llamadas, con ids de petición
// para correlacionar respuestas. Antes se creaba (y terminaba) un worker por transcripción, lo
// que hacía inalcanzable el caché de pipelines: cada fragmento del dictado continuo re-pagaba
// spawn + pesos + sesión ONNX (segundos por fragmento) y "Precargar modelo" sólo calentaba la
// caché HTTP. Trade-off documentado: cancelar (AbortSignal) ahora DESCARTA el resultado sin matar
// el worker (soft-abort) — el cómputo en vuelo termina en segundo plano, pero la sesión del
// modelo sobrevive para la siguiente transcripción, que es el punto.

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

interface PendingRequest {
  resolve: (value: { kind: "text"; text: string } | { kind: "ready" }) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: TranscriptionProgress) => void;
}

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** Worker compartido de larga vida. Si el worker MISMO falla (no una petición: eso viaja como
 *  mensaje ``error`` con id), se rechazan todas las pendientes y se destruye para recrearlo en la
 *  siguiente llamada. */
function ensureWorker(): Worker {
  if (sharedWorker) {
    return sharedWorker;
  }
  const worker = createWorker();
  worker.onmessage = (event: MessageEvent) => {
    const message = event.data;
    const entry = typeof message?.id === "number" ? pending.get(message.id) : undefined;
    if (!entry) {
      return; // Petición cancelada (soft-abort) o mensaje desconocido: se descarta.
    }
    if (message.type === "progress") {
      entry.onProgress?.({ stage: message.stage, progress: message.progress, file: message.file });
    } else if (message.type === "result") {
      pending.delete(message.id);
      entry.resolve({ kind: "text", text: typeof message.text === "string" ? message.text : "" });
    } else if (message.type === "ready") {
      pending.delete(message.id);
      entry.resolve({ kind: "ready" });
    } else if (message.type === "error") {
      pending.delete(message.id);
      entry.reject(new Error(message.message || "Error del transcriptor local."));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Error del worker.");
    for (const entry of pending.values()) {
      entry.reject(error);
    }
    pending.clear();
    worker.terminate();
    if (sharedWorker === worker) {
      sharedWorker = null;
    }
  };
  sharedWorker = worker;
  return worker;
}

/** Envía una petición al worker compartido y espera SU respuesta (por id). El abort es SUAVE:
 *  la promesa rechaza y el resultado se descarta al llegar, sin matar la sesión del modelo. */
function requestFromWorker(
  message: Record<string, unknown>,
  transfer: Transferable[],
  options: { onProgress?: (progress: TranscriptionProgress) => void; signal?: AbortSignal },
  abortMessage: string,
): Promise<{ kind: "text"; text: string } | { kind: "ready" }> {
  const worker = ensureWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      pending.delete(id);
      reject(new Error(abortMessage));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: (value) => {
        options.signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      reject: (error) => {
        options.signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
      onProgress: options.onProgress,
    });
    worker.postMessage({ ...message, id }, transfer);
  });
}

/** Transcribe el audio del documento localmente. Resuelve con el texto o LANZA si algo falla
 *  (worker no soportado, audio no decodificable, error del modelo) para que el caller caiga al
 *  proveedor del servidor. */
export async function transcribeLocally(options: LocalTranscribeOptions): Promise<string> {
  const audio = await decodeAudioToMono16k(options.audioUrl, options.signal);
  const outcome = await requestFromWorker(
    { type: "transcribe", audio, model: options.model, language: options.language },
    [audio.buffer],
    { onProgress: options.onProgress, signal: options.signal },
    "Transcripción cancelada.",
  );
  return outcome.kind === "text" ? outcome.text : "";
}

/** Precarga los pesos del modelo (IndexedDB) Y deja la sesión viva en el worker compartido: la
 *  siguiente transcripción arranca al instante de verdad. Resuelve cuando el modelo está listo. */
export async function preloadModelLocally(options: {
  model: WhisperModel;
  onProgress?: (progress: TranscriptionProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  await requestFromWorker(
    { type: "preload", model: options.model },
    [],
    { onProgress: options.onProgress, signal: options.signal },
    "Precarga cancelada.",
  );
}
