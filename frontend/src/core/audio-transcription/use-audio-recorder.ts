"use client";

// Hook de captura de audio del micrófono (MediaRecorder + getUserMedia) para el dictado del
// copiloto. Mantiene el estado de grabación, el cronómetro y el Blob resultante. El Blob se
// transcribe LOCALMENTE (Whisper en el dispositivo); el audio NUNCA sale del navegador.
//
// La lógica pura (selección de contenedor, soporte, formato de duración) vive en recorder.ts.

import { useCallback, useEffect, useRef, useState } from "react";

import { isRecordingSupported, pickRecordingMimeType, type RecorderStatus } from "./recorder";

export interface UseAudioRecorder {
  status: RecorderStatus;
  /** ¿El navegador permite grabar del micrófono? */
  supported: boolean;
  /** Duración transcurrida de la grabación en curso (ms). */
  durationMs: number;
  /** Audio capturado tras detener; null mientras se graba o antes de la primera grabación. */
  blob: Blob | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAudioRecorder(): UseAudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!isRecordingSupported()) {
      setError("Este navegador no permite grabar audio del micrófono.");
      return;
    }
    setError(null);
    setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        setBlob(new Blob(chunksRef.current, { type }));
        cleanupStream();
        setStatus("stopped");
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setDurationMs(0);
      setStatus("recording");
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 250);
    } catch (err) {
      cleanupStream();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Habilítalo en el navegador para grabar."
          : "No se pudo iniciar la grabación de audio.",
      );
      setStatus("idle");
    }
  }, [cleanupStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setError(null);
    setDurationMs(0);
    setStatus("idle");
  }, []);

  // Al desmontar: detener cualquier grabación viva y liberar el micrófono.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    status,
    supported: isRecordingSupported(),
    durationMs,
    blob,
    error,
    start,
    stop,
    reset,
  };
}
