// Captura de audio del micrófono para dictado / grabación de consulta en el copiloto. Este módulo
// es PURO (selección de contenedor, formato de duración, detección de soporte): NO toca
// MediaRecorder de forma estatal — esa captura vive en el hook use-audio-recorder.ts. El audio
// grabado se transcribe LOCALMENTE (Whisper en el dispositivo) y NUNCA se sube a ningún servidor.

export type RecorderStatus = "idle" | "recording" | "stopped";

/** Contenedores candidatos en orden de preferencia. Opus en WebM/OGG es liviano y lo decodifica
 *  la Web Audio API; mp4/mpeg es el respaldo de Safari. */
const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
] as const;

function defaultIsTypeSupported(type: string): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function" &&
    MediaRecorder.isTypeSupported(type)
  );
}

/**
 * Elige un ``mimeType`` soportado por MediaRecorder, o "" para que el navegador use su contenedor
 * por defecto. ``isSupported`` se inyecta para poder probar la selección sin un navegador real.
 */
export function pickRecordingMimeType(
  isSupported: (type: string) => boolean = defaultIsTypeSupported,
): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (isSupported(type)) {
      return type;
    }
  }
  return "";
}

/** ¿El navegador puede grabar del micrófono? Requiere getUserMedia + MediaRecorder. En node
 *  (SSR/tests) devuelve false. */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

/** Formatea una duración en milisegundos a ``mm:ss`` (acotada a >= 0). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
