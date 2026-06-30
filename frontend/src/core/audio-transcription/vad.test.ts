import test from "node:test";
import assert from "node:assert/strict";

import {
  createSilenceSegmenter,
  DEFAULT_PAUSE_PRESET_ID,
  DEFAULT_SEGMENTER_OPTIONS,
  PAUSE_PRESETS,
  pauseOptionsFor,
  rmsLevel,
} from "./vad.ts";

// Lógica PURA de segmentación por pausa del dictado continuo. La captura real (Web Audio API /
// MediaRecorder) se valida en navegador; aquí se prueba el corte por silencio inyectando niveles.

const OPTS = { silenceThreshold: 0.02, silenceMs: 2000, minSpeechMs: 400 };

test("corta tras voz suficiente seguida de silencio sostenido", () => {
  const seg = createSilenceSegmenter(OPTS);
  // Voz de 0 a 600 ms (cada 100 ms).
  for (let t = 0; t <= 600; t += 100) {
    assert.equal(seg.push(0.2, t), false);
  }
  // Silencio: aún no se cumplen los 2000 ms.
  assert.equal(seg.push(0.0, 700), false);
  assert.equal(seg.push(0.0, 2000), false);
  // A los 2600 ms (2000 ms de silencio desde 700) → corta exactamente una vez.
  assert.equal(seg.push(0.0, 2700), true);
});

test("no corta si la voz acumulada no llega al mínimo", () => {
  const seg = createSilenceSegmenter(OPTS);
  // Solo 200 ms de voz (< 400 ms).
  seg.push(0.2, 0);
  seg.push(0.2, 200);
  // Silencio largo: no debe cortar (no hubo voz suficiente).
  assert.equal(seg.push(0.0, 300), false);
  assert.equal(seg.push(0.0, 3000), false);
});

test("tras un corte no vuelve a cortar en el mismo silencio largo sin nueva voz", () => {
  const seg = createSilenceSegmenter(OPTS);
  for (let t = 0; t <= 600; t += 100) {
    seg.push(0.2, t);
  }
  // El silencio empieza a muestrearse en 700 (como el tick real cada 100 ms).
  seg.push(0.0, 700);
  // Primer corte a los 2000 ms de silencio (700 → 2700).
  assert.equal(seg.push(0.0, 2700), true);
  // Silencio continúa indefinidamente: NO debe cortar de nuevo.
  assert.equal(seg.push(0.0, 5000), false);
  assert.equal(seg.push(0.0, 9000), false);
  // Nueva voz + nuevo silencio sostenido → corta otra vez.
  for (let t = 9100; t <= 9700; t += 100) {
    seg.push(0.2, t);
  }
  seg.push(0.0, 9800);
  assert.equal(seg.push(0.0, 11800), true);
});

test("hasPendingSpeech refleja si hay voz suficiente para el fragmento final", () => {
  const seg = createSilenceSegmenter(OPTS);
  assert.equal(seg.hasPendingSpeech(), false);
  seg.push(0.2, 0);
  seg.push(0.2, 500);
  assert.equal(seg.hasPendingSpeech(), true);
});

test("presets de pausa: ids únicos, 'medium' por defecto = opciones default, orden de silenceMs", () => {
  const ids = PAUSE_PRESETS.map((preset) => preset.id);
  assert.deepEqual([...new Set(ids)], ids, "los ids de preset deben ser únicos");
  assert.equal(DEFAULT_PAUSE_PRESET_ID, "medium");
  assert.equal(pauseOptionsFor("medium").silenceMs, DEFAULT_SEGMENTER_OPTIONS.silenceMs);
  assert.ok(pauseOptionsFor("short").silenceMs < pauseOptionsFor("medium").silenceMs);
  assert.ok(pauseOptionsFor("long").silenceMs > pauseOptionsFor("medium").silenceMs);
  // Id inválido cae al default (defensa).
  assert.equal(pauseOptionsFor("xxx" as never).silenceMs, DEFAULT_SEGMENTER_OPTIONS.silenceMs);
});

test("rmsLevel: 0 para ventana vacía o de silencio; positivo con señal", () => {
  assert.equal(rmsLevel(new Float32Array(0)), 0);
  assert.equal(rmsLevel(new Float32Array([0, 0, 0, 0])), 0);
  const level = rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]));
  assert.ok(Math.abs(level - 0.5) < 1e-9, `rms esperado 0.5, obtenido ${level}`);
});
