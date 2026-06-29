import test from "node:test";
import assert from "node:assert/strict";

import {
  messagesToTranscript,
  selectUnpersisted,
  toMessagePayload,
  type PersistedMessageRow,
  type TranscriptMessage,
} from "./chat-persistence.ts";

// PERSISTENCIA DEL HILO (MP-CTRL-0123): mapeo PURO entre el transcript del CopilotPanel y los
// mensajes persistidos. Sólo se persiste/restaura la conversación visible (user/assistant); las
// capas de sistema y las tool calls no. El orden lo fija el backend con ``sequence_index``.

test("messagesToTranscript: ordena por sequence_index y conserva user/assistant", () => {
  const rows: PersistedMessageRow[] = [
    { id: "b", conversation_id: "c", role: "assistant", content: "Respuesta", sequence_index: 1 },
    { id: "a", conversation_id: "c", role: "user", content: "Pregunta", sequence_index: 0 },
  ];
  const out = messagesToTranscript(rows);
  assert.deepEqual(
    out.map((m) => ({ id: m.id, role: m.role, text: m.text })),
    [
      { id: "a", role: "user", text: "Pregunta" },
      { id: "b", role: "assistant", text: "Respuesta" },
    ],
  );
});

test("messagesToTranscript: descarta roles no visibles (system/tool)", () => {
  const rows: PersistedMessageRow[] = [
    { id: "s", conversation_id: "c", role: "system", content: "ctx", sequence_index: 0 },
    { id: "u", conversation_id: "c", role: "user", content: "hola", sequence_index: 1 },
    { id: "t", conversation_id: "c", role: "tool", content: "{}", sequence_index: 2 },
  ];
  assert.deepEqual(
    messagesToTranscript(rows).map((m) => m.id),
    ["u"],
  );
});

test("messagesToTranscript: restaura reasoning/isError desde el payload", () => {
  const rows: PersistedMessageRow[] = [
    {
      id: "a",
      conversation_id: "c",
      role: "assistant",
      content: "texto",
      sequence_index: 0,
      payload: { reasoning: "porque sí", is_error: true },
    },
  ];
  const [message] = messagesToTranscript(rows);
  assert.equal(message.reasoning, "porque sí");
  assert.equal(message.isError, true);
});

test("selectUnpersisted: devuelve sólo los nuevos con texto, preservando el orden", () => {
  const messages: TranscriptMessage[] = [
    { id: "a", role: "user", text: "ya guardado" },
    { id: "b", role: "assistant", text: "nuevo" },
    { id: "c", role: "user", text: "   " }, // vacío -> se descarta
    { id: "d", role: "user", text: "otro nuevo" },
  ];
  const out = selectUnpersisted(messages, new Set(["a"]));
  assert.deepEqual(
    out.map((m) => m.id),
    ["b", "d"],
  );
});

test("selectUnpersisted: nada nuevo cuando todo está persistido", () => {
  const messages: TranscriptMessage[] = [{ id: "a", role: "user", text: "hola" }];
  assert.deepEqual(selectUnpersisted(messages, new Set(["a"])), []);
});

test("toMessagePayload: arma el cuerpo y omite payload sin metadatos", () => {
  const payload = toMessagePayload("conv-1", { id: "m1", role: "user", text: "hola" });
  assert.deepEqual(payload, { conversation_id: "conv-1", role: "user", content: "hola" });
});

test("toMessagePayload: incluye reasoning/is_error en el payload cuando existen", () => {
  const payload = toMessagePayload("conv-1", {
    id: "m2",
    role: "assistant",
    text: "resp",
    reasoning: "porque",
    isError: true,
  });
  assert.deepEqual(payload.payload, { is_error: true, reasoning: "porque" });
});
