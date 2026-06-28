import test from "node:test";
import assert from "node:assert/strict";

import type { AiProviderCredentialRead } from "@/core/api/contracts";

import {
  PROVIDER_OPTIONS,
  SECRET_MASK,
  deleteCredentialConfirmation,
  disconnectOAuthConfirmation,
  maskedKeyLabel,
  oauthStatusLabel,
  providerDisplayName,
} from "./ai-providers-view.ts";

function credential(overrides: Partial<AiProviderCredentialRead> = {}): AiProviderCredentialRead {
  return {
    id: "c1",
    provider: "opencode_zen",
    credential_type: "api_key",
    label: "Mi key",
    is_active: true,
    default_model: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

test("maskedKeyLabel: devuelve una máscara fija, nunca el secreto", () => {
  const masked = maskedKeyLabel();
  assert.equal(masked, SECRET_MASK);
  // No hay forma de derivar el secreto desde un Read: el tipo no lo expone.
  const read = credential();
  assert.equal("secret" in (read as Record<string, unknown>), false);
  assert.ok(masked.length > 0 && !masked.includes("sk-"));
});

test("PROVIDER_OPTIONS: cubre los 7 proveedores del enum del backend", () => {
  assert.equal(PROVIDER_OPTIONS.length, 7);
  const values = PROVIDER_OPTIONS.map((option) => option.value);
  assert.deepEqual(values, [
    "opencode_zen",
    "opencode_go",
    "openai",
    "anthropic",
    "gemini",
    "openrouter",
    "ollama",
  ]);
});

test("providerDisplayName: mapea a etiqueta legible", () => {
  assert.equal(providerDisplayName("openai"), "OpenAI");
  assert.equal(providerDisplayName("opencode_zen"), "OpenCode Zen");
});

test("oauthStatusLabel: refleja conexión y cuenta sin tokens", () => {
  assert.equal(oauthStatusLabel(null), "No conectado");
  assert.equal(oauthStatusLabel({ connected: false }), "No conectado");
  assert.equal(oauthStatusLabel({ connected: true }), "Conectado");
  assert.equal(
    oauthStatusLabel({ connected: true, account_id: "acc-9" }),
    "Conectado (cuenta acc-9)",
  );
});

test("deleteCredentialConfirmation: exige confirmación destructiva con el label", () => {
  const confirmation = deleteCredentialConfirmation(credential({ label: "OpenCode" }));
  assert.equal(confirmation.required, true);
  assert.equal(confirmation.destructive, true);
  assert.equal(confirmation.confirm_label, "Eliminar");
  assert.match(confirmation.message, /OpenCode/);
});

test("disconnectOAuthConfirmation: exige confirmación para desconectar ChatGPT", () => {
  const confirmation = disconnectOAuthConfirmation();
  assert.equal(confirmation.required, true);
  assert.equal(confirmation.destructive, true);
  assert.equal(confirmation.confirm_label, "Desconectar");
});
