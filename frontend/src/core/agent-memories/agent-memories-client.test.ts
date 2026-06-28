import test from "node:test";
import assert from "node:assert/strict";

import { ApiRequestError } from "@/core/api/api-error";

import {
  createAgentMemory,
  deleteAgentMemory,
  listAgentMemories,
  updateAgentMemory,
} from "./agent-memories-client.ts";

// agent-memories-client delega en browserApi (credentials:"include") -> requestJson ->
// globalThis.fetch. Se mockea fetch y se verifica method/path/body/credentials.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function capture(t: { mock: { method: typeof import("node:test").mock.method } }, body: unknown, status = 200) {
  const captured: { url?: unknown; init?: RequestInit } = {};
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return jsonResponse(status, body);
  });
  return captured;
}

const BASE = "/api/v1/users/me/agent-memories";

test("listAgentMemories: GET en el endpoint base con credentials:include", async (t) => {
  const captured = capture(t, [{ id: "m1", title: "X", content: "c", kind: "nota" }]);
  const result = await listAgentMemories();
  assert.deepEqual(result, [{ id: "m1", title: "X", content: "c", kind: "nota" }]);
  assert.equal(captured.url, BASE);
  assert.equal(captured.init?.method, "GET");
  assert.equal(captured.init?.credentials, "include");
});

test("listAgentMemories: con patient_id agrega el query param", async (t) => {
  const captured = capture(t, []);
  await listAgentMemories("p-1");
  assert.equal(captured.url, `${BASE}?patient_id=p-1`);
  assert.equal(captured.init?.method, "GET");
});

test("createAgentMemory: POST que ENVÍA el contenido en el body", async (t) => {
  const captured = capture(t, { id: "m1", title: "Alergia", content: "...", kind: "hecho_clinico" }, 201);
  const payload = {
    title: "Alergia",
    content: "penicilina",
    kind: "hecho_clinico" as const,
    patient_id: null,
    consultation_id: null,
  };
  const created = await createAgentMemory(payload);
  assert.equal(captured.url, BASE);
  assert.equal(captured.init?.method, "POST");
  assert.equal(captured.init?.body, JSON.stringify(payload));
  assert.equal(created.id, "m1");
});

test("updateAgentMemory: PATCH en /{id} con el payload parcial", async (t) => {
  const captured = capture(t, { id: "m1", title: "Nuevo", content: "c", kind: "nota" });
  await updateAgentMemory("m1", { title: "Nuevo", patient_id: null });
  assert.equal(captured.url, `${BASE}/m1`);
  assert.equal(captured.init?.method, "PATCH");
  assert.equal(captured.init?.body, JSON.stringify({ title: "Nuevo", patient_id: null }));
});

test("deleteAgentMemory: DELETE en /{id}", async (t) => {
  const captured = capture(t, { message: "Memoria eliminada correctamente" });
  await deleteAgentMemory("m1");
  assert.equal(captured.url, `${BASE}/m1`);
  assert.equal(captured.init?.method, "DELETE");
});

test("un 4xx se propaga como ApiRequestError normalizado", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(422, { code: "validation_error", message: "Falta el título" }),
  );
  await assert.rejects(
    () =>
      createAgentMemory({
        title: "",
        content: "",
        kind: "nota",
        patient_id: null,
        consultation_id: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.status, 422);
      return true;
    },
  );
});
