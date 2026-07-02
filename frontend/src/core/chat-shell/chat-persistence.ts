// Mapeo PURO entre el transcript del CopilotPanel y los mensajes persistidos del backend
// (Conversation + Message, MP-CTRL-0123). Sin red ni React: el cliente de red y el shell lo usan.
//
// Persistir el transcript NO es una escritura clínica (no requiere P1): es la memoria del hilo de
// chat. Sólo se persiste/restaura la conversación visible (roles ``user``/``assistant``); las capas
// de sistema (seguridad/persona/contexto/memorias) y las tool calls NO se vuelcan aquí. El orden lo
// fija el backend con ``sequence_index`` (asignado en el servidor).
//
// UI GENERATIVA PERSISTENTE: los ``UiSpec`` (formularios de plantilla, planes de tareas, acciones
// detectadas, checklists…) SÍ se persisten, en el ``payload`` versionado del mensaje que los ancla
// (``payload.ui = { version, specs }``). Al recargar se RESTAURAN como mensajes ``kind: "ui"``
// GOBERNADOS: cada spec se revalida con ``isUiSpec`` (forma) y el renderizador único GeneratedUi
// aplica su propia lista blanca; toda acción que dispare sigue pasando por P1 + RBAC del backend.
// Esto NO agranda el contexto del modelo: los specs restaurados van con texto vacío (aportan cero
// tokens al armar el turno) y su propósito es lo contrario — que el médico retome un proceso ya
// definido sin volver a pedírselo al agente.

import { isUiSpec, type UiSpec } from "@/core/agent/tools/ui-spec";

/** Rol persistible de un mensaje del transcript visible. */
export type TranscriptRole = "user" | "assistant";

/** Versión vigente del sobre ``payload.ui`` (evolucionar con cuidado: hilos viejos lo conservan). */
export const UI_PAYLOAD_VERSION = 1;

// Topes DETERMINISTAS del sobre de UI: specs por mensaje y tamaño serializado total. Un spec que
// exceda el tope se DESCARTA del payload (el texto del mensaje se persiste igual); protege la fila
// de payloads desbocados (p. ej. una gráfica con miles de puntos).
export const MAX_UI_SPECS_PER_MESSAGE = 8;
export const MAX_UI_PAYLOAD_CHARS = 100_000;

// Topes del sobre de PLANES APROBADOS (notas deterministas de escrituras P1 ejecutadas): son
// líneas cortas generadas por código; los topes sólo acotan lo patológico.
export const MAX_PLAN_NOTES_PER_MESSAGE = 20;
export const MAX_PLAN_NOTE_CHARS = 2_000;

// Topes del sobre de NOTAS DE HERRAMIENTAS (resumen determinista del uso de tools del turno:
// lecturas, meta-tools, MCP, sandbox y escrituras rechazadas). Telegráficas por construcción.
export const MAX_TOOL_NOTES_PER_MESSAGE = 30;
export const MAX_TOOL_NOTE_CHARS = 600;

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
  // "note" = nota de contexto (acción humana inline). Se persiste como metadato para restaurar su
  // presentación al recargar el hilo; su rol persistido es "user" (acción del médico registrada).
  // "ui" = UI generativa en el hilo (formulario inyectado desde el expediente o spec restaurado de
  // una tool ``ui.*``); se persiste en ``payload.ui`` y se restaura gobernada.
  kind?: "note" | "ui";
  /** Spec a renderizar cuando ``kind === "ui"`` (mensaje de UI inyectada/restaurada). */
  uiSpec?: UiSpec;
  /** Specs de las tools ``ui.*`` del turno, ANCLADOS al mensaje del asistente que lo cerró. Se
   *  persisten juntos y al restaurar se materializan como mensajes ``kind: "ui"`` previos. */
  uiSpecs?: readonly UiSpec[];
  /** Notas DETERMINISTAS de los planes P1 aprobados y ejecutados en el turno (texto generado por
   *  código con recurso/acción/id creado). Se persisten en ``payload.approved_plans`` y al
   *  restaurar re-siembran los segmentos ``preserve`` de la compactación: así el modelo no olvida
   *  qué escribió (ni con qué ids) tras recargar la página. */
  approvedPlanNotes?: readonly string[];
  /** Notas del USO DE HERRAMIENTAS del turno (lecturas, meta-tools, MCP, sandbox, rechazos P1),
   *  ancladas al mensaje del asistente. Se persisten en ``payload.tool_notes`` y entran al contexto
   *  de los turnos siguientes como bloque adyacente COMPACTABLE (a diferencia de los planes
   *  aprobados, que son ``preserve``). */
  toolNotes?: readonly string[];
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
 * Extrae, GOBERNADAMENTE, los specs de UI del sobre versionado ``payload.ui``. Sólo se aceptan
 * sobres con la versión conocida y specs que pasen ``isUiSpec`` (forma en lista blanca); todo lo
 * demás se descarta en silencio (un hilo viejo o un payload manipulado degrada a texto plano, nunca
 * rompe el sembrado). La gobernanza de FONDO no vive aquí: cualquier acción de un spec restaurado
 * vuelve a pasar por aprobación P1 y por el RBAC del backend al ejecutarse.
 */
