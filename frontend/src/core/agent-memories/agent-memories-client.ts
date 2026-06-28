"use client";

import { browserApi } from "@/core/api/browser-client";
import type {
  AgentMemoryCreate,
  AgentMemoryRead,
  AgentMemoryUpdate,
  MessageResponse,
} from "@/core/api/contracts";

// Cliente de memorias del agente del usuario autenticado. Envuelve los endpoints
// owner-only (F4) con el patrón browser (credentials:"include" vía browserApi). A
// diferencia de las API keys, el ``content`` SÍ vuelve descifrado al dueño: aquí no se
// persiste ni se loguea nada, pero el contenido es del propio usuario y la UI lo muestra.

const BASE = "/api/v1/users/me/agent-memories";

/** Lista las memorias vigentes del usuario (con el contenido descifrado). */
export function listAgentMemories(patientId?: string): Promise<AgentMemoryRead[]> {
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  return browserApi<AgentMemoryRead[]>(`${BASE}${query}`, { method: "GET" });
}

/** Da de alta una memoria (el contenido se cifra en el backend). */
export function createAgentMemory(payload: AgentMemoryCreate): Promise<AgentMemoryRead> {
  return browserApi<AgentMemoryRead>(BASE, { method: "POST", body: payload });
}

/** Actualiza parcialmente una memoria (si viene ``content`` se recifra). */
export function updateAgentMemory(
  id: string,
  payload: AgentMemoryUpdate,
): Promise<AgentMemoryRead> {
  return browserApi<AgentMemoryRead>(`${BASE}/${id}`, { method: "PATCH", body: payload });
}

/** Baja lógica (soft-delete) de una memoria. */
export function deleteAgentMemory(id: string): Promise<MessageResponse> {
  return browserApi<MessageResponse>(`${BASE}/${id}`, { method: "DELETE" });
}
