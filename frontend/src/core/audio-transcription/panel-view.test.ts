import test from "node:test";
import assert from "node:assert/strict";

import {
  CACHE_HINT,
  MODEL_LABELS,
  PRIVACY_BANNER,
  WHISPER_LANGUAGE,
  accelerationNote,
  progressMessage,
  progressPercent,
  shouldShowAudioTranscription,
  sourceMessage,
  unavailableMessage,
  unsupportedNote,
} from "./panel-view.ts";
import type { TranscriptionOutcome } from "./types.ts";

// F-MEDIOS fase 2c: el panel de transcripción local se monta en el detalle de un ClinicalDocument
// de audio. Aquí se prueba la LÓGICA pura de presentación (qué muestra y cuándo); la inferencia
// real de Whisper se valida MANUALMENTE en un navegador real (fuera del alcance headless).

test("se monta SÓLO para un ClinicalDocument de audio", () => {
  assert.equal(shouldShowAudioTranscription("clinical_documents", { document_type: "audio" }), true);
  // Otro tipo de documento: no se monta.
  assert.equal(shouldShowAudioTranscription("clinical_documents", { document_type: "pdf" }), false);
  // Otro recurso: no se monta.
  assert.equal(shouldShowAudioTranscription("patients", { document_type: "audio" }), false);
  // Sin detalle: no se monta.
  assert.equal(shouldShowAudioTranscription("clinical_documents", null), false);
});

test("progreso: porcentaje sólo en descarga, acotado 0..100", () => {
  assert.equal(progressPercent({ stage: "download", progress: 42.6 }), 43);
  assert.equal(progressPercent({ stage: "download", progress: 250 }), 100);
  assert.equal(progressPercent({ stage: "download", progress: -5 }), 0);
  assert.equal(progressPercent({ stage: "transcribe" }), null);
  assert.equal(progressPercent(null), null);
});

test("progreso: mensaje según etapa", () => {
  assert.match(progressMessage({ stage: "download", progress: 30 }), /Descargando el modelo \(30%\)/);
  assert.match(progressMessage({ stage: "download" }), /Descargando el modelo…/);
  assert.match(progressMessage({ stage: "transcribe" }), /Transcribiendo el audio…/);
  assert.match(progressMessage(null), /Preparando…/);
});

test("fuente: navegador local deja claro que el audio no salió del dispositivo", () => {
  const local: TranscriptionOutcome = {
    available: true, transcript: "x", source: "browser-local", model: "Xenova/whisper-base",
  };
  assert.match(sourceMessage(local), /navegador local/i);
  assert.match(sourceMessage(local), /no salió del dispositivo/i);
  const server: TranscriptionOutcome = {
    available: true, transcript: "x", source: "server", provider: "stub",
  };
  assert.match(sourceMessage(server), /proveedor del servidor/i);
  assert.match(sourceMessage(server), /stub/);
});

test("aviso de no soportado / deshabilitado, o null cuando sí está disponible", () => {
  assert.equal(unsupportedNote(true, true), null);
  assert.match(unsupportedNote(false, true) ?? "", /no soporta la transcripción local/i);
  assert.match(unsupportedNote(true, false) ?? "", /deshabilitada por configuración/i);
});

test("aviso de aceleración: WebGPU vs WASM (null si no hay soporte local)", () => {
  assert.match(accelerationNote(true, true) ?? "", /WebGPU/);
  assert.match(accelerationNote(true, false) ?? "", /WASM/);
  assert.equal(accelerationNote(false, false), null);
});

test("no disponible: mensaje sin fabricar texto", () => {
  const outcome: TranscriptionOutcome = {
    available: false, transcript: null, source: null, notes: "no hay proveedor",
  };
  assert.match(unavailableMessage(outcome), /no disponible/i);
  assert.match(unavailableMessage(outcome), /No se inventa texto/i);
});

test("textos fijos en español, no vacíos; idioma Whisper = spanish", () => {
  for (const text of [PRIVACY_BANNER, CACHE_HINT]) {
    assert.ok(text.trim().length > 0);
  }
  assert.match(PRIVACY_BANNER, /audio no se envía a terceros/i);
  assert.equal(WHISPER_LANGUAGE, "spanish");
  assert.ok(MODEL_LABELS["Xenova/whisper-base"].length > 0);
  assert.ok(MODEL_LABELS["Xenova/whisper-tiny"].length > 0);
});