function uiSpecsFromPayload(payload: Record<string, unknown> | null | undefined): UiSpec[] {
  const envelope = payload?.ui;
  if (typeof envelope !== "object" || envelope === null) {
    return [];
  }
  const { version, specs } = envelope as { version?: unknown; specs?: unknown };
  if (version !== UI_PAYLOAD_VERSION || !Array.isArray(specs)) {
    return [];
  }
  return specs.filter(isUiSpec).slice(0, MAX_UI_SPECS_PER_MESSAGE);
}

/**
 * Extrae las notas de planes aprobados del sobre versionado ``payload.approved_plans``. Mismo
 * criterio gobernado que el sobre de UI: versión conocida y sólo strings no vacíos, con topes.
 */
function planNotesFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  const envelope = payload?.approved_plans;
  if (typeof envelope !== "object" || envelope === null) {
    return [];
  }
  const { version, notes } = envelope as { version?: unknown; notes?: unknown };
  if (version !== UI_PAYLOAD_VERSION || !Array.isArray(notes)) {
    return [];
  }
  return notes
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    .slice(0, MAX_PLAN_NOTES_PER_MESSAGE)
    .map((note) => note.slice(0, MAX_PLAN_NOTE_CHARS));
}

/**
 * Extrae las notas de uso de herramientas del sobre versionado ``payload.tool_notes``. Mismo
 * criterio gobernado que los otros sobres: versión conocida, sólo strings no vacíos y topes.
 */
function toolNotesFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string[] {
  const envelope = payload?.tool_notes;
  if (typeof envelope !== "object" || envelope === null) {
    return [];
  }
  const { version, notes } = envelope as { version?: unknown; notes?: unknown };
  if (version !== UI_PAYLOAD_VERSION || !Array.isArray(notes)) {
    return [];
  }
  return notes
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    .slice(0, MAX_TOOL_NOTES_PER_MESSAGE)
    .map((note) => note.slice(0, MAX_TOOL_NOTE_CHARS));
}

/**
 * Notas de planes aprobados de TODO el hilo restaurado, en orden. El panel las re-siembra como
 * segmentos ``preserve`` de la compactación (paridad con la sesión en vivo, donde los planes
 * aprobados se conservan verbatim en el contexto de cada turno).
 */
export function approvedPlanNotesOf(messages: readonly TranscriptMessage[]): string[] {
  return messages.flatMap((message) => message.approvedPlanNotes ?? []);
}

/**
 * Convierte las filas persistidas en mensajes del transcript para SEMBRAR el CopilotPanel al abrir
 * un chat. Ordena por ``sequence_index`` (orden estable del servidor), descarta roles no visibles
 * (system/tool) y restaura ``reasoning``/``isError`` desde el payload si se guardaron. El id del
 * mensaje sembrado ES el id del backend (uuid): así el shell puede marcarlos como ya persistidos y
 * no reenviarlos.
 *
 * Si la fila trae UI generativa (``payload.ui``), cada spec válido se MATERIALIZA como un mensaje
 * ``kind: "ui"`` propio ANTES del texto (mismo orden visual que en vivo: la UI del turno encima de
 * la respuesta). Sus ids sintéticos derivan del uuid de la fila (``<uuid>:ui:<n>``): entran al set
 * de persistidos del shell y no se reenvían. Con el texto vacío, la fila restaura sólo su UI.
 */
