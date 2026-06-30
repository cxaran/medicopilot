import test from "node:test";
import assert from "node:assert/strict";

import { formatDuration, isRecordingSupported, pickRecordingMimeType } from "./recorder.ts";

// Lógica PURA del grabador de audio del copiloto. La captura real (MediaRecorder/getUserMedia) se
// valida MANUALMENTE en un navegador (fuera del alcance headless); aquí se prueba la selección de
// contenedor, el formato de duración y la guarda de soporte en node.

test("pickRecordingMimeType: prefiere opus en webm cuando está soportado", () => {
  const onlyOpus = (type: string) => type === "audio/webm;codecs=opus";
  assert.equal(pickRecordingMimeType(onlyOpus), "audio/webm;codecs=opus");
});

test("pickRecordingMimeType: cae al siguiente candidato soportado", () => {
  // Safari típico: sin webm/ogg, sí mp4.
  const onlyMp4 = (type: string) => type === "audio/mp4";
  assert.equal(pickRecordingMimeType(onlyMp4), "audio/mp4");
});

test("pickRecordingMimeType: '' cuando ningún candidato está soportado (default del navegador)", () => {
  assert.equal(
    pickRecordingMimeType(() => false),
    "",
  );
});

test("formatDuration: mm:ss con padding y acotado a 0", () => {
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(5_000), "00:05");
  assert.equal(formatDuration(65_000), "01:05");
  assert.equal(formatDuration(600_000), "10:00");
  // Negativo (reloj defensivo) -> 00:00.
  assert.equal(formatDuration(-1_000), "00:00");
});

test("isRecordingSupported: false en node (sin navigator/MediaRecorder)", () => {
  assert.equal(isRecordingSupported(), false);
});
