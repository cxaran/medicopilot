import test from "node:test";
import assert from "node:assert/strict";

import {
  approvedPlanNotesOf,
  MAX_UI_SPECS_PER_MESSAGE,
  messagesToTranscript,
  selectUnpersisted,
  toMessagePayload,
  UI_PAYLOAD_VERSION,
  type PersistedMessageRow,
  type TranscriptMessage,
} from "./chat-persistence.ts";
import type { UiSpec } from "@/core/agent/tools/ui-spec";

// PERSISTENCIA DEL HILO (MP-CTRL-0123): mapeo PURO entre el transcript del CopilotPanel y los
// mensajes persistidos. Sólo se persiste/restaura la conversación visible (user/assistant); las
// capas de sistema y las tool calls no. El orden lo fija el backend con ``sequence_index``.

test("nota de contexto: round-trip (kind 'note' -> payload.note -> kind 'note')", () => {
  const note: TranscriptMessage = {
    id: "n1",
    role: "user",
    text: "📝 Creó Cita — Fecha: 2026-07-01",
    kind: "note",
  };
  const payload = toMessagePayload("conv-1", note);
  // Se persiste como rol "user" (acción del médico) con el metadato note=true.
  assert.equal(payload.role, "user");
  assert.deepEqual(payload.payload, { note: true });

  const restored = messagesToTranscript([
    {
      id: note.id,
      conversation_id: "conv-1",
      role: payload.role,
      content: payload.content,
      sequence_index: 0,
      payload: payload.payload,
    },
  ]);
  assert.equal(restored[0]?.kind, "note");
});

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

// ----- UI generativa persistente (payload.ui versionado + restauración gobernada) -----

const FORM_SPEC: UiSpec = {
  kind: "resource_form",
  resource: "appointments",
  mode: "create",
  values: { scheduled_date: "2026-07-10" },
};

const TASK_PLAN_SPEC: UiSpec = {
  kind: "task_plan",
  tasks: [],
} as unknown as UiSpec;

test("uiSpec inyectado (kind 'ui'): round-trip por payload.ui y restauración como mensaje 'ui'", () => {
  const injected: TranscriptMessage = {
    id: "f1",
    role: "assistant",
    text: "",
    kind: "ui",
    uiSpec: FORM_SPEC,
  };
  // Portador de spec con texto vacío: SÍ se selecciona para persistir (el spec es el contenido).
  assert.deepEqual(selectUnpersisted([injected], new Set()), [injected]);

  const payload = toMessagePayload("conv-1", injected);
  assert.deepEqual(payload.payload, {
    ui: { version: UI_PAYLOAD_VERSION, specs: [FORM_SPEC] },
  });

  const restored = messagesToTranscript([
    {
      id: "row-1",
      conversation_id: "conv-1",
      role: "assistant",
      content: "",
      sequence_index: 0,
      payload: payload.payload,
    },
  ]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].kind, "ui");
  assert.equal(restored[0].id, "row-1:ui:0");
  assert.deepEqual(restored[0].uiSpec, FORM_SPEC);
});

test("uiSpecs anclados al mensaje del asistente: se restauran ANTES del texto, en orden", () => {
  const anchor: TranscriptMessage = {
    id: "a1",
    role: "assistant",
    text: "Aquí está el plan.",
    uiSpecs: [TASK_PLAN_SPEC, FORM_SPEC],
  };
  const payload = toMessagePayload("conv-1", anchor);
  const restored = messagesToTranscript([
    {
      id: "row-2",
      conversation_id: "conv-1",
      role: "assistant",
      content: payload.content,
      sequence_index: 0,
      payload: payload.payload,
    },
  ]);
  assert.deepEqual(
    restored.map((m) => ({ id: m.id, kind: m.kind ?? null, text: m.text })),
    [
      { id: "row-2:ui:0", kind: "ui", text: "" },
      { id: "row-2:ui:1", kind: "ui", text: "" },
      { id: "row-2", kind: null, text: "Aquí está el plan." },
    ],
  );
});

