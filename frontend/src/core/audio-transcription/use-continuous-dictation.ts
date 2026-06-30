"use client";

// Hook de DICTADO CONTINUO para el copiloto: graba sin parar y, en cada PAUSA prolongada, cierra
// un fragmento, lo transcribe LOCALMENTE (Whisper en el dispositivo) y lo emite vía ``onSegment``
// — la grabación CONTINÚA hasta la siguiente pausa o hasta que el usuario detenga. El audio NUNCA
// sale del navegador.
//
// Mecánica: un AnalyserNode mide el nivel (RMS) del micrófono; el segmentador PURO (vad.ts) decide
// cuándo cortar. Al cortar se detiene el MediaRecorder (produce un Blob webm autónomo) y se
// reinicia de inmediato para el siguiente fragmento. Las transcripciones se ENCADENAN (una a la
// vez) para no lanzar varios workers en paralelo ni desordenar los fragmentos.

import { useCallback, useEffect, useRef, useState } from "react";

import { isRecordingSupported, pickRecordingMimeType } from "./recorder";
import { runRecordingTranscript } from "./runtime";
import {
  isLocalTranscriptionSupported,
  localTranscriptionEnabled,
} from "./support";
import {
  createSilenceSegmenter,
  DEFAULT_SEGMENTER_OPTIONS,
  rmsLevel,
  type SilenceSegmenterOptions,
} from "./vad";

export type ContinuousStatus = "idle" | "listening" | "stopping";

export interface UseContinuousDictation {
  status: ContinuousStatus;
  /** ¿El navegador soporta grabación + transcripción local (única vía; sin servidor)? */
  supported: boolean;
  /** Tiempo transcurrido de la sesión de dictado (ms). */
  durationMs: number;
  /** Fragmentos transcritos y emitidos en esta sesión. */
  segmentCount: number;
  /** Texto del último fragmento emitido (feedback en la UI). */
  lastSegment: string | null;
  /** True mientras se transcribe un fragmento recién cortado. */
  transcribing: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

const TICK_MS = 100;

export function useContinuousDictation(
  onSegment: (text: string) => void,
  options: SilenceSegmenterOptions = DEFAULT_SEGMENTER_OPTIONS,
): UseContinuousDictation {
  const [status, setStatus] = useState<ContinuousStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [lastSegment, setLastSegment] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSegmentRef = useRef(onSegment);
  useEffect(() => {
    onSegmentRef.current = onSegment;
  }, [onSegment]);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const transcribeChainRef = useRef<Promise<void>>(Promise.resolve());

  const supported =
    isRecordingSupported() && isLocalTranscriptionSupported() && localTranscriptionEnabled();

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    sampleBufRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Transcribe un fragmento (encadenado) y lo emite si tiene texto. Nunca fabrica texto.
  const enqueueTranscription = useCallback((blob: Blob) => {
    transcribeChainRef.current = transcribeChainRef.current.then(async () => {
      setTranscribing(true);
      try {
        const outcome = await runRecordingTranscript(blob);
        const text = outcome.available ? (outcome.transcript ?? "").trim() : "";
        if (text) {
          setLastSegment(text);
          setSegmentCount((count) => count + 1);
          onSegmentRef.current(text);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al transcribir un fragmento.");
      } finally {
        setTranscribing(false);
      }
    });
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Este navegador no permite el dictado continuo (grabación + transcripción local).");
      return;
    }
    setError(null);
    setSegmentCount(0);
    setLastSegment(null);
    setDurationMs(0);
    stoppingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtor =
        typeof AudioContext !== "undefined"
          ? AudioContext
          : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        throw new Error("La Web Audio API no está disponible.");
      }
      const audioCtx = new AudioCtor();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // No se conecta al destino: evita realimentación/eco.
      analyserRef.current = analyser;
      sampleBufRef.current = new Float32Array(analyser.fftSize);

      const segmenter = createSilenceSegmenter(options);
      const mimeType = pickRecordingMimeType();

      const startSegment = () => {
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
          const blob = new Blob(chunksRef.current, { type });
          chunksRef.current = [];
          const isFinal = stoppingRef.current;
          if (!isFinal) {
            startSegment(); // reinicia para el siguiente fragmento ANTES de transcribir
          }
          enqueueTranscription(blob);
          if (isFinal) {
            cleanup();
            setStatus("idle");
          }
        };
        recorderRef.current = recorder;
        recorder.start();
      };

      startSegment();
      startedAtRef.current = Date.now();
      setStatus("listening");

      tickRef.current = setInterval(() => {
        const buf = sampleBufRef.current;
        const node = analyserRef.current;
        if (!buf || !node) {
          return;
        }
        node.getFloatTimeDomainData(buf);
        const level = rmsLevel(buf);
        setDurationMs(Date.now() - startedAtRef.current);
        const cut = segmenter.push(level, Date.now());
        if (cut && recorderRef.current?.state === "recording") {
          stoppingRef.current = false;
          recorderRef.current.stop(); // onstop transcribe y reinicia el siguiente fragmento
        }
      }, TICK_MS);
    } catch (err) {
      cleanup();
      setStatus("idle");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permiso de micrófono denegado. Habilítalo en el navegador para el dictado."
          : "No se pudo iniciar el dictado continuo.",
      );
    }
  }, [supported, options, cleanup, enqueueTranscription]);

  const stop = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    stoppingRef.current = true;
    setStatus("stopping");
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop(); // onstop transcribe el último fragmento y limpia
    } else {
      cleanup();
      setStatus("idle");
    }
  }, [cleanup]);

  // Al desmontar: cortar todo y liberar el micrófono.
  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    supported,
    durationMs,
    segmentCount,
    lastSegment,
    transcribing,
    error,
    start,
    stop,
  };
}
