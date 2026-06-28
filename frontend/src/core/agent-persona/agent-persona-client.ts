"use client";

import { browserApi } from "@/core/api/browser-client";
import type { AgentPersonaRead, AgentPersonaUpdate } from "@/core/api/contracts";

// Cliente de la persona del copiloto del usuario autenticado (owner-only, singleton P4).
// La persona es config en claro (tono/especialidad/idioma/estilo); la capa de SEGURIDAD
// clínica NO se gestiona aquí: es fija y la posee el código (ver core/agent/persona.ts).

const BASE = "/api/v1/users/me/agent-persona";

/** Obtiene la persona del usuario (campos vacíos si aún no configuró ninguna). */
export function getAgentPersona(): Promise<AgentPersonaRead> {
  return browserApi<AgentPersonaRead>(BASE, { method: "GET" });
}

/** Upsert de la persona (solo se aplican los campos enviados). */
export function updateAgentPersona(payload: AgentPersonaUpdate): Promise<AgentPersonaRead> {
  return browserApi<AgentPersonaRead>(BASE, { method: "PUT", body: payload });
}
