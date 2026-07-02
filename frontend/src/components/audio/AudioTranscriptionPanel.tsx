"use client";

// Panel de transcripción de audio de consulta. POR DEFECTO transcribe EN EL NAVEGADOR (Whisper
// local): el audio NO sale del dispositivo del médico. Muestra el progreso (descarga del modelo
// y transcripción), permite precargar y elegir el tamaño del modelo (base/tiny), y caer al
// proveedor del servidor si se desea. El texto resultante es un BORRADOR que el médico revisa
// antes de usarlo para componer la nota de consulta (nada se guarda de forma autónoma).
//
// La lógica de presentación (textos, estados) vive en core/audio-transcription/panel-view.ts
// (pura y testeada); aquí sólo se compone la vista.

import { useState } from "react";

import { useLocalTranscription } from "@/core/audio-transcription/use-local-transcription";
import {
  CACHE_HINT,
  MODEL_LABELS,
  PRIVACY_BANNER,
  accelerationNote,
  progressMessage,
  progressPercent,
  sourceMessage,
  unavailableMessage,
  unsupportedNote,
} from "@/core/audio-transcription/panel-view";
import type { WhisperModel } from "@/core/audio-transcription/types";

export interface AudioTranscriptionPanelProps {
  /** Documento clínico de audio a transcribir. */
  clinicalDocumentId: string;
  /** Se invoca con el texto cuando el médico lo confirma como borrador para la nota. */
  onUseTranscript?: (text: string) => void;
}

export function AudioTranscriptionPanel({
  clinicalDocumentId,
  onUseTranscript,
}: AudioTranscriptionPanelProps) {
  const t = useLocalTranscription();
  const [model, setModel] = useState<WhisperModel>("Xenova/whisper-base");
  const [draft, setDraft] = useState("");

  const busy = t.status === "running" || t.status === "preloading";
  const unsupported = unsupportedNote(t.localSupported, t.localEnabled);
  const accel = accelerationNote(t.localSupported, t.webgpu);
  const pct = progressPercent(t.progress);

  // Cada corrida COMPLETADA refleja su propio resultado (aunque venga vacío): sin esto, un
  // borrador de una corrida anterior reaparecía en el textarea tras una re-corrida sin texto.
  async function start(forceServer: boolean) {
    const result = await t.transcribe(clinicalDocumentId, { model, forceServer });
    if (result) {
      setDraft(result.transcript ?? "");
    }
  }

  return (
    <section aria-label="Transcripción de audio" className="flex flex-col gap-3 rounded border p-4">
      <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">🔒 {PRIVACY_BANNER}</p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="whisper-model" className="font-medium">
          Modelo:
        </label>
        <select
          id="whisper-model"
          className="rounded border px-2 py-1"
          value={model}
          disabled={busy}
          onChange={(event) => setModel(event.target.value as WhisperModel)}
        >
          {(Object.keys(MODEL_LABELS) as WhisperModel[]).map((value) => (
            <option key={value} value={value}>
              {MODEL_LABELS[value]}
            </option>
          ))}
        </select>
        {unsupported && <span className="text-amber-700">{unsupported}</span>}
        {accel && <span className="text-gray-500">{accel}</span>}
      </div>

      <p className="text-xs text-gray-500">{CACHE_HINT}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void start(false)}
        >
          {t.status === "running" ? "Transcribiendo…" : "Transcribir en el dispositivo"}
        </button>
        {t.localSupported && t.localEnabled && (
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            // Por-modelo: precargar 'base' no marca 'tiny' como listo (antes un booleano global
            // bloqueaba precargar el segundo modelo).
            disabled={busy || t.preloadedModels.has(model)}
            onClick={() => void t.preload(model)}
            title="Descarga y cachea el modelo para que la transcripción sea instantánea."
          >
            {t.preloadedModels.has(model)
              ? "Modelo precargado ✓"
              : t.status === "preloading"
                ? "Precargando…"
                : "Precargar modelo"}
          </button>
        )}
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => void start(true)}
          title="Usa el proveedor de voz a texto del servidor (si está configurado)."
        >
          Usar proveedor del servidor
        </button>
      </div>

      {busy && (
        <div aria-live="polite" className="text-sm text-gray-700">
          {progressMessage(t.progress)}
          {pct !== null && (
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
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
          {unavailableMessage(t.outcome)}
        </p>
      )}

      {t.status === "done" && t.outcome?.available && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">{sourceMessage(t.outcome)}</p>
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
