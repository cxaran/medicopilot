"use client";

import { browserApi } from "@/core/api/browser-client";
import type {
  AiProviderCredentialCreate,
  AiProviderCredentialRead,
  AiProviderCredentialUpdate,
  MessageResponse,
  OAuthCompleteRequest,
  OAuthStartResponse,
  OAuthStatusResponse,
} from "@/core/api/contracts";

// Cliente de proveedores de IA del usuario autenticado. Envuelve los endpoints
// owner-only de B3 (API keys) y B10 (OAuth ChatGPT) con el patrón browser
// (credentials:"include" vía browserApi). La API key viaja al backend en el alta,
// pero NUNCA vuelve: ``AiProviderCredentialRead`` no expone el secreto y aquí no se
// persiste ni se loguea nada.

const BASE = "/api/v1/users/me/ai-providers";
const OAUTH_BASE = "/api/v1/users/me/ai-providers/oauth/openai";

/** Lista las credenciales vigentes del usuario (sin secreto en claro). */
export function listAiProviders(): Promise<AiProviderCredentialRead[]> {
  return browserApi<AiProviderCredentialRead[]>(BASE, { method: "GET" });
}

/** Da de alta una credencial API key (el secreto se envía y se cifra en el backend). */
export function createAiProvider(
  payload: AiProviderCredentialCreate,
): Promise<AiProviderCredentialRead> {
  return browserApi<AiProviderCredentialRead>(BASE, { method: "POST", body: payload });
}

/** Actualiza label/default_model/is_active (y opcionalmente rota el secreto). */
export function updateAiProvider(
  id: string,
  payload: AiProviderCredentialUpdate,
): Promise<AiProviderCredentialRead> {
  return browserApi<AiProviderCredentialRead>(`${BASE}/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

/** Baja lógica de una credencial. */
export function deleteAiProvider(id: string): Promise<MessageResponse> {
  return browserApi<MessageResponse>(`${BASE}/${id}`, { method: "DELETE" });
}

/** Inicia el flujo OAuth de ChatGPT: devuelve la URL de autorización y el state. */
export function startOpenAiOAuth(): Promise<OAuthStartResponse> {
  return browserApi<OAuthStartResponse>(`${OAUTH_BASE}/start`, { method: "POST" });
}

/** Completa el flujo OAuth con el code+state del callback. */
export function completeOpenAiOAuth(
  payload: OAuthCompleteRequest,
): Promise<OAuthStatusResponse> {
  return browserApi<OAuthStatusResponse>(`${OAUTH_BASE}/complete`, {
    method: "POST",
    body: payload,
  });
}

/** Estado de la conexión OAuth (connected + account_id), sin tokens. */
export function getOpenAiOAuthStatus(): Promise<OAuthStatusResponse> {
  return browserApi<OAuthStatusResponse>(`${OAUTH_BASE}/status`, { method: "GET" });
}

/** Desconecta (baja lógica) la conexión OAuth de ChatGPT. */
export function disconnectOpenAiOAuth(): Promise<MessageResponse> {
  return browserApi<MessageResponse>(OAUTH_BASE, { method: "DELETE" });
}
