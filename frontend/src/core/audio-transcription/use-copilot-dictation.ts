"use client";

/*
 * useCopilotDictation — controlador de UN SOLO botón de grabación para el composer del copiloto,
 * fiel al diseño (MediCopilot.dc.html): un botón micrófono junto a "enviar" y un panel de grabación
 * en vivo con el toggle "Enviar al pausar".
 *
 * Unifica los dos modos previos en uno sobre el motor de dictado continuo LOCAL (Whisper en el
 * dispositivo; el audio NUNCA sale del navegador): cada PAUSA cierra un fragmento y se transcribe.
 *  - "Enviar al pausar" ACTIVADO  → el fragmento se ENVÍA al copiloto (onSegmentSend).
 *  - "Enviar al pausar" DESACTIVADO → el fragmento se ACUMULA en el cuadro de mensaje (onSegmentAppend),
 *    para que el médico lo revise y lo envíe al terminar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useContinuousDictation } from "@/core/audio-transcription/use-continuous-dictation";
import { usePausePreset } from "@/core/audio-transcription/pause-preference";
import { pauseOptionsFor } from "@/core/audio-transcription/vad";

export interface CopilotDictationController {
  supported: boolean;
  recording: boolean;
  stopping: boolean;
  toggleRecording: () => void;
  autoSend: boolean;
  setAutoSend: (value: boolean) => void;
  durationMs: number;
  segmentCount: number;
  transcribing: boolean;
  lastSegment: string | null;
  error: string | null;
  /** Segundos de silencio que cierran un fragmento (para el texto de ayuda). */
  pauseSeconds: number;
}

export function useCopilotDictation({
  onSegmentSend,
  onSegmentAppend,
}: {
  onSegmentSend: (text: string) => void;
  onSegmentAppend: (text: string) => void;
}): CopilotDictationController {
  const [autoSend, setAutoSend] = useState(true);
  // Refs para que el callback de pausa lea SIEMPRE el valor vigente sin recrear el motor. Se
  // actualizan en un efecto (no durante el render) para cumplir la regla de hooks; el desfase de un
  // render es inocuo (el toggle aplica en la próxima pausa).
  const autoSendRef = useRef(autoSend);
  const sendRef = useRef(onSegmentSend);
  const appendRef = useRef(onSegmentAppend);
  useEffect(() => {
    autoSendRef.current = autoSend;
    sendRef.current = onSegmentSend;
    appendRef.current = onSegmentAppend;
  });

  const [pausePresetId] = usePausePreset();
  const pauseOptions = useMemo(() => pauseOptionsFor(pausePresetId), [pausePresetId]);

  const handleSegment = useCallback((text: string) => {
    if (autoSendRef.current) {
      sendRef.current(text);
    } else {
      appendRef.current(text);
    }
  }, []);

  const cont = useContinuousDictation(handleSegment, pauseOptions);
  const recording = cont.status !== "idle";

  const toggleRecording = useCallback(() => {
    if (cont.status !== "idle") {
      cont.stop();
    } else {
      void cont.start();
    }
  }, [cont]);

  return {
    supported: cont.supported,
    recording,
    stopping: cont.status === "stopping",
    toggleRecording,
    autoSend,
    setAutoSend,
    durationMs: cont.durationMs,
    segmentCount: cont.segmentCount,
    transcribing: cont.transcribing,
    lastSegment: cont.lastSegment,
    error: cont.error,
    pauseSeconds: pauseOptions.silenceMs / 1000,
  };
}
