"use client";

// Dictado de consulta para el copiloto. Dos modos, ambos transcriben LOCALMENTE (Whisper en el
// dispositivo; el audio NUNCA sale del navegador):
//
//  1) Una toma: graba, detienes, transcribe y el borrador se INSERTA en el cuadro de mensaje.
//  2) Continuo: graba sin parar y en cada PAUSA prolongada (~2 s) cierra un fragmento, lo
//     transcribe y lo ENVÍA al copiloto (vía ``onSegment``); la grabación sigue hasta que detengas.
//     El cuadro de mensaje queda libre para que escribas una respuesta mientras se sigue grabando.
//
// Reusa el motor de transcripción local existente (use-local-transcription / use-continuous-
// dictation / runtime) sin duplicar lógica.

import { useEffect, useMemo, useRef, useState } from "react";

import { progressMessage, progressPercent, unavailableMessage } from "@/core/audio-transcription/panel-view";
import { formatDuration } from "@/core/audio-transcription/recorder";
import { useAudioRecorder } from "@/core/audio-transcription/use-audio-recorder";
import { useContinuousDictation } from "@/core/audio-transcription/use-continuous-dictation";
import { useLocalTranscription } from "@/core/audio-transcription/use-local-transcription";
import {
  DEFAULT_PAUSE_PRESET_ID,
  PAUSE_PRESETS,
  pauseOptionsFor,
  type PausePresetId,
} from "@/core/audio-transcription/vad";

export interface CopilotDictationProps {
  /** Una toma: se invoca con el borrador para insertarlo en el cuadro de mensaje. */
  onTranscript: (text: string) => void;
  /** Continuo: se invoca con cada fragmento al cerrarse una pausa (se envía al copiloto). */
  onSegment?: (text: string) => void;
  /** Deshabilita los controles (p. ej. cuando el copiloto no está conectado). */
  disabled?: boolean;
}

const NOOP = () => {};

