import test from "node:test";
import assert from "node:assert/strict";

import { resolveAudioTranscript, LOCAL_PRIVACY_NOTE } from "./transcribe.ts";
import {
  isLocalTranscriptionSupported,
  localTranscriptionEnabled,
  defaultWhisperModel,
} from "./support.ts";
import { buildClinicalActionPlan } from "../agent/approval-protocol.ts";
import { getTool } from "../agent/tools/registry.ts";
import type { TranscriptionOutcome } from "./types.ts";

// F-MEDIOS fase 2b: transcripción de audio EN EL NAVEGADOR por defecto, con respaldo al proveedor
// del servidor. La inferencia real de Whisper + descarga del modelo se verifica MANUALMENTE en un
// navegador real (fuera del alcance headless, como el turno LLM en vivo): aquí se prueba la
// ORQUESTACIÓN con el transcriptor local mockeado.

const SERVER_OUTCOME: TranscriptionOutcome = {
  available: true,
  transcript: "texto del servidor",
  source: "server",
  provider: "stub",
  notes: null,
};

function baseDeps(over: Partial<Parameters<typeof resolveAudioTranscript>[0]> = {}) {
  return {
    preferLocal: true,
    localSupported: () => true,
    runLocal: async () => ({ text: "texto local", model: "Xenova/whisper-base" }),
    runServer: async () => SERVER_OUTCOME,
    ...over,
  };
}

test("por defecto transcribe local cuando hay soporte; no toca el servidor", async () => {
  let serverCalled = false;
  const result = await resolveAudioTranscript(
    baseDeps({ runServer: async () => { serverCalled = true; return SERVER_OUTCOME; } }),
  );
  assert.equal(result.source, "browser-local");
  assert.equal(result.transcript, "texto local");
  assert.equal(result.model, "Xenova/whisper-base");
  assert.equal(result.available, true);
  assert.equal(result.notes, LOCAL_PRIVACY_NOTE); // deja claro que el audio no salió del dispositivo
  assert.equal(serverCalled, false);
});

test("si el local FALLA (p. ej. worker no disponible), cae al proveedor del servidor", async () => {
  const result = await resolveAudioTranscript(
    baseDeps({
      runLocal: async () => {
        throw new Error("worker no disponible");
      },
    }),
  );
  assert.deepEqual(result, SERVER_OUTCOME); // respuesta del servidor tal cual
});

test("si el navegador no soporta local, va directo al servidor (sin intentar local)", async () => {
  let localCalled = false;
  const result = await resolveAudioTranscript(
    baseDeps({
      localSupported: () => false,
      runLocal: async () => { localCalled = true; return { text: "x", model: "m" }; },
    }),
  );
  assert.equal(localCalled, false);
  assert.equal(result.source, "server");
});

test("si el local está deshabilitado por config, usa el servidor aunque haya soporte", async () => {
  const result = await resolveAudioTranscript(baseDeps({ preferLocal: false }));
  assert.equal(result.source, "server");
});

test("el servidor puede responder 'no disponible' y se entrega tal cual (sin fabricar)", async () => {
  const noDisponible: TranscriptionOutcome = {
    available: false, transcript: null, source: null, provider: null, notes: "no disponible",
  };
  const result = await resolveAudioTranscript(
    baseDeps({ preferLocal: false, runServer: async () => noDisponible }),
  );
  assert.deepEqual(result, noDisponible);
});

test("soporte: en node (sin window) NO hay transcripción local; config habilitada por defecto", () => {
  assert.equal(isLocalTranscriptionSupported(), false);
  assert.equal(localTranscriptionEnabled(), true);
  assert.equal(defaultWhisperModel(), "Xenova/whisper-base");
});

test("cableado audio->nota: el texto local alimenta create_consultation_draft (P1, congelado)", () => {
  const text = "Cefalea de tres días (transcrito localmente)";
  const tool = getTool("clinical.create_consultation_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  const plan = buildClinicalActionPlan(tool, {
    patient_id: "11111111-1111-1111-1111-111111111111",
    attending_doctor_id: "22222222-2222-2222-2222-222222222222",
    reason_for_visit: text,
  });
  assert.equal(plan.actionType, "create_consultation_draft");
  assert.equal(plan.exactPayload.reason_for_visit, text);
  assert.ok(Object.isFrozen(plan.exactPayload)); // borrador inmutable que el médico aprueba
});
