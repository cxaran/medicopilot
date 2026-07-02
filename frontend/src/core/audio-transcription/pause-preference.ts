"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_PAUSE_PRESET_ID, PAUSE_PRESETS, type PausePresetId } from "./vad";

// Preferencia del DICTADO CONTINUO: qué preset de pausa cierra un fragmento. Se guarda en el
// navegador (localStorage), NO en la cuenta del usuario, porque depende del micrófono y el entorno
// de ESTE dispositivo; además el dictado transcribe localmente y nada sale del equipo. El control
// vive en "Mi cuenta → personalización del copiloto"; el chat solo la consume.

const STORAGE_KEY = "medicopilot.copilot.dictation.pausePreset";

function isPausePresetId(value: string | null): value is PausePresetId {
  return value !== null && PAUSE_PRESETS.some((preset) => preset.id === value);
}

/** Lee la preferencia persistida (cae al default si no hay valor válido o no hay almacenamiento). */
export function loadPausePreset(): PausePresetId {
  if (typeof window === "undefined") {
    return DEFAULT_PAUSE_PRESET_ID;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isPausePresetId(raw) ? raw : DEFAULT_PAUSE_PRESET_ID;
  } catch {
    return DEFAULT_PAUSE_PRESET_ID;
  }
}

/** Persiste la preferencia y avisa a los componentes montados de ESTA pestaña. */
export function savePausePreset(id: PausePresetId): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    // El evento 'storage' nativo solo llega a OTRAS pestañas; lo emitimos a mano para que el chat
    // y la pantalla de cuenta abiertos en esta misma pestaña reflejen el cambio al instante.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: id }));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota): la preferencia queda en memoria.
  }
}

/** Suscribe a cambios de la preferencia (evento 'storage': otra pestaña o ``savePausePreset``). */
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * Hook de la preferencia de pausa. Usa ``useSyncExternalStore`` para leer localStorage como store
 * externo: el snapshot del servidor es el default (sin desajuste de hidratación) y cualquier cambio
 * (otra pestaña o esta misma vía ``savePausePreset``) re-renderiza. ``update`` solo persiste; el
 * re-render llega por la suscripción.
 */
export function usePausePreset(): readonly [PausePresetId, (id: PausePresetId) => void] {
  const preset = useSyncExternalStore(
    subscribe,
    loadPausePreset,
    () => DEFAULT_PAUSE_PRESET_ID,
  );
  const update = useCallback((id: PausePresetId) => savePausePreset(id), []);
  return [preset, update] as const;
}