export function CopilotDictation({ onTranscript, onSegment, disabled }: CopilotDictationProps) {
  const rec = useAudioRecorder();
  const tx = useLocalTranscription();
  const { transcribeBlob } = tx;
  const [pausePresetId, setPausePresetId] = useState<PausePresetId>(DEFAULT_PAUSE_PRESET_ID);
  const pauseOptions = useMemo(() => pauseOptionsFor(pausePresetId), [pausePresetId]);
  const cont = useContinuousDictation(onSegment ?? NOOP, pauseOptions);
  const [draft, setDraft] = useState("");
  const lastBlobRef = useRef<Blob | null>(null);

  // Una toma: al detener llega un Blob nuevo → transcribir LOCALMENTE una sola vez por grabación.
  useEffect(() => {
    if (!rec.blob || rec.blob === lastBlobRef.current) {
      return;
    }
    lastBlobRef.current = rec.blob;
    let active = true;
    void transcribeBlob(rec.blob).then((result) => {
      if (active && result?.transcript) {
        setDraft(result.transcript);
      }
    });
    return () => {
      active = false;
    };
  }, [rec.blob, transcribeBlob]);

  const busy = tx.status === "running";
  const recording = rec.status === "recording";
  const continuousActive = cont.status !== "idle";
  const pct = progressPercent(tx.progress);
  const hasOneShotActivity = recording || busy || rec.status === "stopped" || rec.error !== null;

  function startRecording() {
    setDraft("");
    tx.reset();
    rec.reset();
    lastBlobRef.current = null;
    void rec.start();
  }

  function dismiss() {
    setDraft("");
    tx.reset();
    rec.reset();
    lastBlobRef.current = null;
  }

  function insert() {
    const text = draft.trim();
    if (text) {
      onTranscript(text);
    }
    dismiss();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* ---- Una toma ---- */}
        {recording ? (
          <button
            type="button"
            onClick={rec.stop}
            className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20"
            aria-label="Detener la grabación"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" aria-hidden="true" />
            Detener · {formatDuration(rec.durationMs)}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled || !rec.supported || busy || continuousActive}
            className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--border2)] px-3 py-2 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
            aria-label="Grabar y transcribir la consulta en el dispositivo"
            title={
              rec.supported
                ? "Graba la consulta y transcríbela en tu dispositivo (el audio no sale de aquí)."
                : "Este navegador no permite grabar audio."
            }
          >
            🎙 {busy ? "Transcribiendo…" : "Grabar consulta"}
          </button>
        )}

        {/* ---- Continuo (envío por fragmentos al copiloto) ---- */}
        {onSegment &&
          (continuousActive ? (
            <button
              type="button"
              onClick={cont.stop}
              disabled={cont.status === "stopping"}
              className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:opacity-60"
              aria-label="Detener el dictado continuo"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" aria-hidden="true" />
              {cont.status === "stopping" ? "Deteniendo…" : `Detener dictado · ${formatDuration(cont.durationMs)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void cont.start()}
              disabled={disabled || !cont.supported || hasOneShotActivity}
              className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--border2)] px-3 py-2 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
              aria-label="Iniciar dictado continuo: cada pausa envía un fragmento al copiloto"
              title={
                cont.supported
                  ? "Graba sin parar; en cada pausa envía un fragmento al copiloto y sigue grabando."
                  : "Este navegador no permite el dictado continuo."
              }
            >
              🔴 Dictado continuo
            </button>
          ))}

        {onSegment && cont.supported && (
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--tx2)]">
            <span>Pausa:</span>
            <select
              value={pausePresetId}
              disabled={disabled || continuousActive}
              onChange={(event) => setPausePresetId(event.target.value as PausePresetId)}
              className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--tx)] disabled:opacity-50"
              aria-label="Sensibilidad de la pausa que cierra un fragmento"
              title="Cuánto silencio cierra un fragmento en el dictado continuo."
            >
              {PAUSE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!rec.supported && (
          <span className="text-xs text-[var(--warn)]">
            Este navegador no permite grabar audio del micrófono.
          </span>
        )}

        {hasOneShotActivity && !recording && (
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="rounded-[8px] border border-[var(--border2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--tx2)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
          >
            Descartar
          </button>
        )}
      </div>

      {/* ---- Estado del dictado continuo ---- */}
      {continuousActive && (
        <div className="flex flex-col gap-1 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] p-3 text-xs text-[var(--tx2)]" aria-live="polite">
          <p className="font-semibold text-[var(--tx)]">
            🔴 Dictado continuo activo · {cont.segmentCount} fragmento(s) enviado(s)
          </p>
          <p>
            {cont.transcribing
              ? "Transcribiendo el fragmento…"
              : `Escuchando… en cada pausa (~${(pauseOptions.silenceMs / 1000).toLocaleString("es")} s) se envía un fragmento al copiloto y la grabación continúa. Puedes escribir tu respuesta mientras tanto.`}
          </p>
          {cont.lastSegment && (
            <p className="mt-1 rounded-[8px] bg-[var(--panel)] p-2 text-[var(--tx)]">
              Último fragmento: “{cont.lastSegment}”
            </p>
          )}
        </div>
      )}
      {cont.error && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {cont.error}
        </p>
      )}

      {/* ---- Estado de la transcripción de una toma ---- */}
      {rec.error && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {rec.error}
        </p>
      )}

      {busy && (
        <div aria-live="polite" className="text-xs text-[var(--tx2)]">
          {progressMessage(tx.progress)}
          {pct !== null && (
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border2)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}

      {tx.status === "error" && (
        <p role="alert" className="text-xs text-[var(--danger)]">
          {tx.error}
        </p>
      )}

      {tx.status === "done" && tx.outcome && !tx.outcome.available && (
        <p role="alert" className="text-xs text-[var(--warn)]">
          {unavailableMessage(tx.outcome)}
        </p>
      )}

      {tx.status === "done" && tx.outcome?.available && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] p-3">
          <p className="text-xs text-[var(--tx2)]">
            🔒 Transcripción local (borrador no confiable: revísala antes de usarla).
          </p>
          <textarea
            aria-label="Transcripción (borrador editable)"
            className="min-h-24 w-full rounded-[8px] border border-[var(--border2)] bg-[var(--panel)] p-2 text-sm text-[var(--tx)]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={insert}
              disabled={!draft.trim()}
              className="rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Insertar en el mensaje
            </button>
            <button
              type="button"
              onClick={startRecording}
              className="rounded-[8px] border border-[var(--border2)] px-3 py-1.5 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--panel)]"
            >
              Regrabar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
