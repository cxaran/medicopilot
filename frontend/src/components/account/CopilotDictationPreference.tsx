"use client";

import { usePausePreset } from "@/core/audio-transcription/pause-preference";
import { PAUSE_PRESETS, type PausePresetId } from "@/core/audio-transcription/vad";

/**
 * Preferencia del DICTADO CONTINUO del copiloto: cuánto silencio cierra un fragmento. Se movió aquí
 * desde el chat (antes era un control efímero junto al botón de dictado). Es una preferencia de ESTE
 * dispositivo: se guarda en el navegador, no en tu cuenta, porque depende del micrófono y el entorno
 * de cada equipo. El dictado transcribe localmente y el audio nunca sale del dispositivo.
 */
export function CopilotDictationPreference() {
  const [pausePreset, setPausePreset] = usePausePreset();

  return (
    <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <p className="text-sm font-semibold text-[var(--tx)]">Dictado por voz (este dispositivo)</p>
      <p className="text-sm text-[var(--tx2)]">
        En el dictado continuo, cada pausa prolongada cierra un fragmento y lo envía al copiloto.
        Ajusta cuánto silencio hace falta para cerrar el fragmento.
      </p>
      <label className="inline-flex items-center gap-2 pt-1 text-sm">
        <span className="font-medium text-[var(--tx)]">Pausa</span>
        <select
          value={pausePreset}
          onChange={(event) => setPausePreset(event.target.value as PausePresetId)}
          className="rounded-[8px] border border-[var(--border2)] bg-[var(--bg2)] px-2 py-1.5 text-sm text-[var(--tx)]"
          aria-label="Sensibilidad de la pausa que cierra un fragmento en el dictado continuo"
        >
          {PAUSE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