export function messagesToTranscript(rows: readonly PersistedMessageRow[]): TranscriptMessage[] {
  return [...rows]
    .sort((a, b) => a.sequence_index - b.sequence_index)
    .filter((row) => isTranscriptRole(row.role))
    .flatMap((row) => {
      const restored: TranscriptMessage[] = [];
      const payload = row.payload ?? undefined;

      for (const [index, spec] of uiSpecsFromPayload(payload).entries()) {
        restored.push({
          id: `${row.id}:ui:${index}`,
          role: row.role as TranscriptRole,
          text: "",
          kind: "ui",
          uiSpec: spec,
        });
      }

      const planNotes = planNotesFromPayload(payload);
      const toolNotes = toolNotesFromPayload(payload);
      // El mensaje base se restaura con texto o, aun vacío, si porta notas (de plan o de tools):
      // el turno que sólo usó herramientas persiste su rastro; el render suprime la burbuja vacía.
      if (row.content.trim().length > 0 || planNotes.length > 0 || toolNotes.length > 0) {
        const message: TranscriptMessage = {
          id: row.id,
          role: row.role as TranscriptRole,
          text: row.content,
        };
        if (planNotes.length > 0) {
          message.approvedPlanNotes = planNotes;
        }
        if (toolNotes.length > 0) {
          message.toolNotes = toolNotes;
        }
        if (payload) {
          if (payload.is_error === true) {
            message.isError = true;
          }
          if (typeof payload.reasoning === "string" && payload.reasoning) {
            message.reasoning = payload.reasoning;
          }
          if (payload.note === true) {
            message.kind = "note";
          }
        }
        restored.push(message);
      }
      return restored;
    });
}

/** ¿El mensaje lleva contenido persistible además del texto (UI generativa o notas)? */
function carriesUiSpecs(message: TranscriptMessage): boolean {
  if (message.kind === "ui" && message.uiSpec) {
    return true;
  }
  if (Array.isArray(message.approvedPlanNotes) && message.approvedPlanNotes.length > 0) {
    return true;
  }
  if (Array.isArray(message.toolNotes) && message.toolNotes.length > 0) {
    return true;
  }
  return Array.isArray(message.uiSpecs) && message.uiSpecs.length > 0;
}

/**
 * Selecciona los mensajes del transcript que AÚN no se han persistido (id ∉ ``persistedIds``),
 * preservando el orden. Se persisten roles visibles con texto no vacío Y TAMBIÉN los portadores de
 * UI generativa aunque su texto vaya vacío (el spec ES el contenido); las burbujas vacías sin spec
 * siguen descartándose. El llamador persiste el resultado en orden y marca cada id.
 */
export function selectUnpersisted<T extends TranscriptMessage>(
  messages: readonly T[],
  persistedIds: ReadonlySet<string>,
): T[] {
  return messages.filter(
    (message) =>
      !persistedIds.has(message.id) &&
      isTranscriptRole(message.role) &&
      (message.text.trim().length > 0 || carriesUiSpecs(message)),
  );
}

/**
 * Serializa (con topes) los specs de UI de un mensaje al sobre versionado ``payload.ui``. Devuelve
 * null si el mensaje no lleva UI o si TODOS sus specs exceden los topes. El recorte es
 * determinista: se conservan los primeros N que quepan en el presupuesto de caracteres.
 */
function toUiEnvelope(
  message: TranscriptMessage,
): { version: number; specs: UiSpec[] } | null {
  const source: readonly UiSpec[] =
    message.kind === "ui" && message.uiSpec ? [message.uiSpec] : (message.uiSpecs ?? []);
  const specs: UiSpec[] = [];
  let budget = MAX_UI_PAYLOAD_CHARS;
  for (const spec of source.slice(0, MAX_UI_SPECS_PER_MESSAGE)) {
    let size: number;
    try {
      size = JSON.stringify(spec).length;
    } catch {
      continue; // Spec no serializable (no debería ocurrir): se descarta, el texto persiste igual.
    }
    if (size > budget) {
      continue;
    }
    budget -= size;
    specs.push(spec);
  }
  return specs.length > 0 ? { version: UI_PAYLOAD_VERSION, specs } : null;
}

/**
 * Arma el cuerpo de alta de un mensaje. Guarda ``reasoning``/``isError``/``note`` y el sobre de UI
 * generativa (``payload.ui``) en el payload estructurado, para poder restaurarlos al recargar el
 * hilo. ``payload`` se omite si no hay metadatos que guardar.
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
  if (message.kind === "note") {
    meta.note = true;
  }
  const ui = toUiEnvelope(message);
  if (ui) {
    meta.ui = ui;
  }
  const planNotes = (message.approvedPlanNotes ?? [])
    .filter((note) => note.trim().length > 0)
    .slice(0, MAX_PLAN_NOTES_PER_MESSAGE)
    .map((note) => note.slice(0, MAX_PLAN_NOTE_CHARS));
  if (planNotes.length > 0) {
    meta.approved_plans = { version: UI_PAYLOAD_VERSION, notes: planNotes };
  }
  const toolNotes = (message.toolNotes ?? [])
    .filter((note) => note.trim().length > 0)
    .slice(0, MAX_TOOL_NOTES_PER_MESSAGE)
    .map((note) => note.slice(0, MAX_TOOL_NOTE_CHARS));
  if (toolNotes.length > 0) {
    meta.tool_notes = { version: UI_PAYLOAD_VERSION, notes: toolNotes };
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
