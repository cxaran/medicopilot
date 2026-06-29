"use client";

// Panel de transcripción de audio de consulta. POR DEFECTO transcribe EN EL NAVEGADOR (Whisper
// local): el audio NO sale del dispositivo del médico. Muestra el progreso (descarga del modelo
// y transcripción), permite elegir el tamaño del modelo (base/tiny) y caer al proveedor del
// servidor si se desea. El texto resultante es un BORRADOR que el médico revisa antes de usarlo
// para componer la nota de consulta (nada se guarda de forma autónoma).

import { useState } from "react";

import { useLocalTranscription } from "@/core/audio-transcription/use-local-transcription";
import type { WhisperModel } from "@/core/audio-transcription/types";

export interface AudioTranscriptionPanelProps {
  /** Documento clínico de audio a transcribir. */
  clinicalDocumentId: string;
  /** Se invoca con el texto cuando el médico lo confirma como borrador para la nota. */
  onUseTranscript?: (text: string) => void;
}

const MODEL_LABELS: Record<WhisperModel, string> = {
  "Xenova/whisper-base": "Base (mejor precisión)",
  "Xenova/whisper-tiny": "Tiny (más rápido, equipos de gama baja)",
};

export function AudioTranscriptionPanel({
  clinicalDocumentId,
  onUseTranscript,
}: AudioTranscriptionPanelProps) {
  const t = useLocalTranscription();
  const [model, setModel] = useState<WhisperModel>("Xenova/whisper-base");
  const [draft, setDraft] = useState("");

  const running = t.status === "running";

  async function start(forceServer: boolean) {
    const result = await t.transcribe(clinicalDocumentId, { model, forceServer });
    if (result?.transcript) {
      setDraft(result.transcript);
    }
  }

  const progressPct =
    t.progress?.stage === "download" && typeof t.progress.progress === "number"
      ? Math.round(t.progress.progress)
      : null;

  return (
    <section aria-label="Transcripción de audio" className="flex flex-col gap-3 rounded border p-4">
      <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">
        🔒 La transcripción se ejecuta <strong>localmente en este dispositivo</strong>. El audio
        <strong> no se envía a ningún tercero</strong>. Sólo se descargan, una vez, los pesos del
        modelo (código público, sin datos del paciente). El texto es un borrador no confiable que
        debes revisar.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="whisper-model" className="font-medium">
          Modelo:
        </label>
        <select
          id="whisper-model"
          className="rounded border px-2 py-1"
          value={model}
          disabled={running}
          onChange={(event) => setModel(event.target.value as WhisperModel)}
        >
          {(Object.keys(MODEL_LABELS) as WhisperModel[]).map((value) => (
            <option key={value} value={value}>
              {MODEL_LABELS[value]}
            </option>
          ))}
        </select>
        {!t.localSupported && (
          <span className="text-amber-700">
            Este navegador no soporta la transcripción local; se usará el proveedor del servidor.
          </span>
        )}
        {t.localSupported && !t.webgpu && (
          <span className="text-gray-500">WebGPU no disponible: se usará WASM (más lento).</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={running}
          onClick={() => void start(false)}
        >
          {running ? "Transcribiendo…" : "Transcribir en el dispositivo"}
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={running}
          onClick={() => void start(true)}
          title="Usa el proveedor de voz a texto del servidor (si está configurado)."
        >
          Usar proveedor del servidor
        </button>
      </div>

      {running && (
        <div aria-live="polite" className="text-sm text-gray-700">
          {t.progress?.stage === "download"
            ? `Descargando el modelo${progressPct !== null ? ` (${progressPct}%)` : "…"}`
            : "Transcribiendo el audio…"}
          {progressPct !== null && (
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-blue-600" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      )}

      {t.status === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {t.error}
        </p>
      )}

      {t.status === "done" && t.outcome && !t.outcome.available && (
        <p role="alert" className="text-sm text-amber-700">
          Transcripción no disponible. {t.outcome.notes ?? ""} No se inventa texto.
        </p>
      )}

      {t.status === "done" && t.outcome?.available && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">
            Fuente:{" "}
            {t.outcome.source === "browser-local"
              ? "navegador local (el audio no salió del dispositivo)"
              : `proveedor del servidor${t.outcome.provider ? ` (${t.outcome.provider})` : ""}`}
            . Borrador no confiable: revísalo.
          </p>
          <textarea
            aria-label="Transcripción (borrador editable)"
            className="min-h-32 w-full rounded border p-2 text-sm"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {onUseTranscript && (
            <button
              type="button"
              className="self-start rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
              disabled={!draft.trim()}
              onClick={() => onUseTranscript(draft.trim())}
            >
              Usar como borrador de la nota
            </button>
          )}
        </div>
      )}
    </section>
  );
}
