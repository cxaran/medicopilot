import test from "node:test";
import assert from "node:assert/strict";

import { ApiRequestError } from "@/core/api/api-error";

import {
  completeOpenAiOAuth,
  createAiProvider,
  deleteAiProvider,
  disconnectOpenAiOAuth,
  getOpenAiOAuthStatus,
  listAiProviders,
  startOpenAiOAuth,
  updateAiProvider,
} from "./ai-providers-client.ts";

// ai-providers-client delega en browserApi (credentials:"include") -> requestJson ->
// globalThis.fetch. Se mockea fetch y se verifica method/path/body/credentials, sin
// llamadas reales y sin nunca recibir el secreto de vuelta.

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

const BASE = "/api/v1/users/me/ai-providers";
const OAUTH = "/api/v1/users/me/ai-providers/oauth/openai";

test("listAiProviders: GET en el endpoint base con credentials:include", async (t) => {
  const captured = capture(t, [{ id: "c1", provider: "openai", label: "X" }]);
  const result = await listAiProviders();
  assert.deepEqual(result, [{ id: "c1", provider: "openai", label: "X" }]);
  assert.equal(captured.url, BASE);
  assert.equal(captured.init?.method, "GET");
  assert.equal(captured.init?.credentials, "include");
});

test("createAiProvider: POST que ENVÍA la API key en el body", async (t) => {
  const captured = capture(t, { id: "c1", provider: "opencode_zen", label: "Mi key" }, 201);
  const payload = {
    provider: "opencode_zen" as const,
    label: "Mi key",
    secret: "sk-test-DUMMY",
    default_model: null,
  };
  const created = await createAiProvider(payload);
  assert.equal(captured.url, BASE);
  assert.equal(captured.init?.method, "POST");
  assert.equal(captured.init?.body, JSON.stringify(payload));
  // La respuesta NUNCA trae el secreto en claro.
  assert.equal("secret" in (created as Record<string, unknown>), false);
});

test("updateAiProvider: PATCH en /{id} con el payload parcial", async (t) => {
  const captured = capture(t, { id: "c1", provider: "openai", label: "Nuevo" });
  await updateAiProvider("c1", { label: "Nuevo", is_active: false });
  assert.equal(captured.url, `${BASE}/c1`);
  assert.equal(captured.init?.method, "PATCH");
  assert.equal(captured.init?.body, JSON.stringify({ label: "Nuevo", is_active: false }));
});

test("deleteAiProvider: DELETE en /{id}", async (t) => {
  const captured = capture(t, { message: "ok" });
  await deleteAiProvider("c1");
  assert.equal(captured.url, `${BASE}/c1`);
  assert.equal(captured.init?.method, "DELETE");
});

test("startOpenAiOAuth: POST .../oauth/openai/start", async (t) => {
  const captured = capture(t, { authorize_url: "https://auth.openai.com/x", state: "s1" });
  const result = await startOpenAiOAuth();
  assert.equal(captured.url, `${OAUTH}/start`);
  assert.equal(captured.init?.method, "POST");
  assert.equal(result.state, "s1");
});

test("completeOpenAiOAuth: POST .../complete con code+state", async (t) => {
  const captured = capture(t, { connected: true, account_id: "acc-1" });
  const result = await completeOpenAiOAuth({ code: "auth-code", state: "s1" });
  assert.equal(captured.url, `${OAUTH}/complete`);
  assert.equal(captured.init?.method, "POST");
  assert.equal(captured.init?.body, JSON.stringify({ code: "auth-code", state: "s1" }));
  assert.equal(result.connected, true);
});

test("getOpenAiOAuthStatus: GET .../status (sin tokens)", async (t) => {
  const captured = capture(t, { connected: false });
  const result = await getOpenAiOAuthStatus();
  assert.equal(captured.url, `${OAUTH}/status`);
  assert.equal(captured.init?.method, "GET");
  assert.equal(result.connected, false);
});

test("disconnectOpenAiOAuth: DELETE .../oauth/openai", async (t) => {
  const captured = capture(t, { message: "ok" });
  await disconnectOpenAiOAuth();
  assert.equal(captured.url, OAUTH);
  assert.equal(captured.init?.method, "DELETE");
});

test("un 4xx se propaga como ApiRequestError normalizado", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(422, { code: "validation_error", message: "Falta la key" }),
  );
  await assert.rejects(
    () => createAiProvider({ provider: "openai", label: "X", secret: "", default_model: null }),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.status, 422);
      return true;
    },
  );
});
