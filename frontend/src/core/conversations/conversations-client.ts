"use client";

import { browserApi } from "@/core/api/browser-client";
import type {
  MessageCreatePayload,
  PersistedMessageRow,
} from "@/core/chat-shell/chat-persistence";

// Cliente de persistencia del chat del copiloto (Conversation + Message, MP-CTRL-0123). Envuelve los
// endpoints genéricos del contrato (``/api/v1/conversations`` y ``/api/v1/messages``) con el patrón
// browser (cookie del médico vía browserApi). Persistir el hilo NO es una escritura clínica: las
// escrituras clínicas (borradores) siguen su camino de aprobación (P1) en el CopilotPanel.
//
// Tipos LOCALES mínimos y fieles al esquema del backend (no se acoplan al nombre generado): así el
// cliente es autocontenido. El backend revalida RBAC/soft-delete en cada llamada.

/** Fila de conversación tal como la devuelve el backend (``/api/v1/conversations``). */
export interface ConversationRow {
  id: string;
  patient_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string | null;
}

interface OffsetPage<T> {
  items: T[];
  pagination?: { has_next?: boolean };
}

const CONVERSATIONS = "/api/v1/conversations";
const MESSAGES = "/api/v1/messages";

// Tamaño de página al recorrer el hilo completo (MAX_LIMIT del backend). El endpoint pagina con
// límite por defecto de 20: sin recorrerlo, un chat largo perdería su cola al recargar.
const MESSAGES_PAGE_LIMIT = 100;

/** Lista conversaciones vigentes; si se da ``patientId`` filtra por ese paciente (chat del paciente). */
export async function listConversations(patientId?: string | null): Promise<ConversationRow[]> {
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  const page = await browserApi<OffsetPage<ConversationRow>>(`${CONVERSATIONS}${query}`, {
    method: "GET",
  });
  return page.items;
}

/** Crea una conversación (paciente o, con ``patientId`` nulo, el chat global del inicio). */
export function createConversation(
  patientId: string | null,
  title?: string | null,
): Promise<ConversationRow> {
  return browserApi<ConversationRow>(CONVERSATIONS, {
    method: "POST",
    body: { patient_id: patientId, title: title ?? null },
  });
}

/**
 * Lista TODOS los mensajes vigentes de una conversación (orden por ``sequence_index`` del
 * servidor). Recorre las páginas del endpoint (offset/limit) hasta agotar el hilo: el sembrado del
 * chat necesita el historial completo, porque el navegador reconstruye el contexto del modelo en
 * cada turno (la compactación por presupuesto ocurre después, en el CopilotPanel).
 */
export async function listMessages(conversationId: string): Promise<PersistedMessageRow[]> {
  const rows: PersistedMessageRow[] = [];
  let offset = 0;
  for (;;) {
    const page = await browserApi<OffsetPage<PersistedMessageRow>>(
      `${MESSAGES}?conversation_id=${encodeURIComponent(conversationId)}` +
        `&limit=${MESSAGES_PAGE_LIMIT}&offset=${offset}`,
      { method: "GET" },
    );
    rows.push(...page.items);
    if (!page.pagination?.has_next || page.items.length === 0) {
      return rows;
    }
    offset += page.items.length;
  }
}

/** Agrega (append) un mensaje a una conversación; el ``sequence_index`` lo asigna el servidor. */
export function appendMessage(payload: MessageCreatePayload): Promise<PersistedMessageRow> {
  return browserApi<PersistedMessageRow>(MESSAGES, {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
}

/** Baja lógica de UN mensaje del hilo (limpieza del chat; el backend revalida RBAC). */
export function deleteMessage(messageId: string): Promise<void> {
  return browserApi<void>(`${MESSAGES}/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

/**
 * Reinicia el hilo con baja lógica en LOTE de sus mensajes vigentes. Sin ``fromSequenceIndex``
 * vacía la conversación completa; con él, elimina desde ese punto (inclusive) hasta el final. La
 * conversación en sí no se elimina (el chat sigue abierto, vacío o recortado).
 */
export function resetConversation(
  conversationId: string,
  fromSequenceIndex?: number,
): Promise<{ deleted_count: number }> {
  return browserApi<{ deleted_count: number }>(
    `${CONVERSATIONS}/${encodeURIComponent(conversationId)}/reset`,
    {
      method: "POST",
      body: { from_sequence_index: fromSequenceIndex ?? null },
    },
  );
}

/**
 * Busca la conversación del chat indicado o la crea si no existe. Para un paciente: la más reciente
 * filtrando por ``patient_id`` (el backend ordena por ``-created_at``). Para el chat global
 * (``patientId`` nulo): la más reciente con ``patient_id`` nulo (el filtro genérico no expresa IS
 * NULL, así que se descarta en el cliente). Si no hay ninguna, se crea.
 */
export async function findOrCreateConversation(
  patientId: string | null,
): Promise<ConversationRow> {
  if (patientId) {
    const existing = await listConversations(patientId);
    return existing[0] ?? (await createConversation(patientId));
  }
  const all = await listConversations();
  const global = all.find((conversation) => conversation.patient_id === null);
  return global ?? (await createConversation(null));
}
