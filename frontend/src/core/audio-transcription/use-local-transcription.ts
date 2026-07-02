"use client";

// Hook de UI para transcribir un documento de audio. Encapsula el estado (progreso, resultado,
// error) y delega en ``runAudioTranscript`` (navegador-local por defecto, servidor de respaldo).

import { useCallback, useEffect, useRef, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import { preloadModel, runAudioTranscript } from "./runtime";
import {
  defaultWhisperModel,
  isLocalTranscriptionSupported,
  isWebGpuAvailable,
  localTranscriptionEnabled,
} from "./support";
import type { TranscriptionOutcome, TranscriptionProgress, WhisperModel } from "./types";

export type TranscriptionStatus = "idle" | "running" | "preloading" | "done" | "error";

export interface UseLocalTranscription {
  status: TranscriptionStatus;
  progress: TranscriptionProgress | null;
  outcome: TranscriptionOutcome | null;
  error: string | null;
  /** Modelos precargados EN ESTA SESIÓN (su siguiente corrida es instantánea). Por-modelo:
   *  precargar 'base' no marca 'tiny' como listo. */
  preloadedModels: ReadonlySet<WhisperModel>;
  /** Soporte de navegador-local (worker + Web Audio). */
  localSupported: boolean;
  /** WebGPU disponible (informativo; si no, se usa WASM). */
  webgpu: boolean;
  /** Config: ¿el navegador-local está habilitado por defecto? */
  localEnabled: boolean;
  transcribe: (
    documentId: string,
    options?: { model?: WhisperModel; forceServer?: boolean },
  ) => Promise<TranscriptionOutcome | null>;
  preload: (model?: WhisperModel) => Promise<void>;
  reset: () => void;
}

export function useLocalTranscription(): UseLocalTranscription {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [outcome, setOutcome] = useState<TranscriptionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preloadedModels, setPreloadedModels] = useState<ReadonlySet<WhisperModel>>(new Set());
  const runningRef = useRef(false);

  // Detección de soporte tras el montaje: en SSR no hay window/Worker, así que calcularla
  // durante el render produce HTML distinto entre servidor y cliente (hydration mismatch).
  const [localSupported, setLocalSupported] = useState(false);
  const [webgpu, setWebgpu] = useState(false);
  useEffect(() => {
    setLocalSupported(isLocalTranscriptionSupported());
    setWebgpu(isWebGpuAvailable());
  }, []);

  const transcribe = useCallback(
    async (documentId: string, options?: { model?: WhisperModel; forceServer?: boolean }) => {
      if (runningRef.current) {
        return null;
      }
      runningRef.current = true;
      setStatus("running");
      setProgress(null);
      setError(null);
      setOutcome(null);
      try {
        const result = await runAudioTranscript(
          documentId,
          { api: (path: string) => browserApi(path) },
          {
            model: options?.model ?? defaultWhisperModel(),
            forceServer: options?.forceServer,
            onProgress: setProgress,
          },
        );
        setOutcome(result);
        setStatus("done");
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al transcribir el audio.");
        setStatus("error");
        return null;
      } finally {
        runningRef.current = false;
      }
    },
    [],
  );

  const preload = useCallback(async (model?: WhisperModel) => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setStatus("preloading");
    setProgress(null);
    setError(null);
    try {
      const effective = model ?? defaultWhisperModel();
      const ok = await preloadModel(effective, setProgress);
      if (ok) {
        setPreloadedModels((prev) => new Set(prev).add(effective));
      }
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al precargar el modelo.");
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress(null);
    setOutcome(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    outcome,
    error,
    preloadedModels,
    localSupported,
    webgpu,
    localEnabled: localTranscriptionEnabled(),
    transcribe,
    preload,
    reset,
  };
}
