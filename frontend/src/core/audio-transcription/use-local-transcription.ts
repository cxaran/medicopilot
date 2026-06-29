"use client";

// Hook de UI para transcribir un documento de audio. Encapsula el estado (progreso, resultado,
// error) y delega en ``runAudioTranscript`` (navegador-local por defecto, servidor de respaldo).

import { useCallback, useRef, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import { runAudioTranscript } from "./runtime";
import {
  defaultWhisperModel,
  isLocalTranscriptionSupported,
  isWebGpuAvailable,
  localTranscriptionEnabled,
} from "./support";
import type { TranscriptionOutcome, TranscriptionProgress, WhisperModel } from "./types";

export type TranscriptionStatus = "idle" | "running" | "done" | "error";

export interface UseLocalTranscription {
  status: TranscriptionStatus;
  progress: TranscriptionProgress | null;
  outcome: TranscriptionOutcome | null;
  error: string | null;
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
  reset: () => void;
}

export function useLocalTranscription(): UseLocalTranscription {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [outcome, setOutcome] = useState<TranscriptionOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

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
    localSupported: isLocalTranscriptionSupported(),
    webgpu: isWebGpuAvailable(),
    localEnabled: localTranscriptionEnabled(),
    transcribe,
    reset,
  };
}
