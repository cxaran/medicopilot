// Mapeo PURO entre el transcript del CopilotPanel y los mensajes persistidos del backend
// (Conversation + Message, MP-CTRL-0123). Sin red ni React: el cliente de red y el shell lo usan.
//
// Persistir el transcript NO es una escritura clínica (no requiere P1): es la memoria del hilo de
// chat. Sólo se persiste/restaura la conversación visible (roles ``user``/``assistant``); las
// capas de sistema (seguridad/persona/contexto/memorias) no se vuelcan aquí. El orden lo fija el
// backend con ``sequence_index`` (asignado en el servidor).
//
// UI GENERATIVA PERSISTENTE: los ``UiSpec`` (formularios de plantilla, planes de tareas, acciones
// detectadas, checklists…) SÍ se persisten, en el ``payload`` versionado del mensaje que los ancla
// (``payload.ui = { version, specs }``). Al recargar se RESTAURAN como mensajes ``kind: "ui"``
// GOBERNADOS: cada spec se revalida con ``isUiSpec`` (forma) y el renderizador único GeneratedUi
// aplica su propia lista blanca; toda acción que dispare sigue pasando por P1 + RBAC del backend.
// Esto NO agranda el contexto del modelo: los specs restaurados van con texto vacío (aportan cero
// tokens al armar el turno) y su propósito es lo contrario — que el médico retome un proceso ya
// definido sin volver a pedírselo al agente.
//
// TOOL CALLS PERSISTENTES (``payload.tools``): el estado FINAL de las herramientas del turno
// (nombre, args, resultado en preview, éxito/error/rechazo, plan P1 resuelto, interfaz usada) se
// persiste anclado al mensaje del asistente, para restaurar el hilo TAL CUAL quedó: las tarjetas
// vuelven bajo su mensaje (``turnId`` sintético = uuid de la fila) con la misma contracción que en
// vivo. Los specs ``ui.*`` no se duplican: la call los REFERENCIA por índice en ``payload.ui``
// (``uiSpecIndex``) y al restaurar la interfaz vuelve DENTRO de su tarjeta (ya no como mensaje
// ``kind: "ui"`` suelto). Tampoco entra al contexto del modelo: el cable sigue leyendo sólo
// texto/imagen/toolNotes.

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

// Topes del sobre de TOOL CALLS (estado FINAL de las herramientas del turno, para restaurar el
// hilo tal cual quedó). Los textos ya vienen acotados en vivo (previews); los topes acotan lo
// patológico. Una call que exceda el presupuesto total se DESCARTA (el resto persiste igual).
export const MAX_TOOL_CALLS_PER_MESSAGE = 30;
export const MAX_TOOL_CALL_TEXT_CHARS = 4_000;
export const MAX_TOOLS_PAYLOAD_CHARS = 60_000;

/** Estado FINAL de una tool call persistida (subset estructural del ``ToolCallView`` del panel).
 *  Sólo estados TERMINALES: al cerrarse un turno no quedan calls corriendo ni esperando
 *  aprobación (P1 es síncrona dentro del turno); nunca se restaura un "Aprobar/Rechazar" activo. */
export type PersistedToolCallStatus = "success" | "error" | "rejected";

/** Plan P1 RESUELTO de una escritura (lo que el médico vio al aprobar/rechazar): se persiste
 *  completo para restaurar la tarjeta de la acción tal cual quedó. */
export interface PersistedToolCallPlan {
  actionType: string;
  targetResource: string;
  humanReadableSummary: string;
  exactPayload: Record<string, unknown>;
}

/**
 * Tool call del turno con el estado en que QUEDÓ, anclada al mensaje del asistente que cerró el
 * turno. Se persiste en ``payload.tools`` y al restaurar re-siembra las tarjetas de herramientas
 * bajo su mensaje (mismo render que en vivo). NO entra al contexto del modelo (el cable sólo lee
 * texto/imagen/toolNotes); es presentación durable del hilo.
 */
export interface PersistedToolCall {
  callId: string;
  name: string;
  kind: "read" | "write";
  status: PersistedToolCallStatus;
  /** Preview de los args tal como se mostró (las escrituras muestran el plan, no los args). */
  argsText?: string;
  /** Preview del resultado mostrado en la tarjeta (ya truncado en vivo). */
  resultText?: string;
  errorText?: string;
  /** Interfaz ui.* INTERACTIVA ya usada por el médico → se restaura contraída. */
  uiUsed?: boolean;
  /** Índice del spec que rindió esta call dentro de ``payload.ui.specs`` (tools ui.*): la
   *  interfaz se persiste UNA vez (sobre de UI) y aquí sólo se referencia. */
  uiSpecIndex?: number;
  plan?: PersistedToolCallPlan;
  /** Spec RESUELTO al restaurar (desde ``uiSpecIndex``); nunca se serializa (derivado). */
  uiSpec?: UiSpec;
}

