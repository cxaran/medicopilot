// Mapeo PURO entre el transcript del CopilotPanel y los mensajes persistidos del backend
// (Conversation + Message, MP-CTRL-0123). Sin red ni React: el cliente de red y el shell lo usan.
//
// Persistir el transcript NO es una escritura clínica (no requiere P1): es la memoria del hilo de
// chat. Sólo se persiste/restaura la conversación visible (roles ``user``/``assistant``); las capas
// de sistema (seguridad/persona/contexto/memorias) y las tool calls NO se vuelcan aquí. El orden lo
// fija el backend con ``sequence_index`` (asignado en el servidor).

/** Rol persistible de un mensaje del transcript visible. */
export type TranscriptRole = "user" | "assistant";

/**
 * Subconjunto ESTRUCTURAL del ``ChatMessage`` del CopilotPanel que se persiste/restaura.
 * (El ``ChatMessage`` real tiene además ``image``, que no se persiste en esta rebanada.)
 */
export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  text: string;
  isError?: boolean;
  reasoning?: string;
}

/** Fila de mensaje tal como la devuelve el backend (``/api/v1/messages``). */
export interface PersistedMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sequence_index: number;
  payload?: Record<string, unknown> | null;
}

/** Cuerpo de alta (append) de un mensaje; el ``sequence_index`` lo asigna el servidor. */
export interface MessageCreatePayload {
  conversation_id: string;
  role: TranscriptRole;
  content: string;
  payload?: Record<string, unknown> | null;
}

function isTranscriptRole(role: string): role is TranscriptRole {
  return role === "user" || role === "assistant";
}

/**
 * Convierte las filas persistidas en mensajes del transcript para SEMBRAR el CopilotPanel al abrir
 * un chat. Ordena por ``sequence_index`` (orden estable del servidor), descarta roles no visibles
 * (system/tool) y restaura ``reasoning``/``isError`` desde el payload si se guardaron. El id del
 * mensaje sembrado ES el id del backend (uuid): así el shell puede marcarlos como ya persistidos y
 * no reenviarlos.
 */
export function messagesToTranscript(rows: readonly PersistedMessageRow[]): TranscriptMessage[] {
  return [...rows]
    .sort((a, b) => a.sequence_index - b.sequence_index)
    .filter((row) => isTranscriptRole(row.role))
    .map((row) => {
      const message: TranscriptMessage = {
        id: row.id,
        role: row.role as TranscriptRole,
        text: row.content,
      };
      const payload = row.payload ?? undefined;
      if (payload) {
        if (payload.is_error === true) {
          message.isError = true;
        }
        if (typeof payload.reasoning === "string" && payload.reasoning) {
          message.reasoning = payload.reasoning;
        }
      }
      return message;
    });
}

/**
 * Selecciona los mensajes del transcript que AÚN no se han persistido (id ∉ ``persistedIds``),
 * preservando el orden. Sólo se persisten roles visibles con texto no vacío: así no se vuelcan
 * burbujas vacías ni placeholders. El llamador persiste el resultado en orden y marca cada id.
 */
export function selectUnpersisted<T extends TranscriptMessage>(
  messages: readonly T[],
  persistedIds: ReadonlySet<string>,
): T[] {
  return messages.filter(
    (message) =>
      !persistedIds.has(message.id) &&
      isTranscriptRole(message.role) &&
      message.text.trim().length > 0,
  );
}

/**
 * Arma el cuerpo de alta de un mensaje. Guarda ``reasoning``/``isError`` en el payload estructurado
 * (metadatos del turno) para poder restaurarlos al recargar el hilo. ``payload`` se omite si no hay
 * metadatos que guardar.
 */
export function toMessagePayload(
  conversationId: string,
  message: TranscriptMessage,
): MessageCreatePayload {
  const meta: Record<string, unknown> = {};
  if (message.isError) {
    meta.is_error = true;
  }
  if (message.reasoning) {
    meta.reasoning = message.reasoning;
  }
  const payload: MessageCreatePayload = {
    conversation_id: conversationId,
    role: message.role,
    content: message.text,
  };
  if (Object.keys(meta).length > 0) {
    payload.payload = meta;
  }
  return payload;
}