test("restauración GOBERNADA: sobre con versión desconocida o specs inválidos se descarta", () => {
  const rows: PersistedMessageRow[] = [
    {
      id: "v9",
      conversation_id: "c",
      role: "assistant",
      content: "texto con sobre viejo",
      sequence_index: 0,
      payload: { ui: { version: 99, specs: [FORM_SPEC] } },
    },
    {
      id: "bad",
      conversation_id: "c",
      role: "assistant",
      content: "",
      sequence_index: 1,
      payload: {
        ui: {
          version: UI_PAYLOAD_VERSION,
          specs: [{ kind: "script_injection" }, "no-es-objeto", null],
        },
      },
    },
  ];
  const restored = messagesToTranscript(rows);
  // El sobre de versión desconocida degrada a texto plano; el de specs inválidos no restaura nada
  // (fila sin texto ni specs válidos -> desaparece del transcript, nunca rompe el sembrado).
  assert.deepEqual(
    restored.map((m) => ({ id: m.id, kind: m.kind ?? null })),
    [{ id: "v9", kind: null }],
  );
});

test("tope de specs por mensaje: se conservan los primeros N y el resto se descarta", () => {
  const many = Array.from({ length: MAX_UI_SPECS_PER_MESSAGE + 3 }, () => FORM_SPEC);
  const payload = toMessagePayload("conv-1", {
    id: "m9",
    role: "assistant",
    text: "",
    uiSpecs: many,
  });
  const envelope = payload.payload?.ui as { specs: unknown[] };
  assert.equal(envelope.specs.length, MAX_UI_SPECS_PER_MESSAGE);
});

test("burbuja vacía SIN spec: sigue sin persistirse", () => {
  const empty: TranscriptMessage = { id: "e1", role: "assistant", text: "  " };
  assert.deepEqual(selectUnpersisted([empty], new Set()), []);
});

// ----- Planes aprobados persistentes (payload.approved_plans -> segmentos preserve) -----

const PLAN_NOTE =
  "Acción clínica APROBADA y ejecutada (create → appointments): Cita de control. " +
  "Identificador del registro creado: 3f2a0000-0000-0000-0000-000000000001.";

test("planes aprobados: round-trip por payload.approved_plans (incluso con texto vacío)", () => {
  const anchor: TranscriptMessage = {
    id: "a2",
    role: "assistant",
    text: "",
    approvedPlanNotes: [PLAN_NOTE],
  };
  // Portador de notas de plan con texto vacío: SÍ se selecciona para persistir.
  assert.deepEqual(selectUnpersisted([anchor], new Set()), [anchor]);

  const payload = toMessagePayload("conv-1", anchor);
  assert.deepEqual(payload.payload, {
    approved_plans: { version: UI_PAYLOAD_VERSION, notes: [PLAN_NOTE] },
  });

  const restored = messagesToTranscript([
    {
      id: "row-3",
      conversation_id: "conv-1",
      role: "assistant",
      content: "",
      sequence_index: 0,
      payload: payload.payload,
    },
  ]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].approvedPlanNotes, [PLAN_NOTE]);
  // Y el agregador del hilo las expone en orden para resembrar los preserve.
  assert.deepEqual(approvedPlanNotesOf(restored), [PLAN_NOTE]);
});

test("planes aprobados: sobre inválido (versión/tipos) se descarta gobernadamente", () => {
  const restored = messagesToTranscript([
    {
      id: "row-4",
      conversation_id: "conv-1",
      role: "assistant",
      content: "texto",
      sequence_index: 0,
      payload: { approved_plans: { version: 99, notes: [PLAN_NOTE] } },
    },
    {
      id: "row-5",
      conversation_id: "conv-1",
      role: "assistant",
      content: "otro",
      sequence_index: 1,
      payload: { approved_plans: { version: UI_PAYLOAD_VERSION, notes: [42, "  ", null] } },
    },
  ]);
  assert.equal(restored.length, 2);
  assert.deepEqual(approvedPlanNotesOf(restored), []);
});