function isPersistedToolCallPlan(value: unknown): value is PersistedToolCallPlan {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  return (
    typeof plan.actionType === "string" &&
    typeof plan.targetResource === "string" &&
    typeof plan.humanReadableSummary === "string" &&
    typeof plan.exactPayload === "object" &&
    plan.exactPayload !== null &&
    !Array.isArray(plan.exactPayload)
  );
}

/** Forma en lista blanca de una tool call persistida (mismo criterio gobernado que ``isUiSpec``):
 *  un payload viejo o manipulado degrada a "sin tarjetas", nunca rompe el sembrado. */
export function isPersistedToolCall(value: unknown): value is PersistedToolCall {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const call = value as Record<string, unknown>;
  return (
    typeof call.callId === "string" &&
    call.callId.length > 0 &&
    typeof call.name === "string" &&
    call.name.length > 0 &&
    (call.kind === "read" || call.kind === "write") &&
    (call.status === "success" || call.status === "error" || call.status === "rejected") &&
    (call.argsText === undefined || typeof call.argsText === "string") &&
    (call.resultText === undefined || typeof call.resultText === "string") &&
    (call.errorText === undefined || typeof call.errorText === "string") &&
    (call.uiUsed === undefined || typeof call.uiUsed === "boolean") &&
    (call.uiSpecIndex === undefined ||
      (typeof call.uiSpecIndex === "number" && Number.isInteger(call.uiSpecIndex) && call.uiSpecIndex >= 0)) &&
    (call.plan === undefined || isPersistedToolCallPlan(call.plan))
  );
}

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
  /** Tool calls del turno con su estado FINAL, ancladas al mensaje del asistente. Se persisten en
   *  ``payload.tools`` y al restaurar re-siembran las tarjetas bajo el mensaje (vía ``turnId``). */
  toolCalls?: readonly PersistedToolCall[];
  /** Ancla de las tool calls en el hilo. En vivo es el turno del gateway; al restaurar es
   *  SINTÉTICO (el uuid de la fila), suficiente para reagrupar mensaje ↔ tarjetas. */
  turnId?: string;
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
 * Extrae, GOBERNADAMENTE, las tool calls del sobre versionado ``payload.tools``: versión conocida
 * y sólo calls que pasen ``isPersistedToolCall``; el resto se descarta en silencio (hilos viejos
 * sin sobre degradan a texto plano, como hasta ahora). El campo derivado ``uiSpec`` de una call
 * serializada por error se ignora (se re-resuelve desde ``uiSpecIndex``).
 */
function toolCallsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): PersistedToolCall[] {
  const envelope = payload?.tools;
  if (typeof envelope !== "object" || envelope === null) {
    return [];
  }
  const { version, calls } = envelope as { version?: unknown; calls?: unknown };
  if (version !== UI_PAYLOAD_VERSION || !Array.isArray(calls)) {
    return [];
  }
  return calls
    .filter(isPersistedToolCall)
    .slice(0, MAX_TOOL_CALLS_PER_MESSAGE)
    .map((call) => {
      const clean = { ...call };
      delete clean.uiSpec;
      return clean;
    });
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
 * Si la fila trae UI generativa (``payload.ui``), cada spec válido NO REFERENCIADO por una tool
 * call se MATERIALIZA como un mensaje ``kind: "ui"`` propio ANTES del texto (retrocompatibilidad
 * con hilos sin sobre de tools). Sus ids sintéticos derivan del uuid de la fila
 * (``<uuid>:ui:<n>``): entran al set de persistidos del shell y no se reenvían. Los specs
 * referenciados (``uiSpecIndex`` del sobre ``payload.tools``) se ADJUNTAN a su call restaurada:
 * la interfaz vuelve DENTRO de su tarjeta de herramienta, como se vio en vivo.
 *
 * Si la fila trae tool calls (``payload.tools``), el mensaje base lleva un ``turnId`` SINTÉTICO
 * (el uuid de la fila) que re-ancla sus tarjetas bajo el mensaje, igual que en vivo.
 */
export function messagesToTranscript(rows: readonly PersistedMessageRow[]): TranscriptMessage[] {
  return [...rows]
    .sort((a, b) => a.sequence_index - b.sequence_index)
    .filter((row) => isTranscriptRole(row.role))
    .flatMap((row) => {
      const restored: TranscriptMessage[] = [];
      const payload = row.payload ?? undefined;

      const specs = uiSpecsFromPayload(payload);
      const toolCalls = toolCallsFromPayload(payload).map((call) => {
        if (call.uiSpecIndex === undefined) {
          return call;
        }
        const spec = specs[call.uiSpecIndex];
        return spec ? { ...call, uiSpec: spec } : call;
      });
      const referencedSpecIndices = new Set(
        toolCalls
          .map((call) => call.uiSpecIndex)
          .filter((index): index is number => index !== undefined),
      );

      for (const [index, spec] of specs.entries()) {
        if (referencedSpecIndices.has(index)) {
          continue;
        }
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
      // El mensaje base se restaura con texto o, aun vacío, si porta notas o tool calls: el turno
      // que sólo usó herramientas persiste su rastro; el render suprime la burbuja vacía.
      if (
        row.content.trim().length > 0 ||
        planNotes.length > 0 ||
        toolNotes.length > 0 ||
        toolCalls.length > 0
      ) {
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
        if (toolCalls.length > 0) {
          message.toolCalls = toolCalls;
          message.turnId = row.id;
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

/** ¿El mensaje lleva contenido persistible además del texto (UI generativa, notas o tool calls)? */
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
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
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
 * envelope null si el mensaje no lleva UI o si TODOS sus specs exceden los topes. El recorte es
 * determinista: se conservan los primeros N que quepan en el presupuesto de caracteres.
 * ``indexMap`` traduce índice ORIGINAL (en ``uiSpecs``) → índice FINAL en el sobre: las tool calls
 * referencian su spec por índice y el descarte de un spec intermedio los desplaza.
 */
function toUiEnvelope(message: TranscriptMessage): {
  envelope: { version: number; specs: UiSpec[] } | null;
  indexMap: ReadonlyMap<number, number>;
} {
  const source: readonly UiSpec[] =
    message.kind === "ui" && message.uiSpec ? [message.uiSpec] : (message.uiSpecs ?? []);
  const specs: UiSpec[] = [];
  const indexMap = new Map<number, number>();
  let budget = MAX_UI_PAYLOAD_CHARS;
  for (const [index, spec] of source.slice(0, MAX_UI_SPECS_PER_MESSAGE).entries()) {
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
    indexMap.set(index, specs.length);
    specs.push(spec);
  }
  return {
    envelope: specs.length > 0 ? { version: UI_PAYLOAD_VERSION, specs } : null,
    indexMap,
  };
}

/**
 * Serializa (con topes) las tool calls del mensaje al sobre versionado ``payload.tools``. El campo
 * derivado ``uiSpec`` nunca se serializa; ``uiSpecIndex`` se REMAPEA al índice final del sobre de
 * UI (si su spec fue descartado por tope, la referencia se elimina y la tarjeta restaurará sin
 * interfaz). Recorte determinista: las primeras N calls que quepan en el presupuesto.
 */
function toToolsEnvelope(
  message: TranscriptMessage,
  uiIndexMap: ReadonlyMap<number, number>,
): { version: number; calls: PersistedToolCall[] } | null {
  const calls: PersistedToolCall[] = [];
  let budget = MAX_TOOLS_PAYLOAD_CHARS;
  for (const source of (message.toolCalls ?? []).slice(0, MAX_TOOL_CALLS_PER_MESSAGE)) {
    const call = { ...source };
    delete call.uiSpec; // derivado de la restauración: nunca se serializa
    const mapped =
      call.uiSpecIndex === undefined ? undefined : uiIndexMap.get(call.uiSpecIndex);
    if (mapped === undefined) {
      delete call.uiSpecIndex;
    } else {
      call.uiSpecIndex = mapped;
    }
    if (call.argsText !== undefined) {
      call.argsText = call.argsText.slice(0, MAX_TOOL_CALL_TEXT_CHARS);
    }
    if (call.resultText !== undefined) {
      call.resultText = call.resultText.slice(0, MAX_TOOL_CALL_TEXT_CHARS);
    }
    if (call.errorText !== undefined) {
      call.errorText = call.errorText.slice(0, MAX_TOOL_CALL_TEXT_CHARS);
    }
    let size: number;
    try {
      size = JSON.stringify(call).length;
    } catch {
      continue; // Call no serializable (no debería ocurrir): se descarta, el resto persiste igual.
    }
    if (size > budget) {
      continue;
    }
    budget -= size;
    calls.push(call);
  }
  return calls.length > 0 ? { version: UI_PAYLOAD_VERSION, calls } : null;
}

/**
 * Arma el cuerpo de alta de un mensaje. Guarda ``reasoning``/``isError``/``note`` y los sobres de
 * UI generativa (``payload.ui``) y de tool calls (``payload.tools``) en el payload estructurado,
 * para poder restaurarlos al recargar el hilo. ``payload`` se omite si no hay metadatos que
 * guardar.
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
  const { envelope: ui, indexMap } = toUiEnvelope(message);
  if (ui) {
    meta.ui = ui;
  }
  const tools = toToolsEnvelope(message, indexMap);
  if (tools) {
    meta.tools = tools;
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
