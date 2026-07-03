"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AnimatedOrb } from "@/components/ui/AnimatedOrb";
import { Markdown } from "@/components/copilot/Markdown";
import { MessageActions } from "@/components/copilot/MessageActions";
import { ResourceActionConfirmDialog } from "@/components/resources/ResourceActionConfirmDialog";
import { ProviderIcon } from "@/components/copilot/ProviderIcon";
import { avatarColor } from "@/components/ui/avatar-color";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  AgentClient,
  getAgentGatewayUrl,
  type ConnectionStatus,
} from "@/core/agent/agent-client";
import {
  failInFlightTurn,
  initialTurnState,
  reduceTurnEvent,
  type TurnState,
} from "@/core/agent/turn-reducer";
import {
  initialReconnectState,
  reduceReconnect,
  type ReconnectEvent,
  type ReconnectState,
} from "@/core/agent/reconnect-machine";
import type {
  GatewayProtocol,
  NormalizedReasoningEffort,
  ServerEvent,
  WireContentPart,
  WireMessage,
  WireModel,
  WireProviderStatus,
} from "@/core/agent/protocol";
import { turnFailureMessage } from "@/core/agent/turn-error";
import { loadPreferredModelId, savePreferredModelId } from "@/core/agent/model-preference";
import {
  APPROVAL_APPROVE_LABEL,
  APPROVAL_REJECT_LABEL,
  COPILOT_TRANSCRIPT_LABEL,
  approvalRegionProps,
} from "@/components/copilot/a11y";
import { useCopilotDictation } from "@/core/audio-transcription/use-copilot-dictation";
import { formatDuration } from "@/core/audio-transcription/recorder";
import { executeTool, resolveToolCall } from "@/core/agent/tools/tool-runner";
import {
  listTools,
  toWireToolDefinitions,
  defaultToolContext,
  type ToolDefinition,
} from "@/core/agent/tools/registry";
import {
  buildToolCatalog,
  creatableResources,
  effectiveTools,
  type ToolCatalogEntry,
} from "@/core/agent/tool-catalog";
import { buildStartSuggestions } from "@/core/agent/start-suggestions";
import { loadMcpTools } from "@/core/agent/mcp/mcp-tools";
import { loadPharmacologyTools } from "@/core/agent/pharmacology/pharmacology-tools";
import {
  ApprovalStore,
  applyApprovalDecision,
  buildClinicalActionPlan,
  type ClinicalActionPlan,
} from "@/core/agent/approval-protocol";
import {
  buildRejectedWriteNote,
  buildToolUsageNote,
  toolNotesContextText,
} from "@/core/agent/tool-notes";
import {
  fetchRecall,
  recallIndicatorText,
} from "@/core/agent/memory-recall";
import {
  activeContextChipText,
  buildActiveContextMessage,
  recallScopeFor,
  type ActiveClinicalContext,
} from "@/core/agent/active-context";
import { ActiveContextPicker } from "@/components/copilot/ActiveContextPicker";
import {
  compactContext,
  consolidateApprovedPlans,
  contextUsage,
  effectiveContextWindow,
  estimateTokens,
  estimateToolSchemaTokens,
  messageText,
  usableInputTokens,
  type ContextSegment,
  type ContextUsage,
} from "@/core/agent/context-window";
import {
  addUsage,
  computeCost,
  emptyUsage,
  formatCost,
  formatTokens,
  resolvePricing,
  totalTokens,
  usageFromWire,
  type CostBreakdown,
  type ModelCostRate,
  type NormalizedUsage,
} from "@/core/agent/usage-cost";
import { listAgentMemories } from "@/core/agent-memories/agent-memories-client";
import { getAgentPersona } from "@/core/agent-persona/agent-persona-client";
import { composeLeadingLayers, type PersonaFields } from "@/core/agent/persona";
import { buildPatientSummaryMessage } from "@/core/agent/patient-summary";
import { getPatientSummary } from "@/core/agent/patient-summary-client";
import { browserApi } from "@/core/api/browser-client";
import type { ResourceCatalog, SessionUser } from "@/core/api/contracts";
import { isUiSpec, type UiSpec } from "@/core/agent/tools/ui-spec";
import { GeneratedUi } from "@/components/copilot/GeneratedUi";
import { parseComposerPalette, type ComposerCommand } from "@/core/chat-shell/composer-commands";
import { approvedPlanNotesOf, type PersistedToolCall } from "@/core/chat-shell/chat-persistence";
import { useChatNavOptional } from "@/components/chat-shell/ChatNavProvider";
import { deriveResourceTools } from "@/core/agent/tools/contract-tools";

/** Candidato seguro de la búsqueda de pacientes (proyección de GET /patients/search, 0113). */
interface PatientSearchCandidate {
  id: string;
  full_name: string;
  age: number;
  sex: string;
  phone_masked?: string | null;
}

/** Imagen adjunta a un mensaje: data URL para previsualizar + base64 puro para el cable. */
interface AttachedImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  // "note" = nota de CONTEXTO (acción humana inline, p. ej. crear/editar un recurso desde el
  // expediente). No es un turno: se muestra distinta y entra al contexto del próximo turno. Su rol
  // de cable es "user" (acción del médico registrada), pero NO dispara una llamada al modelo.
  // "ui" = UI inyectada por el médico (p. ej. el formulario oficial de un recurso al pulsar
  // "Nuevo"/"Editar" en el expediente); se renderiza con GeneratedUi en el hilo.
  kind?: "note" | "ui";
  // UiSpec a renderizar cuando kind === "ui" (formulario del recurso abierto desde el expediente).
  uiSpec?: UiSpec;
  // Specs de las tools ``ui.*`` del turno, anclados al mensaje del asistente que lo cerró. NO se
  // renderizan aquí (en vivo los muestra TurnToolCalls): existen para PERSISTIRSE con el mensaje
  // (payload.ui) y restaurarse gobernados al recargar, como mensajes kind "ui". No agrandan el
  // contexto del modelo (el historial de cable sólo lleva el texto).
  uiSpecs?: readonly UiSpec[];
  // Notas deterministas de los planes P1 aprobados y ejecutados en el turno, ancladas igual que
  // los specs. Se persisten (payload.approved_plans) y al recargar re-siembran los segmentos
  // ``preserve`` de la compactación: el modelo no olvida qué escribió ni con qué ids.
  approvedPlanNotes?: readonly string[];
  // Notas del USO DE HERRAMIENTAS del turno (lecturas, meta-tools, MCP, sandbox y escrituras P1
  // rechazadas), ancladas al mensaje del asistente. Se persisten (payload.tool_notes) y entran al
  // contexto de los turnos siguientes como bloque adyacente COMPACTABLE (no ``preserve``): el
  // modelo recuerda QUÉ consultó/mostró/le rechazaron, sin arrastrar resultados crudos.
  toolNotes?: readonly string[];
  image?: AttachedImage;
  isError?: boolean;
  // Resumen de razonamiento del turno (proveedores con thinking). Se muestra colapsado
  // bajo la respuesta del asistente, como en OpenClaw.
  reasoning?: string;
  // Turno del gateway que produjo este mensaje del asistente: ancla sus tool calls al lugar del
  // hilo donde ocurrieron. Al restaurar el hilo es SINTÉTICO (el uuid de la fila persistida).
  turnId?: string;
  // Tool calls del turno con su estado FINAL, ancladas al mensaje que cerró el turno. En vivo el
  // render usa el estado ``toolCalls`` del panel (por ``turnId``); este campo existe para
  // PERSISTIRSE con el mensaje (payload.tools) y re-sembrar las tarjetas al recargar, tal cual
  // quedaron. No entra al contexto del modelo (el cable sólo lleva texto/imagen/toolNotes).
  toolCalls?: readonly PersistedToolCall[];
}

type ToolCallStatus = "running" | "awaiting_approval" | "success" | "error" | "rejected";

interface ToolCallView {
  callId: string;
  turnId: string;
  name: string;
  kind: "read" | "write";
  argsText: string;
  status: ToolCallStatus;
  // Solo escrituras: plan canónico aprobado/rechazado por el médico (P1).
  plan?: ClinicalActionPlan;
  resultText?: string;
  resultContent?: unknown;
  errorText?: string;
  // Solo tools ui.* INTERACTIVAS (formularios/botones/paneles de revisión): el médico ya las usó
  // (envió/confirmó/hizo clic) → la tarjeta se contrae al grupo de herramientas del turno. Las de
  // visualización (gráficas/reportes) nunca se marcan como usadas: quedan visibles en el hilo.
  uiUsed?: boolean;
}

const TOOL_STATUS: Record<ToolCallStatus, { label: string; tone: BadgeTone }> = {
  running: { label: "Ejecutando…", tone: "info" },
  awaiting_approval: { label: "Requiere aprobación", tone: "warn" },
  success: { label: "Completada", tone: "ok" },
  error: { label: "Error", tone: "danger" },
  rejected: { label: "Rechazada", tone: "neutral" },
};

// Sugerencias de inicio del chat (pills, fiel a las del diseño). Sólo se muestran con el chat vacío
// y rellenan el composer para que el médico las revise/edite antes de enviar (no se autoenvían).
const PATIENT_SUGGESTIONS: readonly string[] = [
  "¿Tiene alergias registradas?",
  "Dame un resumen del paciente",
  "¿Qué medicación toma actualmente?",
  "¿Cuáles son sus últimos signos vitales?",
];
const GLOBAL_SUGGESTIONS: readonly string[] = [
  "¿Cómo van las consultas de esta semana?",
  "Muéstrame una gráfica de la actividad reciente",
  "Pacientes con alergias registradas",
  "¿Qué tengo en la agenda de hoy?",
];

function previewContent(value: unknown): string {
  // OJO: JSON.stringify devuelve ``undefined`` (no un string) para undefined/función/símbolo —
  // p. ej. código del sandbox que no retorna nada—; se cae a String(value) ("undefined"), que es
  // la representación fiel de ese resultado.
  let text: string | undefined;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  const safe = text ?? String(value);
  return safe.length > 800 ? `${safe.slice(0, 800)}…` : safe;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "Inactivo",
  connecting: "Conectando…",
  connected: "Conectado",
  unavailable: "Gateway no disponible",
};

const STATUS_TONE: Record<ConnectionStatus, BadgeTone> = {
  idle: "neutral",
  connecting: "info",
  connected: "ok",
  unavailable: "danger",
};

// Aviso al fallar un turno en vuelo por caída de conexión: el médico re-inicia (nunca se reenvía).
const CONNECTION_INTERRUPTED_NOTICE =
  "Se interrumpió la conexión con el copiloto; el turno en curso se detuvo. Vuelve a enviar tu " +
  "consulta cuando se restablezca la conexión.";
// Cuánto se muestra el aviso transitorio "Reconectado" tras una reconexión exitosa.
const RECONNECTED_NOTICE_MS = 5000;

/**
 * Etiqueta/tono visibles del estado de reconexión, derivados de la máquina pura (+ aviso
 * transitorio "Reconectado"). Todo en español; visible pero no intrusivo.
 */
function reconnectBadge(
  state: ReconnectState,
  reconnected: boolean,
): { label: string; tone: BadgeTone } {
  switch (state.phase) {
    case "connecting":
      return { label: state.attempts > 0 ? "Reintentando…" : "Conectando…", tone: "info" };
    case "connected":
      return reconnected
        ? { label: "Reconectado", tone: "ok" }
        : { label: "Conectado", tone: "ok" };
    case "reconnecting":
      return { label: "Reintentando…", tone: "danger" };
    case "failed":
      return { label: "Sin conexión", tone: "danger" };
    default:
      return { label: "Inactivo", tone: "neutral" };
  }
}

export function CopilotPanel({
  activeContext: controlledContext,
  onActiveContextChange,
  embedded = false,
  initialMessages,
  onMessagesChange,
  onMessagesRemoved,
  onTruncateFrom,
  onMessageUpdated,
}: Readonly<{
  // Contexto clínico activo CONTROLADO por el host (p. ej. el shell chat-first: paciente=chat).
  // Si se omite (uso independiente en /copilot), el panel lo gestiona internamente como antes.
  activeContext?: ActiveClinicalContext | null;
  onActiveContextChange?: (context: ActiveClinicalContext | null) => void;
  // Modo EMBEBIDO (shell chat-first, fiel a MediCopilot.dc.html): chat LIMPIO sin cromo inline
  // (encabezado, banner de borrador, panel de herramientas, barra de costo, borde de tarjeta). Esas
  // garantías/herramientas/costo se mueven a un MODAL accesible desde el botón de escudo del composer.
  // Sin ``embedded`` (ruta /copilot independiente) se conserva el cromo completo de siempre.
  embedded?: boolean;
  // PERSISTENCIA DEL HILO (MP-CTRL-0123): historial inicial con el que SEMBRAR el transcript al
  // abrir un chat (mensajes ya persistidos del backend). El host remonta el panel con ``key`` por
  // conversación, así el sembrado se reaplica al cambiar de chat. Si se omite, arranca vacío.
  initialMessages?: readonly ChatMessage[];
  // Notifica al host el transcript completo en cada cambio, para que persista los mensajes nuevos
  // (append). Persistir el transcript NO es una escritura clínica (no pasa por P1).
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
  // GESTIÓN DEL HISTORIAL: el panel quita mensajes del transcript local y notifica al host para
  // que propague la baja lógica al backend (sin host, la limpieza es sólo local). Borrar historial
  // de chat no toca datos clínicos.
  onMessagesRemoved?: (messageIds: readonly string[]) => void;
  // Truncado desde un mensaje (inclusive) hasta el final: lo usan "reiniciar desde aquí" y también
  // Recrear/Editar (que recortan el hilo local; sin propagarlo, lo recortado reaparecería al
  // recargar). El reinicio del hilo COMPLETO no vive aquí: es una opción del sidebar (menú de
  // opciones del chat), que el ChatShell resuelve remontando el panel vacío.
  onTruncateFrom?: (messageId: string) => void;
  // ESTADO DURABLE de un mensaje YA persistido que cambió DESPUÉS del append (hoy: una interfaz
  // ui.* marcada como usada → su tarjeta debe restaurarse contraída). El host re-persiste el
  // payload del mensaje (PATCH); sin host, el cambio es sólo de la sesión.
  onMessageUpdated?: (message: ChatMessage) => void;
}> = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  // Estado de la máquina de reconexión (resiliencia del WS). Se refleja en la UI; el ref es la
  // fuente de verdad para los callbacks/temporizadores (closures con deps vacías).
  const [reconnect, setReconnect] = useState<ReconnectState>(initialReconnectState);
  const [reconnected, setReconnected] = useState(false);
  const [models, setModels] = useState<WireModel[]>([]);
  const [providers, setProviders] = useState<WireProviderStatus[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  // Popup inline del selector de modelo dentro del composer (A9 del rediseño): el modelo deja de
  // ocupar una tarjeta voluminosa arriba y se elige desde un botón compacto en la barra del composer.
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  // Modal de "Garantías del copiloto" (modo embebido): aloja el aviso de borrador, el catálogo de
  // herramientas y el uso/costo, fuera del flujo del chat (botón de escudo en el composer).
  const [safetyOpen, setSafetyOpen] = useState(false);
  // Paletas "/" del composer (D1): resultados de la búsqueda de pacientes ("/paciente <texto>").
  const [patientResults, setPatientResults] = useState<PatientSearchCandidate[]>([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  // Notas de contexto (acciones humanas del expediente/tabla/agenda): se consumen del shell y se
  // añaden al hilo SIN disparar un turno. El consumo es POR ID y DIRIGIDO (``note.target``): este
  // chat sólo toma las suyas; las dirigidas a otro paciente permanecen en cola hasta abrir su chat.
  // ``consumedNoteIdsRef`` evita el doble-append entre el timeout y la retirada de la cola.
  const chatNav = useChatNavOptional();
  const contextNotes = chatNav?.contextNotes ?? null;
  const consumedNoteIdsRef = useRef<Set<number>>(new Set());
  // Formularios inyectados desde el expediente (botones Nuevo/Editar). Consumo POR ID con
  // retirada de la cola y filtro por ``target``, mismo patrón que las notas de contexto: una marca
  // de agua local se reiniciaba al remontar el panel por conversación y re-consumía formularios
  // ajenos que seguían en la cola compartida (reinyección cruzada entre chats).
  const chatForms = chatNav?.chatForms ?? null;
  const consumedFormIdsRef = useRef<Set<number>>(new Set());
  // Esfuerzo de razonamiento NORMALIZADO por turno (P5). Solo se ofrece/envía cuando el modelo
  // negociado soporta el control; default "medium" (se omite en modelos sin razonamiento).
  const [reasoningEffort, setReasoningEffort] = useState<NormalizedReasoningEffort>("medium");
  // Sembrado con el historial persistido (si lo hay). El host remonta por conversación (key), así
  // este inicializador se re-evalúa al abrir otro chat. Los ids sembrados son los del backend (uuid).
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages ? [...initialMessages] : [],
  );
  const [turn, setTurn] = useState<TurnState>(initialTurnState());
  // Sembrado con las tool calls RESTAURADAS del historial (payload.tools de cada mensaje): las
  // tarjetas vuelven bajo su mensaje (turnId sintético) con el estado en que quedaron.
  const [toolCalls, setToolCalls] = useState<ToolCallView[]>(() =>
    toolCallViewsFromMessages(initialMessages ?? []),
  );
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  // Dictado continuo (envío por fragmentos): cola (ref) de fragmentos transcritos pendientes de
  // mandar al copiloto. Se vacían cuando el copiloto está libre (un turno por descarga; si varios
  // se acumularon mientras procesaba, se unen para no encolar de más). El cuadro de mensaje queda
  // libre para que el médico escriba su propia respuesta mientras se sigue grabando.
  const dictationQueueRef = useRef<string[]>([]);
  const sendUserTurnRef = useRef<(text: string) => void>(() => {});

  // Gating por rol (tool-hardening): recursos en los que el médico puede crear (del catálogo
  // permission-projected). Las escrituras se filtran ANTES de declararlas al modelo. Vacío
  // por defecto: hasta cargar el catálogo no se ofrece ninguna escritura (defensa en
  // profundidad; FastAPI revalida igual). ``toolCatalog`` es la vista de procedencia/auditoría.
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogEntry[]>([]);
  const creatableRef = useRef<Set<string>>(new Set());
  // Permisos de la sesión (/auth/me): gate alternativo ``requiredPermissions`` de las escrituras
  // cuyo recurso no publica formulario genérico en el catálogo (p. ej. scale_results).
  const grantedRef = useRef<Set<string>>(new Set());
  // MCP: tools descubiertas del servidor MCP configurado. Se surfacean por el MISMO camino
  // (catálogo + gating + procedencia) y son EJECUTABLES: las de lectura corren directo y las de
  // escritura pasan por la aprobación P1, igual que cualquier otra tool. ``mcpToolsRef`` mira el
  // estado para los closures de los handlers del turno (deps vacías).
  const [mcpTools, setMcpTools] = useState<ToolDefinition[]>([]);
  const mcpToolsRef = useRef<ToolDefinition[]>([]);
  // Tools DERIVADAS DEL CONTRATO (F6): se generan del catálogo /resources al cargarlo, con
  // precedencia de las hand-written. Se incluyen en la declaración al modelo, el descubrimiento y la
  // resolución al ejecutar. Backend cambia → próxima carga → tools nuevas, sin tocar el front.
  const derivedToolsRef = useRef<ToolDefinition[]>([]);

  // RECALL (P2): nº de memorias del médico inyectadas en el último turno, para el indicador
  // de contexto. ``null`` = aún no hay turno con recall. Las memorias viajan como contexto NO
  // confiable; nunca como instrucciones (ver memory-recall).
  const [recalledCount, setRecalledCount] = useState<number | null>(null);

  // CONTEXTO CLÍNICO ACTIVO: paciente (y consulta opcional) sobre los que asiste el copiloto.
  // Acota el recall (P2) y se SURFACEA en el turno y el chip indicador. Sólo fija el ámbito (no
  // carga PHI del expediente). Ref para usarlo en los handlers del turno (closures con deps vacías).
  // Controlado o no: si el host pasa ``activeContext`` (aunque sea null), manda; si no, estado
  // interno (comportamiento original de /copilot intacto).
  const isContextControlled = controlledContext !== undefined;
  const [internalContext, setInternalContext] = useState<ActiveClinicalContext | null>(null);
  const activeContext = isContextControlled ? controlledContext : internalContext;
  const setActiveContext = (next: ActiveClinicalContext | null): void => {
    if (!isContextControlled) {
      setInternalContext(next);
    }
    onActiveContextChange?.(next);
  };
  const activeContextRef = useRef<ActiveClinicalContext | null>(null);

  // CONTEXTO (P3): contabilidad usado/presupuesto para el indicador, y aviso de compactación.
  // ``usage`` se actualiza con la estimación local al enviar y con el usage REPORTADO por el
  // gateway al completar el turno. ``compaction`` describe la última compactación (si la hubo).
  const [contextStats, setContextStats] = useState<ContextUsage | null>(null);
  const [compaction, setCompaction] = useState<{ dropped: number; preservedIds: string[] } | null>(
    null,
  );
  // Notas de los planes APROBADOS del hilo (texto determinista con recurso/acción/id creado).
  // Se SIEMBRAN desde el historial persistido (payload.approved_plans de cada mensaje): sin
  // esto, tras recargar el modelo olvidaba qué escribió y con qué ids. Al armar cada turno,
  // ``consolidateApprovedPlans`` las convierte en segmentos ``preserve`` con TOPE (las recientes
  // verbatim; las viejas, un bloque consolidado de identificadores): el costo de contexto de las
  // aprobaciones queda acotado aunque el hilo acumule cientos.
  const [seededPlanNotes] = useState<string[]>(() =>
    approvedPlanNotesOf(initialMessages ?? []),
  );
  const approvedPlanNotesRef = useRef<string[]>(seededPlanNotes);
  // Notas de plan del turno EN VUELO, para anclarlas al mensaje del asistente al cerrar (y que
  // se persistan con él). Clave = turnId.
  const turnPlanNotesRef = useRef<Map<string, string[]>>(new Map());
  // Notas de USO DE HERRAMIENTAS del turno EN VUELO (lecturas, meta-tools, MCP, sandbox y
  // rechazos P1): mismas mecánicas que las de plan (anclar al cerrar + persistir), pero entran al
  // contexto como bloque COMPACTABLE adyacente al mensaje, no como segmento preserve.
  const turnToolNotesRef = useRef<Map<string, string[]>>(new Map());
  const noteToolUsage = (turnId: string, note: string): void => {
    const notes = turnToolNotesRef.current.get(turnId) ?? [];
    turnToolNotesRef.current.set(turnId, [...notes, note]);
  };
  // Presupuesto del modelo seleccionado (ventana efectiva + input usable), para usarlo dentro
  // de los handlers del turno (closures con deps vacías).
  const budgetRef = useRef<{ window: number; usable: number }>({ window: 0, usable: 0 });
  // USO/COSTO (P7): acumulado de tokens de la sesión (este médico) y la tarifa del modelo
  // seleccionado. Refs para usarlos en los handlers del turno (closures con deps vacías).
  const sessionUsageRef = useRef<NormalizedUsage>(emptyUsage());
  const pricingRef = useRef<ModelCostRate | null>(null);
  // Protocolo del modelo en uso (para mapear errores específicos del proveedor a un mensaje
  // amistoso, p. ej. el 401 de inferencia de opencode Zen). Ref por el mismo motivo que arriba.
  const protocolRef = useRef<GatewayProtocol | null>(null);
  // Indicador de uso/costo: tokens y costo estimado de ESTE turno + acumulado de la sesión.
  // ``null`` hasta el primer turno completado. El costo es null cuando el precio es desconocido.
  const [usageStats, setUsageStats] = useState<{
    turnTokens: NormalizedUsage;
    sessionTokens: NormalizedUsage;
    turnCost: CostBreakdown | null;
    sessionCost: CostBreakdown | null;
  } | null>(null);
  // PERSONA (P4): capa configurable del médico (tono/especialidad/idioma/estilo). La capa de
  // SEGURIDAD clínica es fija y la posee el código (persona.ts); no se almacena ni se edita.
  const personaRef = useRef<PersonaFields | null>(null);

  const clientRef = useRef<AgentClient | null>(null);
  // Reconexión: estado de la máquina (fuente de verdad para callbacks), temporizadores del
  // backoff y del aviso "Reconectado", y un dispatch estable para el botón "Reconectar".
  const reconnectRef = useRef<ReconnectState>(initialReconnectState());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDispatchRef = useRef<((event: ReconnectEvent) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const turnRef = useRef<TurnState>(initialTurnState());
  const idRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Protocolo de aprobación clínica (P1): store de solicitudes pendientes (plan inmutable)
  // + el mapeo callId -> requestId/tool para ejecutar EXACTAMENTE lo aprobado. Vive en el
  // navegador del médico; el plan con el payload clínico nunca viaja al gateway.
  const approvalStoreRef = useRef<ApprovalStore>(new ApprovalStore());
  const pendingWritesRef = useRef<
    Map<string, { requestId: string; tool: ToolDefinition; turnId: string }>
  >(new Map());

  const nextId = (): string => {
    idRef.current += 1;
    return `m${idRef.current}`;
  };

  // Espejo síncrono de las tool calls para los handlers de eventos (closures con deps vacías):
  // al cerrar el turno se leen de aquí los specs ``ui.*`` a anclar en el mensaje del asistente.
  // Arranca con el MISMO sembrado que el estado (el argumento sólo cuenta en el primer render).
  const toolCallsRef = useRef<ToolCallView[]>(toolCalls);

  const upsertToolCall = (view: ToolCallView): void => {
    toolCallsRef.current = [...toolCallsRef.current, view];
    setToolCalls((prev) => [...prev, view]);
  };

  const patchToolCall = (callId: string, patch: Partial<ToolCallView>): void => {
    toolCallsRef.current = toolCallsRef.current.map((call) =>
      call.callId === callId ? { ...call, ...patch } : call,
    );
    setToolCalls((prev) =>
      prev.map((call) => (call.callId === callId ? { ...call, ...patch } : call)),
    );
  };

  // USO de interfaces generadas: al enviar/confirmar/hacer clic, la tool ui.* INTERACTIVA se marca
  // usada y su tarjeta se contrae al grupo de herramientas del turno. Las de visualización
  // (gráficas/reportes) nunca se contraen (isInlineToolCall las mantiene completas aunque se marquen).
  // El uso también se refleja en el mensaje ancla (message.toolCalls) y se notifica al host: como
  // ocurre DESPUÉS de que el mensaje se guardó (append-only), el host re-persiste su payload para
  // que la interfaz vuelva CONTRAÍDA al recargar (estado durable, no sólo de la sesión).
  const markUiUsed = (callId: string): void => {
    const call = toolCallsRef.current.find((entry) => entry.callId === callId);
    if (!call || call.uiUsed) {
      return;
    }
    patchToolCall(callId, { uiUsed: true });
    const anchor = messagesRef.current.find(
      (message) =>
        message.turnId === call.turnId &&
        message.toolCalls?.some((entry) => entry.callId === callId),
    );
    if (!anchor?.toolCalls) {
      return;
    }
    const updated: ChatMessage = {
      ...anchor,
      toolCalls: anchor.toolCalls.map((entry) =>
        entry.callId === callId ? { ...entry, uiUsed: true } : entry,
      ),
    };
    setMessages((prev) =>
      prev.map((message) => (message.id === anchor.id ? updated : message)),
    );
    onMessageUpdated?.(updated);
  };

  // Mensajes "ui" (formularios inyectados desde el expediente o restaurados del historial) ya
  // USADOS en esta sesión: se contraen a un resumen expandible. Efímero (no se persiste): al
  // recargar, la interfaz restaurada vuelve expandida.
  const [usedUiMessageIds, setUsedUiMessageIds] = useState<ReadonlySet<string>>(new Set());
  const markUiMessageUsed = (messageId: string): void => {
    setUsedUiMessageIds((prev) => {
      if (prev.has(messageId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  };

  useEffect(() => {
    messagesRef.current = messages;
    // Notifica al host para que persista los mensajes nuevos (append). El host diffea contra los
    // ids ya persistidos; el sembrado inicial no genera reenvíos (sus ids ya están marcados).
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  // Consume las notas de contexto pendientes (acciones humanas inline) y las añade al hilo SIN
  // disparar un turno: se muestran, se persisten y entran al contexto del próximo turno. El append
  // ocurre en un microtimeout (no setState síncrono en el efecto) y avanza la marca recién al
  // aplicarse, para ser idempotente bajo StrictMode (doble invocación de efectos en dev).
  useEffect(() => {
    if (!contextNotes || contextNotes.length === 0) {
      return;
    }
    // Sólo las notas de ESTE chat: comodín (target undefined = acción inline del chat activo) o
    // destinatario exacto (paciente activo, o null para el chat global). Las demás siguen en cola.
    const activePatient = activeContext?.patientId ?? null;
    const fresh = contextNotes.filter(
      (note) =>
        !consumedNoteIdsRef.current.has(note.id) &&
        (note.target === undefined || note.target === activePatient),
    );
    if (fresh.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const ids = fresh.map((note) => note.id);
      for (const id of ids) {
        consumedNoteIdsRef.current.add(id);
      }
      setMessages((prev) => [
        ...prev,
        ...fresh.map((note) => ({
          id: nextId(),
          role: "user" as const,
          kind: "note" as const,
          text: note.text,
        })),
      ]);
      // Retira de la cola compartida las notas ya añadidas (consumo por id: las de otros chats
      // no se tocan). El guard de ``consumedNoteIdsRef`` cubre la ventana hasta el re-render.
      chatNav?.consumeContextNotes(ids);
    }, 0);
    return () => clearTimeout(timer);
  }, [contextNotes, activeContext, chatNav]);

  // Consume los formularios inyectados desde el expediente (botones Nuevo/Editar) y los añade al hilo
  // como mensajes "ui" (el formulario oficial del recurso, renderizado con GeneratedUi). No dispara un
  // turno del modelo: el médico lo completa y al Guardar escribe directo (su acto de aprobación).
  // Consumo POR ID + ``target`` + retirada de la cola (patrón de las notas de contexto): sólo los
  // formularios de ESTE chat, una sola vez, idempotente bajo StrictMode.
  useEffect(() => {
    if (!chatForms || chatForms.length === 0) {
      return;
    }
    const activePatient = activeContext?.patientId ?? null;
    const fresh = chatForms.filter(
      (form) =>
        !consumedFormIdsRef.current.has(form.id) &&
        (form.target === undefined || form.target === activePatient),
    );
    if (fresh.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const ids = fresh.map((form) => form.id);
      for (const id of ids) {
        consumedFormIdsRef.current.add(id);
      }
      setMessages((prev) => [
        ...prev,
        ...fresh.map((form) => ({
          id: nextId(),
          role: "assistant" as const,
          kind: "ui" as const,
          uiSpec: form.spec,
          text: "",
        })),
      ]);
      // Retira de la cola compartida los formularios ya renderizados: sin esto, el siguiente chat
      // abierto (panel remontado) los re-consumía. Los dirigidos a otro chat no se tocan.
      chatNav?.consumeChatForms(ids);
    }, 0);
    return () => clearTimeout(timer);
  }, [chatForms, activeContext, chatNav]);

  // Mantiene el ref del contexto activo en sincronía para los handlers del turno (closures).
  useEffect(() => {
    activeContextRef.current = activeContext;
  }, [activeContext]);

  // RESUMEN DEL PACIENTE (contexto): mensaje de cable ya formateado del expediente del paciente
  // activo. Se refresca al FIJAR el paciente y cuando el expediente CAMBIA (tras una escritura
  // aprobada), NO en cada turno: entre refrescos el bloque es idéntico y el prefijo cacheado del
  // proveedor sigue caliente. El fetch reusa datos del servidor (no recarga el historial local).
  const patientSummaryMsgRef = useRef<WireMessage | null>(null);
  const refreshPatientSummary = async (): Promise<void> => {
    const patientId = activeContextRef.current?.patientId ?? null;
    if (!patientId) {
      patientSummaryMsgRef.current = null;
      return;
    }
    try {
      const summary = await getPatientSummary(patientId);
      // El paciente pudo cambiar mientras se resolvía el fetch: sólo aplica si sigue vigente.
      if (activeContextRef.current?.patientId === patientId) {
        patientSummaryMsgRef.current = buildPatientSummaryMessage(summary);
      }
    } catch {
      // No bloquea el turno: sin resumen simplemente no se inyecta ese bloque.
      patientSummaryMsgRef.current = null;
    }
  };
  // Al cambiar el paciente activo se refresca (o se limpia si no hay paciente).
  useEffect(() => {
    void refreshPatientSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.patientId]);

  // Sugerencias de inicio DERIVADAS de las tools disponibles (RBAC) + muestreo aleatorio; si aún
  // no hay catálogo o ninguna elegible, caen a la lista fija. Derivación en render (useMemo), no
  // estado+efecto: con el catálogo vacío (SSR y primer render del cliente) ninguna sugerencia es
  // elegible —todas exigen tools— y cae DETERMINISTA a la lista fija, así que Math.random solo
  // corre tras la hidratación, cuando llega el catálogo (sin mismatch). Se muestran únicamente
  // con el chat vacío (ver render), por lo que recomputar durante la conversación es invisible.
  const startSuggestions = useMemo(() => {
    const ctx = activeContext ? "patient" : "global";
    const dynamic = buildStartSuggestions(toolCatalog, ctx, 4);
    return dynamic.length > 0
      ? dynamic
      : [...(activeContext ? PATIENT_SUGGESTIONS : GLOBAL_SUGGESTIONS)];
  }, [toolCatalog, activeContext]);

  // Espeja las tools MCP en un ref para los handlers del turno (closures con deps vacías).
  useEffect(() => {
    mcpToolsRef.current = mcpTools;
  }, [mcpTools]);

  // Mantiene el presupuesto de contexto del modelo seleccionado (ventana efectiva + usable) y
  // su tarifa de precio (para el costo estimado P7).
  useEffect(() => {
    const model = models.find((entry) => entry.id === selectedModel);
    budgetRef.current = {
      window: effectiveContextWindow(model?.capabilities),
      usable: usableInputTokens(model?.capabilities),
    };
    pricingRef.current = resolvePricing(model);
    protocolRef.current = model?.protocol ?? null;
  }, [models, selectedModel]);

  // Carga el catálogo de recursos (permission-projected) para gatear las tools de escritura
  // por rol y mostrar la procedencia, junto con los permisos de la sesión (gate alternativo
  // ``requiredPermissions``). Si falla, queda vacío -> ninguna escritura se ofrece.
  useEffect(() => {
    let active = true;
    Promise.all([
      browserApi<ResourceCatalog>("/api/v1/resources"),
      // Si /auth/me falla, se degrada a "sin permisos extra" sin tirar el catálogo.
      browserApi<SessionUser>("/api/v1/auth/me").catch(() => null),
    ])
      .then(([catalog, session]) => {
        if (!active) return;
        const creatable = creatableResources(catalog);
        const granted = new Set(session?.permissions ?? []);
        creatableRef.current = creatable;
        grantedRef.current = granted;
        // Deriva las tools genéricas del contrato (precedencia: las hand-written de listTools ganan).
        const derived = deriveResourceTools(catalog, listTools());
        derivedToolsRef.current = derived;
        const tools = [...listTools(), ...derived, ...mcpTools];
        setToolCatalog(buildToolCatalog(tools, creatable, granted));
      })
      .catch(() => {
        if (!active) return;
        creatableRef.current = new Set();
        grantedRef.current = new Set();
        derivedToolsRef.current = [];
        const tools = [...listTools(), ...mcpTools];
        setToolCatalog(buildToolCatalog(tools, new Set()));
      });
    return () => {
      active = false;
    };
    // Se recompone cuando llegan las tools MCP (descubrimiento asíncrono).
  }, [mcpTools]);

  // Descubrimiento MCP: carga las tools del servidor MCP configurado (si lo hay) MÁS la fuente de
  // farmacología (servidor MCP real si está configurado, o el proveedor de referencia local). Ambas
  // fluyen por el MISMO camino (registro/gating/procedencia/tool_search). Cualquier fallo degrada
  // sin romper el copiloto. Las dos cargas son independientes.
  useEffect(() => {
    let active = true;
    Promise.allSettled([loadMcpTools(), loadPharmacologyTools()])
      .then(([mcp, pharma]) => {
        if (!active) return;
        const merged: ToolDefinition[] = [
          ...(mcp.status === "fulfilled" ? mcp.value : []),
          ...(pharma.status === "fulfilled" ? pharma.value : []),
        ];
        setMcpTools(merged);
      })
      .catch(() => {
        /* degradación silenciosa: sin tools externas */
      });
    return () => {
      active = false;
    };
  }, []);

  // Carga la persona configurable del médico (P4). Si falla, queda null -> solo la capa de
  // seguridad fija (siempre presente). La seguridad NUNCA depende de esta carga.
  useEffect(() => {
    let active = true;
    getAgentPersona()
      .then((persona) => {
        if (active) personaRef.current = persona;
      })
      .catch(() => {
        if (active) personaRef.current = null;
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const applyTurnEvent = (event: ServerEvent): void => {
      const next = reduceTurnEvent(turnRef.current, event);
      turnRef.current = next;
      setTurn(next);

      if (event.type === "turn.completed") {
        // Specs de UI generados por las tools ``ui.*`` de ESTE turno: se anclan al mensaje del
        // asistente para PERSISTIRSE con él (payload.ui) y sobrevivir a recargas (se restauran
        // gobernados como mensajes kind "ui"). En vivo los sigue mostrando TurnToolCalls. Las
        // RESPUESTAS SUGERIDAS son efímeras del hilo vivo (caducan con el siguiente mensaje):
        // no se persisten ni restauran.
        const turnUiSpecs: UiSpec[] = next.turnId
          ? toolCallsRef.current
              .filter((call) => {
                if (call.turnId !== next.turnId) {
                  return false;
                }
                const spec = toolCallUiSpec(call);
                return spec !== null && spec.kind !== "suggested_replies";
              })
              .map((call) => call.resultContent as UiSpec)
          : [];
        // Notas de los planes P1 aprobados/ejecutados en este turno: se anclan al mensaje para
        // persistirse con él (payload.approved_plans) y resembrar los preserve al recargar.
        const turnPlanNotes = next.turnId
          ? (turnPlanNotesRef.current.get(next.turnId) ?? [])
          : [];
        // Notas del USO DE HERRAMIENTAS del turno: se anclan igual (payload.tool_notes) y entran
        // al contexto de turnos siguientes como bloque compactable adyacente al mensaje.
        const turnToolNotes = next.turnId
          ? (turnToolNotesRef.current.get(next.turnId) ?? [])
          : [];
        // Tool calls del turno con su estado FINAL: se anclan al mensaje para persistirse con él
        // (payload.tools) y restaurar las tarjetas tal cual quedaron al recargar. NO entran al
        // contexto del modelo (el cable sigue llevando sólo texto/imagen/toolNotes).
        const turnToolCalls = next.turnId
          ? persistedToolCallsOf(
              toolCallsRef.current.filter((call) => call.turnId === next.turnId),
              turnUiSpecs,
            )
          : [];
        if (next.turnId) {
          turnPlanNotesRef.current.delete(next.turnId);
          turnToolNotesRef.current.delete(next.turnId);
        }
        // Truncamiento (Fix): el gateway avisa cuando la respuesta quedó INCOMPLETA (corte por
        // longitud o stream cortado a media palabra). Se anexa un aviso claro para que el médico
        // sepa que el mensaje no está completo y pueda pedir continuar, en vez de persistir el
        // fragmento como una respuesta normal (p. ej. "Permítame retomar. U").
        const wasTruncated = event.type === "turn.completed" && event.truncated === true;
        const completedText = wasTruncated
          ? `${next.assistantText}${next.assistantText.trim() ? "\n\n" : ""}` +
            "_⚠️ La respuesta quedó incompleta: la generación se interrumpió. Pídeme que continúe._"
          : next.assistantText;
        // El mensaje ancla se crea si hay texto O contenido que conservar (specs de UI, notas de
        // plan/herramientas o tool calls) o si hubo truncamiento; MessageBubble no muestra burbuja
        // vacía.
        if (
          completedText.trim() ||
          turnUiSpecs.length > 0 ||
          turnPlanNotes.length > 0 ||
          turnToolNotes.length > 0 ||
          turnToolCalls.length > 0
        ) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              text: completedText,
              // Ancla las tool calls de este turno al mensaje (se muestran contraídas encima).
              ...(next.turnId ? { turnId: next.turnId } : {}),
              // Conserva el razonamiento (si lo hubo) para mostrarlo colapsado bajo la respuesta.
              ...(next.reasoningText.trim() ? { reasoning: next.reasoningText } : {}),
              ...(turnUiSpecs.length > 0 ? { uiSpecs: turnUiSpecs } : {}),
              ...(turnPlanNotes.length > 0 ? { approvedPlanNotes: turnPlanNotes } : {}),
              ...(turnToolNotes.length > 0 ? { toolNotes: turnToolNotes } : {}),
              ...(turnToolCalls.length > 0 ? { toolCalls: turnToolCalls } : {}),
            },
          ]);
        }
        // Usage REPORTADO por el gateway: es el conteo real de tokens de entrada del turno.
        // Actualiza el indicador con la fuente "reportado" (más fiable que la estimación).
        const reportedInput = next.usage?.input_tokens;
        if (typeof reportedInput === "number" && budgetRef.current.window > 0) {
          setContextStats(contextUsage(reportedInput, budgetRef.current.window, "reportado"));
        }
        // USO/COSTO (P7): acumula el uso del turno en la sesión (este médico) y estima el costo
        // de este turno y del acumulado con la tarifa del modelo. Costo null = precio desconocido.
        const turnUsage = usageFromWire(next.usage);
        sessionUsageRef.current = addUsage(sessionUsageRef.current, turnUsage);
        const pricing = pricingRef.current;
        setUsageStats({
          turnTokens: turnUsage,
          sessionTokens: sessionUsageRef.current,
          turnCost: computeCost(turnUsage, pricing),
          sessionCost: computeCost(sessionUsageRef.current, pricing),
        });
        turnRef.current = initialTurnState();
        setTurn(turnRef.current);
      } else if (event.type === "turn.failed") {
        // Un turno puede fallar DESPUÉS de haber aprobado y ejecutado una escritura P1 (p. ej. el
        // proveedor corta al reanudar). Sus notas de plan aprobado se anclan al mensaje de fallo
        // (payload.approved_plans) para no perder, al recargar, el rastro del id creado; en vivo ya
        // se conservan vía approvedPlanNotesRef. Mismo destino que sus tool notes/calls.
        const failedPlanNotes = next.turnId
          ? (turnPlanNotesRef.current.get(next.turnId) ?? [])
          : [];
        // Las tools del turno fallido SÍ corrieron: sus notas se anclan al mensaje de fallo
        // (mismo destino que sus tool calls) para no perder el rastro.
        const failedToolNotes = next.turnId
          ? (turnToolNotesRef.current.get(next.turnId) ?? [])
          : [];
        // También su estado final se persiste con el mensaje de fallo (sin specs de UI: los del
        // turno fallido no se anclan, igual que hasta ahora).
        const failedToolCalls = next.turnId
          ? persistedToolCallsOf(
              toolCallsRef.current.filter((call) => call.turnId === next.turnId),
              [],
            )
          : [];
        if (next.turnId) {
          turnPlanNotesRef.current.delete(next.turnId);
          turnToolNotesRef.current.delete(next.turnId);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: turnFailureMessage(next.error, protocolRef.current),
            isError: true,
            // También el mensaje de fallo ancla las tool calls del turno (si las hubo).
            ...(next.turnId ? { turnId: next.turnId } : {}),
            ...(failedPlanNotes.length > 0 ? { approvedPlanNotes: failedPlanNotes } : {}),
            ...(failedToolNotes.length > 0 ? { toolNotes: failedToolNotes } : {}),
            ...(failedToolCalls.length > 0 ? { toolCalls: failedToolCalls } : {}),
          },
        ]);
        turnRef.current = initialTurnState();
        setTurn(turnRef.current);
      } else if (event.type === "turn.cancelled") {
        // Turno cancelado: sin mensaje ancla; las notas en vuelo del turno se descartan.
        if (next.turnId) {
          turnToolNotesRef.current.delete(next.turnId);
          turnPlanNotesRef.current.delete(next.turnId);
        }
        turnRef.current = initialTurnState();
        setTurn(turnRef.current);
      }
    };

    // B8: el navegador es dueño de las tools. Al recibir tool_call.ready busca la tool,
    // valida args y, si es 'read', la ejecuta contra FastAPI (cookie del médico) y
    // devuelve turn.tool_result. Si es 'write', NO ejecuta: espera aprobación del médico.
    const handleToolCall = (
      turnId: string,
      callId: string,
      toolName: string,
      args: unknown,
    ): void => {
      // Despacho de tools NO nativas (derivadas del contrato + MCP): se pasan TODAS las EFECTIVAS
      // (tras el gating por rol) como tools extra, para que las que el registro estático no conoce
      // (p. ej. resource.update_*, resource.create_*) sean EJECUTABLES y no devuelvan "Herramienta
      // desconocida". Una tool gateada nunca está en las efectivas -> nunca se resuelve. Las nativas
      // las resuelve el registro (getTool) con prioridad, sin regresión.
      const extraTools = effectiveTools(
        [...listTools(), ...derivedToolsRef.current, ...mcpToolsRef.current],
        creatableRef.current,
        grantedRef.current,
      );
      const resolved = resolveToolCall(toolName, args, extraTools);
      if (resolved.outcome !== "ready") {
        const message = resolved.result.status === "error" ? resolved.result.message : "Error";
        upsertToolCall({
          callId,
          turnId,
          name: toolName,
          kind: "read",
          argsText: previewContent(args),
          status: "error",
          errorText: message,
        });
        noteToolUsage(
          turnId,
          buildToolUsageNote({ name: toolName, args, outcome: { status: "error", message } }),
        );
        clientRef.current?.sendToolResult(turnId, callId, resolved.result);
        return;
      }

      const { tool, args: validArgs } = resolved;
      const argsText = previewContent(validArgs);

      if (tool.kind === "read") {
        upsertToolCall({ callId, turnId, name: tool.name, kind: "read", argsText, status: "running" });
        void executeTool(tool, validArgs, defaultToolContext).then((result) => {
          patchToolCall(
            callId,
            result.status === "success"
              ? { status: "success", resultText: previewContent(result.content), resultContent: result.content }
              : { status: "error", errorText: result.message },
          );
          // Nota de contexto del turno: qué se consultó/mostró (o por qué falló), en telegráfico.
          noteToolUsage(
            turnId,
            buildToolUsageNote({
              name: tool.name,
              args: validArgs,
              outcome:
                result.status === "success"
                  ? { status: "success", content: result.content }
                  : { status: "error", message: result.message },
            }),
          );
          clientRef.current?.sendToolResult(turnId, callId, result);
        });
        return;
      }

      // Escritura: protocolo de aprobación (P1). Se construye el plan canónico INMUTABLE y
      // se crea una solicitud; la tool NO se ejecuta hasta que el médico apruebe exactamente
      // lo mostrado (resumen + payload).
      const plan = buildClinicalActionPlan(tool, validArgs);
      const requestId = `appr_${callId}`;
      approvalStoreRef.current.request({
        id: requestId,
        turnId,
        callId,
        toolName: tool.name,
        plan,
      });
      pendingWritesRef.current.set(callId, { requestId, tool, turnId });
      upsertToolCall({
        callId,
        turnId,
        name: tool.name,
        kind: "write",
        argsText,
        status: "awaiting_approval",
        plan,
      });
    };

    const onEvent = (event: ServerEvent): void => {
      if (event.type === "models.list.result") {
        setModels(event.models);
        // Restaura la última selección persistida SIEMPRE que ese modelo siga disponible en la
        // lista negociada; si no (credenciales cambiadas, proveedor caído), cae al primero. No
        // pisa una selección ya hecha en esta sesión.
        setSelectedModel((current) => {
          if (current) {
            return current;
          }
          const preferred = loadPreferredModelId();
          if (preferred && event.models.some((model) => model.id === preferred)) {
            return preferred;
          }
          return event.models[0]?.id || "";
        });
        return;
      }
      if (event.type === "provider.status.result") {
        setProviders(event.providers);
        return;
      }
      if (event.type === "rpc.error" || event.type === "protocol.error") {
        return;
      }
      if (event.type === "turn.tool_call.ready") {
        applyTurnEvent(event);
        handleToolCall(event.turn_id, event.call_id, event.tool_name, event.arguments);
        return;
      }
      applyTurnEvent(event);
    };

    const gatewayUrl = getAgentGatewayUrl();

    const clearReconnectTimer = (): void => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    // Falla LIMPIAMENTE el turno en vuelo al caerse la conexión (sin spinner colgado). No reenvía
    // nada ni toca el expediente: la recuperación del canal NO recupera intenciones en vuelo.
    const failInFlightOnDrop = (): void => {
      const current = turnRef.current;
      const failed = failInFlightTurn(current, CONNECTION_INTERRUPTED_NOTICE);
      if (failed !== current) {
        turnRef.current = failed;
        setTurn(failed);
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: CONNECTION_INTERRUPTED_NOTICE, isError: true },
        ]);
      }
    };

    // Maneja la máquina de reconexión PURA y ejecuta sus efectos (conectar / programar backoff /
    // aviso "Reconectado"). El WebSocket real lo gestiona el AgentClient; aquí sólo se orquesta.
    const dispatchReconnect = (event: ReconnectEvent): void => {
      const prev = reconnectRef.current;
      const nextState = reduceReconnect(prev, event);
      reconnectRef.current = nextState;
      setReconnect(nextState);

      if (nextState.phase === "connecting") {
        // Intento inicial, reintento automático o manual: re-ejecuta el handshake completo.
        clearReconnectTimer();
        void clientRef.current?.connect();
      } else if (nextState.phase === "reconnecting" && nextState.nextDelayMs != null) {
        // Espera el backoff y reintenta (auto).
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          dispatchReconnect({ type: "retry" });
        }, nextState.nextDelayMs);
      } else if (nextState.phase === "connected") {
        clearReconnectTimer();
        // Si veníamos de un ciclo de reconexión, muestra el aviso transitorio "Reconectado".
        if (prev.attempts > 0) {
          setReconnected(true);
          if (reconnectedTimerRef.current) {
            clearTimeout(reconnectedTimerRef.current);
          }
          reconnectedTimerRef.current = setTimeout(() => setReconnected(false), RECONNECTED_NOTICE_MS);
        }
      } else if (nextState.phase === "failed") {
        clearReconnectTimer();
      }
    };
    reconnectDispatchRef.current = dispatchReconnect;

    const client = new AgentClient({
      gatewayUrl,
      onEvent,
      onStatusChange: (next) => {
        setStatus(next);
        if (next === "connected") {
          dispatchReconnect({ type: "connected" });
          client.listModels();
          client.providerStatus();
        } else if (next === "unavailable" && gatewayUrl) {
          // Caída INESPERADA (un cierre intencional deja status "idle", no "unavailable"): falla el
          // turno en vuelo y arranca el ciclo de reconexión. Sin gateway configurado no se reintenta.
          failInFlightOnDrop();
          dispatchReconnect({ type: "dropped" });
        }
      },
    });
    clientRef.current = client;

    if (gatewayUrl) {
      // Arranca el handshake a través de la máquina (connect_start -> connecting -> connect()).
      dispatchReconnect({ type: "connect_start" });
    } else {
      // Sin gateway configurado: intento único; la UI legacy explica que no está disponible.
      void client.connect();
    }

    return () => {
      clearReconnectTimer();
      if (reconnectedTimerRef.current) {
        clearTimeout(reconnectedTimerRef.current);
      }
      // Cierre INTENCIONAL: marca la máquina como dispuesta (terminal) y cierra el socket. Ningún
      // "unavailable" tardío disparará reconexión.
      dispatchReconnect({ type: "dispose" });
      client.disconnect();
    };
  }, []);

  const isBusy = turn.status === "running" || turn.status === "waiting_for_tool";
  const selectedModelSupportsVision =
    models
      .find((model) => model.id === selectedModel)
      ?.capabilities.input_modalities.includes("image") ?? false;
  // El selector de razonamiento se muestra SOLO si el modelo negociado soporta el control
  // (compat.supportsReasoningEffort); si no, se oculta y el parámetro se omite del turno.
  const selectedModelSupportsReasoning =
    models.find((model) => model.id === selectedModel)?.capabilities.compat.supportsReasoningEffort ??
    false;
  const selectedModelLabel =
    models.find((model) => model.id === selectedModel)?.label ??
    (models.length === 0 ? "Sin modelos" : "Modelo");
  // Pista de proveedor para el glifo de marca (id + protocolo + etiqueta): infiere Anthropic/OpenAI/
  // Google/etc. sin depender de un catálogo fijo.
  const selectedModelProtocol = (() => {
    const m = models.find((model) => model.id === selectedModel);
    return m ? `${m.id} ${m.protocol}` : "";
  })();
  const canSend =
    status === "connected" &&
    !isBusy &&
    (input.trim().length > 0 || attachedImage !== null);

  // Paleta "/" del composer (D1): se deriva del texto actual. La búsqueda de pacientes es el único
  // modo con E/S; el resto (comandos) es presentación pura sobre el catálogo.
  const composerPalette = parseComposerPalette(input);
  const patientSearchQuery =
    composerPalette.mode === "patient_search" ? composerPalette.query : null;

  // Búsqueda de pacientes "/paciente <texto>" (D1): debounce sobre el endpoint existente (0113).
  // Sólo LEE (proyección segura, teléfono enmascarado); al elegir un resultado se abre su expediente.
  // Si falla o el término es corto, no muestra resultados (degradación limpia).
  useEffect(() => {
    let cancelled = false;
    const query = patientSearchQuery?.trim() ?? "";
    // Término ausente o demasiado corto: limpia resultados (de forma asíncrona para no llamar a
    // setState en el cuerpo del efecto). Con término válido: busca tras el debounce.
    if (patientSearchQuery === null || query.length < 2) {
      const clear = setTimeout(() => {
        if (!cancelled) {
          setPatientResults([]);
          setPatientSearchLoading(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(clear);
      };
    }
    const timer = setTimeout(() => {
      void (async () => {
        if (!cancelled) setPatientSearchLoading(true);
        try {
          const response = await browserApi<{ candidates?: PatientSearchCandidate[] }>(
            `/api/v1/patients/search?name=${encodeURIComponent(query)}`,
          );
          if (!cancelled) setPatientResults(response.candidates ?? []);
        } catch {
          if (!cancelled) setPatientResults([]);
        } finally {
          if (!cancelled) setPatientSearchLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientSearchQuery]);

  // Al elegir un comando: si es de prompt, siembra el texto (el médico revisa y envía); si es la
  // búsqueda de pacientes, deja el composer en "/paciente " para escribir el término.
  const handlePickCommand = (command: ComposerCommand): void => {
    if (command.kind === "patient_search") {
      setInput(`${command.name} `);
      return;
    }
    setInput(command.prompt ?? "");
  };

  // Al elegir un paciente del dropdown: abre su expediente (contexto activo) y limpia el composer.
  const handlePickPatient = (candidate: PatientSearchCandidate): void => {
    setActiveContext({
      patientId: candidate.id,
      patientLabel: candidate.full_name,
      consultationId: null,
      consultationLabel: null,
    });
    setInput("");
    setPatientResults([]);
  };

  const clearAttachedImage = (): void => {
    setAttachedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Al cambiar de modelo, si el nuevo no admite visión descarta la imagen adjunta para no
  // enviar un turno que el gateway rechazaría (modelo text-only).
  const handleModelChange = (modelId: string): void => {
    setSelectedModel(modelId);
    // Persiste la elección para restaurarla en la próxima sesión (si el modelo sigue disponible).
    savePreferredModelId(modelId);
    const supportsVision =
      models.find((model) => model.id === modelId)?.capabilities.input_modalities.includes("image") ??
      false;
    if (!supportsVision) {
      clearAttachedImage();
    }
  };

  const handleSelectImage = (file: File | null): void => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      // El data URL es `data:<mime>;base64,<datos>`; el cable lleva solo el base64.
      const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : "";
      if (!base64) {
        return;
      }
      setAttachedImage({ dataUrl, mimeType: file.type, base64, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  // RECALL (P2): recupera las memorias del médico (owner-scoped, cookie del médico) y arma el
  // bloque de contexto NO confiable. Si hay paciente activo, el fetch se acota a ese paciente
  // (server-side) y sólo sus memorias se inyectan; sin paciente activo, owner-scoped por
  // recencia (comportamiento actual). Si falla, no bloquea el turno: simplemente no se inyecta.
  const recallMemoryMessage = async (): Promise<WireMessage | null> => {
    try {
      const scope = recallScopeFor(activeContextRef.current);
      const { message, count } = await fetchRecall(listAgentMemories, scope);
      setRecalledCount(count);
      return message;
    } catch {
      setRecalledCount(0);
      return null;
    }
  };

  const sendUserTurn = async (text: string, image?: AttachedImage | null): Promise<void> => {
    if ((!text && !image) || status !== "connected" || isBusy) {
      return;
    }
    // Las RESPUESTAS SUGERIDAS pendientes caducan al enviar CUALQUIER mensaje (elegido de los
    // chips o escrito a mano): se marcan usadas para que se contraigan y no queden clicables en
    // turnos viejos (la conversación ya siguió por otro camino).
    for (const call of toolCallsRef.current) {
      if (!call.uiUsed && toolCallUiSpec(call)?.kind === "suggested_replies") {
        patchToolCall(call.callId, { uiUsed: true });
      }
    }
    const userMessage: ChatMessage = {
      id: nextId(),
      role: "user",
      text,
      ...(image ? { image } : {}),
    };
    const history = [...messagesRef.current, userMessage];
    // Cada mensaje de la charla es un SEGMENTO atómico para la compactación (texto + cable). Si el
    // mensaje ancla notas de USO DE HERRAMIENTAS, entran como mensaje de sistema adyacente en el
    // MISMO segmento (se eliden juntos al compactar); el razonamiento NO entra nunca al cable.
    const historySegments: ContextSegment[] = history.map((message) => {
      const content: WireContentPart[] = [];
      if (message.text) {
        content.push({ type: "text", text: message.text });
      }
      if (message.image) {
        content.push({ type: "image", mimeType: message.image.mimeType, data: message.image.base64 });
      }
      if (content.length === 0) {
        content.push({ type: "text", text: "" });
      }
      const notesText = toolNotesContextText(message.toolNotes ?? []);
      const wireMessages: WireMessage[] = notesText
        ? [
            { role: "system", content: [{ type: "text", text: notesText }] },
            { role: message.role, content },
          ]
        : [{ role: message.role, content }];
      return {
        messages: wireMessages,
        text: notesText ? `${notesText}\n${message.text ?? ""}` : (message.text ?? ""),
      };
    });

    setMessages(history);
    turnRef.current = { ...initialTurnState(), status: "running" };
    setTurn(turnRef.current);

    // RECALL antes de que el modelo responda: las memorias se inyectan como un mensaje
    // ``system`` delimitado al frente del contexto (datos, no instrucciones; ver memory-recall).
    const recall = await recallMemoryMessage();
    // Se declara al modelo el catálogo EFECTIVO COMPLETO (ya gateado por rol/permiso): el
    // descubrimiento bajo demanda se retiró al decidir "declarar todo".
    const declared = effectiveTools(
      [...listTools(), ...derivedToolsRef.current, ...mcpToolsRef.current],
      creatableRef.current,
      grantedRef.current,
    );
    const toolsWire = toWireToolDefinitions(declared);

    // PERSONA (P4) + CONTEXTO ACTIVO + RESUMEN DEL PACIENTE: capas LÍDER en orden fijo
    // [SEGURIDAD] -> [OPERATIVA] -> [PERSONA] -> [CONTEXTO ACTIVO] -> [RESUMEN DEL PACIENTE] ->
    // [MEMORIAS] (ver composeLeadingLayers). La seguridad es fija (código), SIEMPRE primera; el
    // contexto activo (ámbito del paciente) y el resumen del expediente son de confianza y van antes
    // de las memorias (datos no confiables). La conversación (compactada) va al final.
    const activeContextMessage = buildActiveContextMessage(activeContextRef.current);
    const leadingLayers = composeLeadingLayers(
      personaRef.current,
      recall,
      activeContextMessage,
      patientSummaryMsgRef.current,
    );

    // CONTEXTO (P3): el overhead fijo (esquema de tools + capas líder) no se compacta; los
    // planes APROBADOS se conservan verbatim y la charla vieja se resume si excede el
    // presupuesto. Solo afecta la ventana que ve el modelo; el expediente en FastAPI no se toca.
    const leadingTokens = leadingLayers.reduce(
      (sum, message) => sum + estimateTokens(messageText(message)),
      0,
    );
    const overhead = estimateToolSchemaTokens(toolsWire) + leadingTokens;
    const segments: ContextSegment[] = [
      ...consolidateApprovedPlans(approvedPlanNotesRef.current),
      ...historySegments,
    ];
    const result = compactContext(segments, {
      usableInputTokens: budgetRef.current.usable,
      overheadTokens: overhead,
    });
    const outgoing = [...leadingLayers, ...result.messages];

    const usedEstimate =
      overhead + result.messages.reduce((sum, message) => sum + estimateTokens(messageText(message)), 0);
    setContextStats(contextUsage(usedEstimate, budgetRef.current.window, "estimado"));
    setCompaction(
      result.compacted ? { dropped: result.droppedSegments, preservedIds: result.preservedIds } : null,
    );

    clientRef.current?.startTurn({
      // El profileId es el id del modelo seleccionado (providerId/providerModelId); el
      // gateway lo resuelve contra su catálogo para arrendar la credencial correcta.
      profileId: selectedModel,
      messages: outgoing,
      // Declara al modelo SOLO las tools efectivas: lecturas + escrituras permitidas por el
      // rol del médico (gating por permiso). FastAPI revalida en cada ejecución.
      tools: toolsWire,
      // Razonamiento (P5): solo se adjunta el effort cuando el modelo lo soporta. El gateway
      // lo traduce al parámetro nativo del proveedor y omite "off"/modelos sin soporte.
      generation: {
        max_output_tokens: 1024,
        ...(selectedModelSupportsReasoning ? { reasoning_effort: reasoningEffort } : {}),
      },
    });
  };

  const handleSend = (): void => {
    const text = input.trim();
    if (!text && !attachedImage) {
      return;
    }
    void sendUserTurn(text, attachedImage);
    setInput("");
    clearAttachedImage();
  };

  // RECREAR (acción del mensaje del agente): regenera la respuesta. Quita el mensaje del asistente
  // y todo lo posterior, y reenvía el mensaje del usuario que lo originó. ``messagesRef`` se ajusta
  // a mano antes del envío para evitar el race con ``sendUserTurn`` (que lee el ref, no el estado).
  const regenerateAssistant = (assistantId: string): void => {
    if (status !== "connected" || isBusy) {
      return;
    }
    const msgs = messagesRef.current;
    const idx = msgs.findIndex((message) => message.id === assistantId);
    if (idx < 0) {
      return;
    }
    let userIdx = idx - 1;
    while (userIdx >= 0 && msgs[userIdx].role !== "user") {
      userIdx -= 1;
    }
    if (userIdx < 0) {
      return;
    }
    const userMessage = msgs[userIdx];
    const base = msgs.slice(0, userIdx);
    messagesRef.current = base;
    setMessages(base);
    // Propaga el recorte al backend ANTES de reenviar: sin esto, lo recortado reaparecería al
    // recargar (seguía persistido). El host serializa reset y append en la misma cola.
    onTruncateFrom?.(userMessage.id);
    void sendUserTurn(userMessage.text, userMessage.image ?? null);
  };

  // EDITAR (acción del mensaje del usuario): carga el texto en el composer para reescribirlo. Quita
  // el mensaje y lo posterior (al reenviar, la conversación continúa desde ahí) y enfoca el composer.
  const editUserMessage = (userId: string): void => {
    if (isBusy) {
      return;
    }
    const msgs = messagesRef.current;
    const idx = msgs.findIndex((message) => message.id === userId);
    if (idx < 0) {
      return;
    }
    const base = msgs.slice(0, idx);
    messagesRef.current = base;
    setMessages(base);
    // Propaga el recorte al backend (ver regenerateAssistant): el hilo continúa desde aquí.
    onTruncateFrom?.(msgs[idx].id);
    setInput(msgs[idx].text);
    window.requestAnimationFrame(() => {
      document.getElementById("copilot-composer-input")?.focus();
    });
  };

  // ELIMINAR (acción de cualquier mensaje): quita SOLO ese mensaje del hilo, conservando el resto.
  // Limpieza del historial de chat (no es un borrado clínico); el host propaga la baja al backend.
  const deleteTranscriptMessage = (messageId: string): void => {
    if (isBusy) {
      return;
    }
    const msgs = messagesRef.current;
    const base = msgs.filter((message) => message.id !== messageId);
    if (base.length === msgs.length) {
      return;
    }
    messagesRef.current = base;
    setMessages(base);
    onMessagesRemoved?.([messageId]);
  };

  // REINICIAR DESDE AQUÍ (acción de cualquier mensaje): recorta este mensaje y todo lo posterior;
  // la conversación continúa desde el mensaje anterior. Pide confirmación con el diálogo accesible
  // del diseño (acción destructiva; nada de window.confirm).
  const [confirmResetFrom, setConfirmResetFrom] = useState<{
    messageId: string;
    removedCount: number;
  } | null>(null);
  const resetFromMessage = (messageId: string): void => {
    if (isBusy) {
      return;
    }
    const msgs = messagesRef.current;
    const idx = msgs.findIndex((message) => message.id === messageId);
    if (idx < 0) {
      return;
    }
    setConfirmResetFrom({ messageId, removedCount: msgs.length - idx });
  };
  const confirmedResetFrom = (): void => {
    const target = confirmResetFrom;
    setConfirmResetFrom(null);
    if (!target || isBusy) {
      return;
    }
    const msgs = messagesRef.current;
    const idx = msgs.findIndex((message) => message.id === target.messageId);
    if (idx < 0) {
      return;
    }
    const base = msgs.slice(0, idx);
    messagesRef.current = base;
    setMessages(base);
    onTruncateFrom?.(target.messageId);
  };

  // Mantiene fresca la vía de envío para la cola del dictado (sendUserTurn cambia cada render).
  useEffect(() => {
    sendUserTurnRef.current = (text: string): void => {
      void sendUserTurn(text);
    };
  });

  // Vacía la cola del dictado continuo cuando el copiloto está libre: une los fragmentos
  // pendientes en un solo turno (evita backlog) y los manda. Se reintenta al cambiar el estado
  // (p. ej. cuando un turno termina) y al encolar un fragmento nuevo.
  const flushDictation = useCallback(() => {
    if (dictationQueueRef.current.length === 0 || status !== "connected" || isBusy) {
      return;
    }
    const joined = dictationQueueRef.current.join("\n");
    dictationQueueRef.current = [];
    sendUserTurnRef.current(joined);
  }, [status, isBusy]);

  useEffect(() => {
    flushDictation();
  }, [flushDictation]);

  const enqueueDictationSegment = useCallback(
    (text: string) => {
      dictationQueueRef.current = [...dictationQueueRef.current, text];
      flushDictation();
    },
    [flushDictation],
  );

  // Dictado de UN solo botón (fiel al diseño): el motor LOCAL continuo; cada pausa envía el fragmento
  // al copiloto ("enviar al pausar" on) o lo acumula en el cuadro de mensaje (off). El botón vive en
  // la fila del composer (junto a enviar) y el panel de grabación se muestra sobre el textarea.
  const dictation = useCopilotDictation({
    onSegmentSend: enqueueDictationSegment,
    onSegmentAppend: (text) =>
      setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text)),
  });

  // Seguimiento desde una UI generada (submit de form / clic de botón): continúa la
  // conversación con el modelo. Respeta el principio borrador: si el modelo decide una
  // acción de escritura clínica, pasa por la aprobación de B8.
  const handleSendFollowup = (text: string): void => {
    void sendUserTurn(text.trim());
  };

  const handleCancel = (): void => {
    clientRef.current?.cancelTurn(turnRef.current.turnId ?? undefined);
  };

  const approveWrite = (callId: string): void => {
    const pending = pendingWritesRef.current.get(callId);
    if (!pending) {
      return;
    }
    const outcome = applyApprovalDecision(approvalStoreRef.current, pending.requestId, "approved");
    if (outcome.kind !== "execute") {
      return;
    }
    pendingWritesRef.current.delete(callId);
    patchToolCall(callId, { status: "running" });
    // Se ejecuta EXACTAMENTE el payload aprobado (plan inmutable), no los args originales.
    const payload = { ...outcome.request.plan.exactPayload };
    const plan = outcome.request.plan;
    void executeTool(pending.tool, payload).then((result) => {
      patchToolCall(
        callId,
        result.status === "success"
          ? { status: "success", resultText: previewContent(result.content), resultContent: result.content }
          : { status: "error", errorText: result.message },
      );
      // CONTEXTO (P3): al ejecutarse, el plan APROBADO se conserva verbatim como segmento
      // ``preserve`` (nunca se elide al compactar). Incluye el id del recurso creado, para que
      // el modelo pueda referenciarlo en turnos siguientes aunque la charla se compacte.
      if (result.status === "success") {
        const createdId =
          typeof result.content === "object" && result.content !== null && "id" in result.content
            ? String((result.content as { id?: unknown }).id ?? "")
            : "";
        const note =
          `Acción clínica APROBADA y ejecutada (${plan.actionType} → ${plan.targetResource}): ` +
          `${plan.humanReadableSummary}` +
          (createdId ? ` Identificador del registro creado: ${createdId}.` : "");
        approvedPlanNotesRef.current = [...approvedPlanNotesRef.current, note];
        // Registra la nota en su turno: al cerrarse, se ancla al mensaje del asistente y se
        // persiste (payload.approved_plans) para resembrar los preserve al recargar.
        const turnNotes = turnPlanNotesRef.current.get(pending.turnId) ?? [];
        turnPlanNotesRef.current.set(pending.turnId, [...turnNotes, note]);
        // El expediente CAMBIÓ (escritura aprobada): marca el resumen como sucio y lo refresca en
        // segundo plano. Al próximo turno ya va el resumen fresco; entre tanto no se recarga nada.
        void refreshPatientSummary();
      }
      clientRef.current?.sendToolResult(pending.turnId, callId, result);
    });
  };

  const rejectWrite = (callId: string): void => {
    const pending = pendingWritesRef.current.get(callId);
    if (!pending) {
      return;
    }
    const outcome = applyApprovalDecision(approvalStoreRef.current, pending.requestId, "rejected");
    if (outcome.kind !== "discard") {
      return;
    }
    pendingWritesRef.current.delete(callId);
    // Rechazo: no se escribe nada; se reanuda el turno con el resultado de rechazo. La decisión
    // queda como nota INFORMATIVA en el contexto (compactable): el modelo no re-propone lo mismo.
    patchToolCall(callId, { status: "rejected", errorText: outcome.result.message });
    noteToolUsage(pending.turnId, buildRejectedWriteNote(outcome.request.plan));
    clientRef.current?.sendToolResult(pending.turnId, callId, outcome.result);
  };

  // Con gateway configurado, el badge refleja la máquina de reconexión (más rico que el status
  // de transporte); sin gateway, se conserva el badge legacy.
  const gatewayConfigured = getAgentGatewayUrl() !== null;
  const badge = gatewayConfigured
    ? reconnectBadge(reconnect, reconnected)
    : { label: STATUS_LABEL[status], tone: STATUS_TONE[status] };

  // AGRUPACIÓN POR TURNO: las tool calls se muestran EN el turno donde ocurrieron (ancladas al
  // mensaje del asistente vía ``turnId``), no acumuladas al final del hilo. Las del turno EN VUELO
  // se muestran en vivo bajo el orbe; las huérfanas (turno sin mensaje anclado, p. ej. respuesta
  // vacía o mensaje borrado) caen al final para no perderse.
  const toolCallsByTurn = new Map<string, ToolCallView[]>();
  for (const call of toolCalls) {
    const group = toolCallsByTurn.get(call.turnId);
    if (group) {
      group.push(call);
    } else {
      toolCallsByTurn.set(call.turnId, [call]);
    }
  }
  const claimedTurnIds = new Set<string>();
  for (const message of messages) {
    if (message.turnId) {
      claimedTurnIds.add(message.turnId);
    }
  }
  const liveTurnId = isBusy ? turn.turnId : null;
  const liveToolCalls = liveTurnId ? (toolCallsByTurn.get(liveTurnId) ?? []) : [];
  const orphanTurnIds = [...toolCallsByTurn.keys()].filter(
    (turnId) => !claimedTurnIds.has(turnId) && turnId !== liveTurnId,
  );

  return (
    <div
      className={
        embedded
          ? "mx-auto flex w-full max-w-[780px] flex-1 flex-col gap-4"
          : "mx-auto flex max-w-3xl flex-col gap-5"
      }
    >
      {/* Cromo COMPLETO sólo fuera del modo embebido (ruta /copilot). En el shell chat-first el
          encabezado y el aviso de borrador se omiten: el chat va limpio y las garantías viven en el
          modal del botón de escudo del composer. */}
      {!embedded && (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[var(--tx)]">Copiloto clínico</h1>
              <p className="mt-1 text-sm text-[var(--tx2)]">
                Asistente de IA conectado al gateway de modelos.
              </p>
            </div>
            {/* role=status + aria-live: anuncia con cortesía los cambios de conexión
                (Conectado/Reintentando…/Reconectado/Sin conexión) sin robar el foco. */}
            <Badge tone={badge.tone} role="status" aria-live="polite">
              {badge.label}
            </Badge>
          </header>

          <div
            role="note"
            className="rounded-[12px] border border-[var(--border2)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-3 text-sm text-[var(--tx)]"
          >
            Toda salida de IA es un <strong>borrador</strong> que el médico debe revisar y aprobar.
            El copiloto nunca diagnostica, receta ni guarda información final de forma autónoma.
          </div>
        </>
      )}

      {/* Sin gateway configurado: aviso legacy (no se reintenta). */}
      {!gatewayConfigured && status === "unavailable" && (
        <Card className="border-[var(--danger)]">
          <p className="text-sm text-[var(--tx)]">
            No se pudo conectar con el gateway de modelos. Puedes seguir usando el expediente con
            normalidad; el copiloto estará disponible cuando el gateway esté configurado.
          </p>
        </Card>
      )}

      {/* Con gateway: aviso de reconexión en curso (no intrusivo). */}
      {gatewayConfigured && reconnect.phase === "reconnecting" && (
        <Card className="border-[var(--danger)]">
          <p className="text-sm text-[var(--tx)]" role="status" aria-live="polite">
            Conexión con el copiloto perdida. Reintentando…
          </p>
        </Card>
      )}

      {/* Con gateway: se agotaron los reintentos automáticos -> reintento MANUAL. */}
      {gatewayConfigured && reconnect.phase === "failed" && (
        <Card className="border-[var(--danger)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--tx)]" role="status" aria-live="polite">
              No se pudo reconectar con el copiloto. Tu trabajo en el expediente sigue a salvo.
            </p>
            <button
              type="button"
              onClick={() => reconnectDispatchRef.current?.({ type: "manual_retry" })}
              className="rounded-[10px] border border-[var(--border2)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--tx)] transition hover:bg-[var(--surface2)]"
            >
              Reconectar
            </button>
          </div>
        </Card>
      )}

      {/* Selector de contexto interno: sólo en el modo standalone; el shell embebido controla la
          selección de paciente desde la barra lateral (evita duplicar el selector). */}
      {!embedded && (
        <ActiveContextPicker context={activeContext} onChange={setActiveContext} />
      )}

      {activeContext && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2 text-xs text-[var(--tx2)]"
        >
          <span aria-hidden="true">🩺</span>
          <span>{activeContextChipText(activeContext)}</span>
        </div>
      )}

      {recalledCount !== null && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2 text-xs text-[var(--tx2)]"
        >
          <span aria-hidden="true">🧠</span>
          <span>{recallIndicatorText(recalledCount)}</span>
        </div>
      )}

      {/* Aviso de compactación (cuando ocurre): el uso de contexto en sí se muestra como chip
          compacto dentro del composer (A9 del rediseño). */}
      {compaction && (
        <div
          role="status"
          className="rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2 text-xs text-[var(--tx2)]"
        >
          Se compactó la conversación: se resumieron {compaction.dropped} intercambio(s) antiguo(s)
          {compaction.preservedIds.length > 0
            ? `, conservando ${compaction.preservedIds.length} identificador(es) clínico(s).`
            : "."}{" "}
          Los datos del expediente no se modificaron.
        </div>
      )}

      {/* Costo y catálogo de herramientas: inline sólo fuera del modo embebido; en el chat-first
          viven en el modal de garantías (botón de escudo del composer). */}
      {!embedded && usageStats && <CostUsageBar stats={usageStats} />}

      {!embedded && <ToolCatalogPanel entries={toolCatalog} />}

      <div
        className={
          embedded
            ? "flex min-h-0 flex-1 flex-col gap-3"
            : "flex min-h-[280px] flex-col gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--soft)]"
        }
      >
        <div
          className={embedded ? "flex-1 space-y-4 overflow-y-auto" : "flex-1 space-y-3"}
          role="log"
          aria-label={COPILOT_TRANSCRIPT_LABEL}
          aria-live="polite"
        >
          {messages.length === 0 && !isBusy && (
            <p className="text-sm text-[var(--tx2)]">
              Escribe un mensaje para empezar. El asistente responderá en borrador.
            </p>
          )}

          {messages.map((message) => {
            if (message.kind === "ui" && message.uiSpec) {
              // Formulario del recurso abierto desde el expediente (botón Nuevo/Editar) o interfaz
              // restaurada del historial: se renderiza con GeneratedUi como un mensaje del asistente.
              // Al Guardar reporta como nota de contexto (sin turno del modelo) y refresca las listas
              // del expediente vía bumpRecordVersion. Una interfaz INTERACTIVA ya usada se contrae a
              // un resumen expandible (las de visualización nunca se contraen).
              const used =
                usedUiMessageIds.has(message.id) && !DISPLAY_UI_KINDS.has(message.uiSpec.kind);
              return (
                <div key={message.id} className="flex items-start justify-start gap-2.5">
                  <AnimatedOrb size={30} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <UsedUiCollapse collapsed={used}>
                      <GeneratedUi
                        spec={message.uiSpec}
                        onSendFollowup={(text) => {
                          markUiMessageUsed(message.id);
                          chatNav?.pushContextNote(text);
                          chatNav?.bumpRecordVersion();
                        }}
                        onOpenRecord={(context) => {
                          markUiMessageUsed(message.id);
                          setActiveContext(context);
                        }}
                      />
                    </UsedUiCollapse>
                  </div>
                </div>
              );
            }
            const turnToolCalls = message.turnId
              ? toolCallsByTurn.get(message.turnId)
              : undefined;
            return (
              <Fragment key={message.id}>
                {/* Ancla de texto vacío (turno que sólo rindió UI): conserva sus tool calls y sus
                    specs persistibles, sin pintar una burbuja vacía. */}
                {message.text.trim().length > 0 && (
                  <MessageBubble
                    message={message}
                    actionsDisabled={isBusy}
                    onRegenerate={() => regenerateAssistant(message.id)}
                    onEdit={() => editUserMessage(message.id)}
                    onDelete={() => deleteTranscriptMessage(message.id)}
                    onResetFrom={() => resetFromMessage(message.id)}
                  />
                )}
                {/* Herramientas del turno DEBAJO del mensaje (el razonamiento queda arriba, dentro
                    del mensaje): los pasos de datos y las interfaces YA USADAS van contraídos; las
                    interfaces vigentes (formulario sin enviar, botones sin usar, aprobaciones) y
                    las visualizaciones (gráficas/reportes) se muestran completas. El ``pl-10``
                    alinea con la columna de texto del asistente (orbe 30px + gap 10px). */}
                {turnToolCalls && turnToolCalls.length > 0 && (
                  <div className="pl-10">
                    <TurnToolCalls
                      calls={turnToolCalls}
                      onApprove={approveWrite}
                      onReject={rejectWrite}
                      onSendFollowup={handleSendFollowup}
                      onOpenRecord={setActiveContext}
                      onUiUsed={markUiUsed}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}

          {/* Huérfanas: turnos cuyo mensaje anclado no existe (respuesta vacía o mensaje borrado).
              Se conservan al final del hilo, contraídas, para no perder su rastro. */}
          {orphanTurnIds.map((turnId) => (
            <div key={turnId} className="pl-10">
              <TurnToolCalls
                calls={toolCallsByTurn.get(turnId) ?? []}
                onApprove={approveWrite}
                onReject={rejectWrite}
                onSendFollowup={handleSendFollowup}
                onOpenRecord={setActiveContext}
                onUiUsed={markUiUsed}
              />
            </div>
          ))}

          {isBusy && (
            <div className="flex items-start justify-start gap-2.5">
              <AnimatedOrb size={30} />
              <div className="min-w-0 flex-1 pt-0.5">
                {turn.reasoningText && <ReasoningPanel reasoning={turn.reasoningText} live />}
                {turn.assistantText ? (
                  <Markdown content={turn.assistantText} />
                ) : turn.reasoningText || liveToolCalls.length > 0 ? null : (
                  <div className="flex gap-1.5 py-1.5" aria-label="Pensando…">
                    <span
                      className="h-[7px] w-[7px] rounded-full bg-[var(--tx3)]"
                      style={{ animation: "mcbounce 1s infinite" }}
                    />
                    <span
                      className="h-[7px] w-[7px] rounded-full bg-[var(--tx3)]"
                      style={{ animation: "mcbounce 1s infinite .15s" }}
                    />
                    <span
                      className="h-[7px] w-[7px] rounded-full bg-[var(--tx3)]"
                      style={{ animation: "mcbounce 1s infinite .3s" }}
                    />
                  </div>
                )}
                {/* Herramientas del turno EN VUELO, DEBAJO del contenido (el razonamiento va arriba):
                    el grupo se ve abierto mientras se ejecutan (patrón del razonamiento en vivo); al
                    completarse el turno se re-anclan contraídas bajo el mensaje del asistente. */}
                {liveToolCalls.length > 0 && (
                  <div className="mt-2">
                    <TurnToolCalls
                      calls={liveToolCalls}
                      live
                      onApprove={approveWrite}
                      onReject={rejectWrite}
                      onSendFollowup={handleSendFollowup}
                      onOpenRecord={setActiveContext}
                      onUiUsed={markUiUsed}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          {attachedImage && (
            <div className="flex items-center gap-3 rounded-[12px] border border-[var(--border2)] bg-[var(--bg2)] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachedImage.dataUrl}
                alt={attachedImage.name}
                className="h-14 w-14 rounded-[8px] object-cover"
              />
              <span className="flex-1 truncate text-xs text-[var(--tx2)]">{attachedImage.name}</span>
              <button
                type="button"
                onClick={clearAttachedImage}
                className="shrink-0 rounded-[8px] border border-[var(--border2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)]"
              >
                Quitar
              </button>
            </div>
          )}


          {/* Composer UNIFICADO (fiel al diseño): UN solo panel redondeado con el textarea arriba y
              una fila inferior [modelo · escudo · contexto · — · imagen · enviar]. ``order-last`` lo
              mantiene debajo de las paletas/sugerencias del footer sin reordenar el código. La misma
              lógica del composer (handleSend / paletas / modelo) se conserva. */}
          <div className="order-last flex flex-col gap-2 rounded-[24px] bg-[var(--panel)] px-4 pb-2.5 pt-3 shadow-[var(--soft2)]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleSelectImage(event.target.files?.[0] ?? null)}
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* Panel de grabación en vivo (fiel al diseño): estado + toggle "Enviar al pausar" +
                transcripción del último fragmento + ayuda. El audio se transcribe LOCALMENTE. */}
            {dictation.recording && (
              <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--bg2)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: dictation.transcribing ? "var(--accent-tx)" : "var(--tx3)" }}
                  >
                    <span
                      className="h-[7px] w-[7px] rounded-full"
                      style={{
                        background: dictation.transcribing ? "var(--accent)" : "var(--danger)",
                        animation: "mcpulse 1.2s infinite",
                      }}
                    />
                    {dictation.transcribing ? "Transcribiendo" : "Escuchando"} ·{" "}
                    {formatDuration(dictation.durationMs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => dictation.setAutoSend(!dictation.autoSend)}
                    title="Enviar el fragmento automáticamente al detectar una pausa"
                    className="flex shrink-0 items-center gap-2"
                  >
                    <span
                      className="text-[11.5px] font-medium"
                      style={{ color: dictation.autoSend ? "var(--accent-tx)" : "var(--tx3)" }}
                    >
                      Enviar al pausar
                    </span>
                    <span
                      className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors"
                      style={{ background: dictation.autoSend ? "var(--accent)" : "var(--border2)" }}
                    >
                      <span
                        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow"
                        style={{ left: dictation.autoSend ? "16px" : "2px", transition: "left .2s" }}
                      />
                    </span>
                  </button>
                </div>
                <div className="text-[13.5px] leading-snug text-[var(--tx)]">
                  {dictation.lastSegment ? (
                    dictation.lastSegment
                  ) : (
                    <span className="text-[var(--tx3)]">Escuchando…</span>
                  )}
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[15px] w-[1.5px] translate-y-[2px] bg-[var(--accent-tx)]"
                    style={{ animation: "mcblink 1s infinite" }}
                  />
                </div>
                <div className="text-[11px] text-[var(--tx3)]">
                  {dictation.autoSend
                    ? `Cada pausa (~${dictation.pauseSeconds.toLocaleString("es")} s) envía el fragmento al copiloto y la grabación continúa.`
                    : "El texto se acumula en el mensaje; envíalo al terminar."}
                  {dictation.segmentCount > 0 ? ` · ${dictation.segmentCount} enviado(s)` : ""}
                </div>
                {dictation.error && (
                  <p role="alert" className="text-[11px] text-[var(--danger)]">
                    {dictation.error}
                  </p>
                )}
              </div>
            )}

            <Input
              id="copilot-composer-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) {
                  return;
                }
                event.preventDefault();
                if (composerPalette.mode === "commands" && composerPalette.matches.length > 0) {
                  handlePickCommand(composerPalette.matches[0]);
                  return;
                }
                if (composerPalette.mode === "patient_search" && patientResults.length > 0) {
                  handlePickPatient(patientResults[0]);
                  return;
                }
                handleSend();
              }}
              placeholder={
                status === "connected"
                  ? "Escribe / para comandos o tu consulta…"
                  : "Copiloto no conectado"
              }
              disabled={status !== "connected" || isBusy}
              aria-label="Mensaje para el copiloto"
              className="rounded-none! border-transparent! bg-transparent! px-1! shadow-none! focus:border-transparent! focus:shadow-none!"
            />
            <div className="flex flex-wrap items-center gap-2">
              {/* Escudo: abre el modal de garantías + herramientas + costo (modo embebido). */}
            {embedded && (
              <button
                type="button"
                onClick={() => setSafetyOpen(true)}
                title="Garantías y herramientas del copiloto"
                aria-label="Garantías y herramientas del copiloto"
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--tx3)] transition hover:bg-[var(--panel2)] hover:text-[var(--accent-tx)]"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
                  <path d="M9.2 12l2 2 3.6-4" />
                </svg>
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelMenuOpen((open) => !open)}
                disabled={models.length === 0}
                aria-haspopup="menu"
                aria-expanded={modelMenuOpen}
                title="Cambiar modelo del copiloto"
                className="flex items-center gap-1.5 rounded-[11px] border border-[var(--border)] bg-[var(--panel)] py-1.5 pl-2 pr-2.5 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[var(--bg2)]">
                  <ProviderIcon modelKey={`${selectedModelLabel} ${selectedModelProtocol}`} size={13} />
                </span>
                <span className="max-w-[170px] truncate">{selectedModelLabel}</span>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className="text-[var(--tx3)]"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {modelMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-[calc(100%+6px)] left-0 z-20 flex max-h-[min(70vh,440px)] w-[min(16rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-1.5 shadow-[var(--soft2)]"
                >
                  <p className="shrink-0 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
                    Modelo del agente
                  </p>
                  {/* Lista de modelos con SCROLL propio: no se desborda con muchos modelos ni en
                      pantallas pequeñas; el encabezado y el pie (razonamiento/proveedores) quedan fijos. */}
                  <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
                  {models.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-[var(--tx2)]">Sin modelos disponibles</p>
                  ) : (
                    models.map((model) => {
                      const active = model.id === selectedModel;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            handleModelChange(model.id);
                            setModelMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-[var(--panel2)]"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--bg2)]">
                            <ProviderIcon modelKey={`${model.label} ${model.protocol}`} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[var(--tx)]">
                              {model.label}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--tx3)]">
                              {model.protocol}
                            </span>
                          </span>
                          {active && (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="shrink-0 text-[var(--accent-tx)]"
                            >
                              <path d="M5 12l5 5L20 6" />
                            </svg>
                          )}
                        </button>
                      );
                    })
                  )}
                  </div>
                  {selectedModelSupportsReasoning && (
                    <div className="mt-1 shrink-0 border-t border-[var(--border)] px-2 pb-1 pt-2">
                      <label
                        htmlFor="copilot-reasoning-effort"
                        className="block pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tx3)]"
                      >
                        Razonamiento
                      </label>
                      <Select
                        id="copilot-reasoning-effort"
                        value={reasoningEffort}
                        onChange={(event) =>
                          setReasoningEffort(event.target.value as NormalizedReasoningEffort)
                        }
                        aria-label="Esfuerzo de razonamiento del modelo"
                      >
                        <option value="off">Desactivado</option>
                        <option value="low">Bajo</option>
                        <option value="medium">Medio</option>
                        <option value="high">Alto</option>
                        <option value="max">Máximo</option>
                      </Select>
                    </div>
                  )}
                  {providers.length > 0 && (
                    <div className="mt-1 flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--border)] px-2 pb-1.5 pt-2">
                      {providers.map((provider) => (
                        <Badge key={provider.protocol} tone={provider.available ? "ok" : "neutral"}>
                          {provider.protocol}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {contextStats && !contextStats.unknownBudget && (
              <div
                title={`Contexto: ${contextStats.used.toLocaleString("es")} / ${contextStats.budget.toLocaleString("es")} tokens · ${contextStats.source}`}
                className="flex items-center gap-2 rounded-[11px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--tx3)"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h11M4 17h7" />
                </svg>
                <span
                  className="h-[5px] w-[46px] shrink-0 overflow-hidden rounded-full bg-[var(--border2)]"
                  role="progressbar"
                  aria-valuenow={contextStats.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Uso del contexto del modelo"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${contextStats.percent}%`,
                      backgroundColor:
                        contextStats.percent >= 90
                          ? "var(--danger)"
                          : contextStats.percent >= 75
                            ? "var(--warn)"
                            : "var(--accent)",
                    }}
                  />
                </span>
                <span className="whitespace-nowrap text-[11.5px] font-medium text-[var(--tx2)]">
                  {contextStats.percent}%
                </span>
              </div>
            )}

              <div className="flex-1" />

              {selectedModelSupportsVision && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status !== "connected" || isBusy}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--accent-tx)] disabled:opacity-50"
                  aria-label="Adjuntar imagen"
                  title="Adjuntar imagen"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2.5" />
                    <circle cx="8.5" cy="8.5" r="1.8" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </button>
              )}

              {/* UN solo botón de grabación, junto a enviar (fiel al diseño): micrófono ↔ stop. */}
              {dictation.supported && (
                <button
                  type="button"
                  onClick={dictation.toggleRecording}
                  disabled={dictation.stopping}
                  title={dictation.recording ? "Detener grabación" : "Grabar nota de voz"}
                  aria-label={dictation.recording ? "Detener grabación" : "Grabar nota de voz"}
                  className={
                    dictation.recording
                      ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--danger)] text-white transition disabled:opacity-60"
                      : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--accent-tx)]"
                  }
                >
                  {dictation.recording ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="6" width="12" height="12" rx="2.5" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0014 0M12 18v3" />
                    </svg>
                  )}
                </button>
              )}

              {isBusy ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  aria-label="Detener la respuesta"
                  title="Detener la respuesta"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--danger)] text-white transition hover:brightness-105"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2.5" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend}
                  aria-label="Enviar"
                  title="Enviar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--soft)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Paletas "/" del composer (D1): comandos del agente o "Ir a paciente". Pura lectura;
              ninguna ejecuta una acción de escritura por sí misma. */}
          {composerPalette.mode === "commands" && composerPalette.matches.length > 0 && (
            <div
              role="listbox"
              aria-label="Comandos del agente"
              className="flex flex-col gap-0.5 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-1.5 shadow-[var(--soft2)]"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
                  Comandos del agente
                </span>
                <span className="text-[10.5px] text-[var(--tx3)]">↵ para usar</span>
              </div>
              {composerPalette.matches.map((command) => (
                <button
                  key={command.name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handlePickCommand(command)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-[var(--panel2)]"
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--bg2)]">
                    <CommandGlyph name={command.name} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-semibold text-[var(--tx)]">
                      {command.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-[var(--tx3)]">
                      {command.description}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-[6px] bg-[var(--bg2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tx3)]">
                    {command.tag}
                  </span>
                </button>
              ))}
            </div>
          )}

          {composerPalette.mode === "patient_search" && (
            <div
              role="listbox"
              aria-label="Ir a paciente"
              className="flex flex-col gap-0.5 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-1.5 shadow-[var(--soft2)]"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
                  Ir a paciente
                </span>
                <span className="text-[10.5px] text-[var(--tx3)]">
                  {patientSearchLoading ? "Buscando…" : `${patientResults.length} resultado(s)`}
                </span>
              </div>
              {patientSearchQuery !== null && patientSearchQuery.trim().length < 2 ? (
                <p className="px-2 py-2 text-[12.5px] text-[var(--tx3)]">
                  Escribe al menos 2 caracteres del nombre.
                </p>
              ) : !patientSearchLoading && patientResults.length === 0 ? (
                <p className="px-2 py-2 text-[12.5px] text-[var(--tx3)]">
                  Sin pacientes que coincidan con «{patientSearchQuery}».
                </p>
              ) : (
                patientResults.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handlePickPatient(candidate)}
                    className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-[var(--panel2)]"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-xs font-bold text-white"
                      style={{ background: avatarColor(candidate.id) }}
                    >
                      {(candidate.full_name.trim()[0] ?? "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-[var(--tx)]">
                        {candidate.full_name}
                      </span>
                      <span className="block truncate text-[11.5px] text-[var(--tx3)]">
                        {candidate.age} años · {candidate.sex}
                        {candidate.phone_masked ? ` · ${candidate.phone_masked}` : ""}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Sugerencias de inicio (pills): sólo con el chat vacío y conectado; rellenan el composer.
              Derivadas de las tools disponibles (RBAC) con selección aleatoria; ver startSuggestions. */}
          {messages.length === 0 && !isBusy && status === "connected" && startSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {startSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-full bg-[var(--panel)] px-3.5 py-1.5 text-[12.5px] text-[var(--tx2)] shadow-[var(--soft)] transition hover:-translate-y-px hover:text-[var(--accent-tx)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modal de garantías + herramientas + costo (modo embebido), fiel al diseño. */}
      {embedded && safetyOpen && (
        <SafetyModal
          onClose={() => setSafetyOpen(false)}
          toolCatalog={toolCatalog}
          usageStats={usageStats}
        />
      )}

      {/* Confirmación de "Reiniciar desde aquí" (acción destructiva sobre el historial de chat):
          diálogo accesible del diseño, nunca window.confirm. */}
      {confirmResetFrom && (
        <ResourceActionConfirmDialog
          confirmation={{
            required: true,
            title: "Reiniciar desde este punto",
            message:
              `Se eliminarán ${confirmResetFrom.removedCount} mensaje(s) del historial de este ` +
              "chat de forma permanente. Los datos del expediente no se tocan.",
            confirm_label: "Reiniciar",
            destructive: true,
          }}
          pending={false}
          error={null}
          onConfirm={() => confirmedResetFrom()}
          onCancel={() => setConfirmResetFrom(null)}
        />
      )}

      {embedded && (
        <p className="text-center text-[11px] text-[var(--tx3)]">
          MediCopilot puede cometer errores. Verifique la información clínica.
        </p>
      )}
    </div>
  );
}

/**
 * Modal "Garantías del copiloto" (modo embebido), fiel a MediCopilot.dc.html: aloja el aviso de
 * borrador, el catálogo de herramientas declaradas/descubribles/restringidas y el uso/costo de IA,
 * fuera del flujo del chat. Cierra al hacer clic en el fondo, en la X o con la tecla Escape.
 */
function SafetyModal({
  onClose,
  toolCatalog,
  usageStats,
}: Readonly<{
  onClose: () => void;
  toolCatalog: ToolCatalogEntry[];
  usageStats: Parameters<typeof CostUsageBar>[0]["stats"] | null;
}>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Garantías del copiloto"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] border border-[var(--border2)] bg-[var(--panel)] shadow-[var(--soft2)]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-dim)] text-[var(--accent-tx)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" />
              <path d="M9.2 12l2 2 3.6-4" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold tracking-tight text-[var(--tx)]">
              Garantías del copiloto
            </div>
            <div className="mt-0.5 text-[12.5px] text-[var(--tx3)]">
              Cómo trabaja con seguridad sobre el expediente
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex gap-2.5 rounded-[14px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] p-3.5 text-[13.5px] leading-relaxed text-[var(--tx)]">
            <span className="shrink-0 text-[var(--accent-tx)]" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </span>
            <p className="m-0">
              Toda salida de IA es un <strong>borrador</strong> que el médico revisa y aprueba. El
              copiloto nunca diagnostica, receta ni guarda información final de forma autónoma; cada
              acción de escritura pasa por tu aprobación y el servidor la revalida.
            </p>
          </div>

          <ToolCatalogPanel entries={toolCatalog} />
          {usageStats && <CostUsageBar stats={usageStats} />}
        </div>
      </div>
    </div>
  );
}

function CostUsageBar({
  stats,
}: Readonly<{
  stats: {
    turnTokens: NormalizedUsage;
    sessionTokens: NormalizedUsage;
    turnCost: CostBreakdown | null;
    sessionCost: CostBreakdown | null;
  };
}>) {
  const costLabel = (cost: CostBreakdown | null): string =>
    cost ? formatCost(cost) : "no disponible";
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2.5 text-xs text-[var(--tx2)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Uso de IA</span>
        <span>estimado</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>Este turno</span>
        <span>
          {formatTokens(totalTokens(stats.turnTokens))} tokens · {costLabel(stats.turnCost)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>Sesión (acumulado)</span>
        <span>
          {formatTokens(totalTokens(stats.sessionTokens))} tokens · {costLabel(stats.sessionCost)}
        </span>
      </div>
      {!stats.turnCost && (
        <p>El costo no está disponible: el modelo seleccionado no informa precios por token.</p>
      )}
    </div>
  );
}

function ToolCatalogPanel({ entries }: Readonly<{ entries: ToolCatalogEntry[] }>) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) {
    return null;
  }
  const declared = entries.filter((entry) => entry.status === "declared");
  const gatedOut = entries.filter((entry) => entry.status === "gated_out");

  return (
    <Card className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--tx2)]">
          Herramientas del copiloto
        </span>
        <span className="text-xs text-[var(--tx2)]">
          {declared.length} activas · {gatedOut.length} restringidas {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--tx2)]">
            Cada turno se declara al modelo el catálogo de herramientas disponible para tu rol.
            Las acciones de escritura solo se ofrecen si tu rol permite crear en el recurso, y el
            servidor revalida cada acción.
          </p>
          {/* Agrupado por estado (activas / restringidas), fiel al acordeón del diseño; cada
              fila: acceso (LECTURA/ESCRITURA a color) + nombre monospace + estado. */}
          <ToolCatalogGroup label="Activas" entries={declared} />
          <ToolCatalogGroup label="Restringidas" entries={gatedOut} />
        </div>
      )}
    </Card>
  );
}

function ToolCatalogGroup({
  label,
  entries,
}: Readonly<{ label: string; entries: ToolCatalogEntry[] }>) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--bg2)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-[11.5px] font-semibold text-[var(--tx)]">{label}</span>
        <span className="text-[11px] tabular-nums text-[var(--tx3)]">{entries.length}</span>
      </div>
      <div className="flex flex-col">
        {entries.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-1.5"
            title={entry.reason ?? entry.source}
          >
            <span
              className="w-[58px] shrink-0 rounded-[5px] px-1.5 py-0.5 text-center text-[9.5px] font-bold uppercase tracking-wide"
              style={
                entry.kind === "write"
                  ? { color: "var(--warn)", backgroundColor: "color-mix(in srgb, var(--warn) 16%, transparent)" }
                  : { color: "var(--accent-tx)", backgroundColor: "var(--accent-dim)" }
              }
            >
              {entry.kind === "write" ? "Escr." : "Lect."}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--tx2)]">
              {entry.name}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Panel colapsable del "proceso de pensamiento" (resumen de razonamiento). Patrón OpenClaw:
 * mientras el modelo razona se ve abierto ("Razonando…"); ya respondido queda colapsado bajo
 * la respuesta. Funciona con cualquier proveedor que emita reasoning (Codex, Anthropic, Gemini…).
 */
function ReasoningPanel({
  reasoning,
  live = false,
}: Readonly<{ reasoning: string; live?: boolean }>) {
  return (
    <details open={live} className="group mb-2">
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-[var(--bg2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--tx3)] transition hover:text-[var(--tx2)] [&::-webkit-details-marker]:hidden">
        {live ? (
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent-tx)]"
            style={{ animation: "mcpulse 1.2s infinite" }}
          />
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 transition-transform group-open:rotate-90"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
        {live ? "Razonando…" : "Ver razonamiento"}
      </summary>
      <div className="ml-2 mt-2 border-l-2 border-[var(--border2)] pl-3">
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--tx2)]">{reasoning}</p>
      </div>
    </details>
  );
}

function MessageBubble({
  message,
  actionsDisabled = false,
  onRegenerate,
  onEdit,
  onDelete,
  onResetFrom,
}: Readonly<{
  message: ChatMessage;
  actionsDisabled?: boolean;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onResetFrom?: () => void;
}>) {
  const hasText = Boolean(message.text && message.text.trim());
  // Nota de contexto (acción humana inline): pill centrada y discreta; no es ni del médico ni del
  // agente, es un registro de lo que se hizo desde el expediente, visible y en contexto.
  if (message.kind === "note") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-1.5 text-center text-[12px] text-[var(--tx2)]">
          {message.text}
        </div>
      </div>
    );
  }
  const isUser = message.role === "user";

  // Mensaje del USUARIO: burbuja de panel blanco alineada a la derecha (fiel al diseño: NO acento),
  // con esquina inferior derecha recortada y sombra suave.
  if (isUser) {
    return (
      <div className="user-message-enter group flex flex-col items-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-[var(--panel)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--tx)] shadow-[var(--soft)]">
          {message.image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.image.dataUrl}
                alt={message.image.name}
                className="mb-2 max-h-48 rounded-[8px] object-contain"
              />
            </>
          )}
          {message.text}
        </div>
        {hasText && (
          <MessageActions
            text={message.text}
            variant="user"
            onEdit={onEdit}
            onDelete={onDelete}
            onResetFrom={onResetFrom}
            disabled={actionsDisabled}
          />
        )}
      </div>
    );
  }

  // Mensaje del ASISTENTE: orbe animado como avatar + texto que fluye al lado (sin burbuja), fiel al
  // diseño. Se conserva el marcador "Borrador" (principio rector: toda salida de IA es un borrador).
  return (
    <div className="group flex items-start justify-start gap-2.5">
      <AnimatedOrb size={30} />
      <div className="min-w-0 flex-1 pt-0.5">
        {message.reasoning && <ReasoningPanel reasoning={message.reasoning} />}
        {/* El texto del agente se renderiza como Markdown SEGURO (negritas, listas, tablas, citas,
            código, fórmulas). Los mensajes de error quedan en texto plano (no son Markdown). */}
        {message.isError ? (
          <div className="whitespace-pre-wrap text-[14px] leading-[1.62] text-[var(--danger)]">
            {message.text}
          </div>
        ) : (
          <Markdown content={message.text} />
        )}
        {hasText && (
          <MessageActions
            text={message.text}
            variant="agent"
            onRegenerate={onRegenerate}
            onDelete={onDelete}
            onResetFrom={onResetFrom}
            disabled={actionsDisabled}
          />
        )}
      </div>
    </div>
  );
}

function isSandboxResult(value: unknown): value is { value: unknown; logs: string[] } {
  return typeof value === "object" && value !== null && "logs" in value;
}

/**
 * Glifo del comando "/" derivado de su nombre (fiel a los iconos de slashCommands del diseño). No
 * modifica el modelo del comando: mapea por palabra clave a un icono a color, con un destello por
 * defecto.
 */
const COMMAND_GLYPHS: { match: RegExp; color: string; paths: string[] }[] = [
  { match: /paciente|buscar|ir/, color: "#0d9488", paths: ["M10 11a3.2 3.2 0 100-6.4A3.2 3.2 0 0010 11z", "M4.5 19c0-3 2.4-5 5.5-5", "M16 16l4 4"] },
  { match: /resumen|resume|perfil/, color: "#8b7ff0", paths: ["M4 6h16M4 12h10M4 18h7"] },
  { match: /lab|resultado/, color: "#2563eb", paths: ["M9 3v6l-4 9a2 2 0 002 3h10a2 2 0 002-3l-4-9V3", "M8 3h8"] },
  { match: /tarea|pendiente|todo/, color: "#0d9488", paths: ["M4 7l2 2 4-4", "M4 16l2 2 4-4", "M13 7h7M13 17h7"] },
  { match: /agenda|cita|calendar/, color: "#8b7ff0", paths: ["M3 9h18", "M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z", "M8 3v4M16 3v4"] },
  { match: /receta|prescrip|medic|fármac|farmac/, color: "#8b7ff0", paths: ["M5 8h11l3 3-3 3H5z"] },
  { match: /signo|vital|presi/, color: "#8b7ff0", paths: ["M3 12h4l2 5 4-12 2 7h6"] },
  { match: /consulta|nota|soap/, color: "#8b7ff0", paths: ["M5 3v6a4 4 0 008 0V3", "M9 13v2a5 5 0 0010 0"] },
  { match: /alerg/, color: "#dc2626", paths: ["M12 3l9.5 16.5H2.5z", "M12 10v4M12 17h.01"] },
  { match: /archivo|documento|estudio/, color: "#0d9488", paths: ["M14 3v5h5", "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"] },
  { match: /historia|antecedent/, color: "#8b7ff0", paths: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"] },
  { match: /whatsapp|wa|mensaje/, color: "#25d366", paths: ["M21 11.5a8.4 8.4 0 01-12.3 7.5L3 21l2.1-5.6A8.4 8.4 0 1121 11.5z"] },
  { match: /llamar|telefono|call/, color: "#2563eb", paths: ["M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.5-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z"] },
];
const DEFAULT_COMMAND_GLYPH = { color: "var(--accent-tx)", paths: ["M4 6h10M4 12h16M4 18h7"] };

function CommandGlyph({ name }: Readonly<{ name: string }>) {
  const key = name.toLowerCase();
  const glyph = COMMAND_GLYPHS.find((entry) => entry.match.test(key)) ?? DEFAULT_COMMAND_GLYPH;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={glyph.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyph.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/**
 * Glifo de estado de la llamada a herramienta, fiel al ``stepIcon`` del diseño: anillo girando
 * mientras corre/espera, palomita al completar, equis en error, guion al rechazar.
 */
function ToolStatusGlyph({ status }: Readonly<{ status: ToolCallStatus }>) {
  if (status === "running" || status === "awaiting_approval") {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-[13px] w-[13px] shrink-0 rounded-full border-[1.7px] border-[var(--border2)] border-t-[var(--accent-tx)]"
        style={{ animation: "mc-spin .7s linear infinite" }}
      />
    );
  }
  const color =
    status === "success" ? "var(--ok)" : status === "error" ? "var(--danger)" : "var(--tx3)";
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {status === "error" ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : status === "rejected" ? (
        <path d="M6 12h12" />
      ) : (
        <path d="M5 12l5 5L20 6" />
      )}
    </svg>
  );
}

function ToolCallCard({
  call,
  onApprove,
  onReject,
  onSendFollowup,
  onOpenRecord,
}: Readonly<{
  call: ToolCallView;
  onApprove: () => void;
  onReject: () => void;
  onSendFollowup: (text: string) => void;
  // Apertura GOBERNADA del expediente (MP-CTRL-0138): cambia el contexto activo del shell.
  onOpenRecord?: (context: ActiveClinicalContext) => void;
}>) {
  const meta = TOOL_STATUS[call.status];
  const uiSpec: UiSpec | null =
    call.status === "success" && call.name.startsWith("ui.") && isUiSpec(call.resultContent)
      ? call.resultContent
      : null;
  const sandboxResult =
    call.status === "success" && call.name === "sandbox.run_js" && isSandboxResult(call.resultContent)
      ? call.resultContent
      : null;

  // Cuando la tarjeta pasa a requerir aprobación, se le mueve el FOCO para que un usuario de
  // teclado/lector la note y pueda actuar. Es una región agrupada y etiquetada (no un diálogo
  // modal: no atrapa el foco, conserva el comportamiento inline existente).
  const awaitingApproval = call.status === "awaiting_approval";
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (awaitingApproval) {
      cardRef.current?.focus();
    }
  }, [awaitingApproval]);
  const regionProps = awaitingApproval ? approvalRegionProps(call.plan) : {};

  return (
    <div
      ref={cardRef}
      {...regionProps}
      className="rounded-[12px] border border-[var(--border2)] bg-[var(--bg2)] px-3.5 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ToolStatusGlyph status={call.status} />
        <Badge tone={call.kind === "write" ? "warn" : "accent"}>
          {call.kind === "write" ? "Escritura" : "Lectura"}
        </Badge>
        <code className="font-mono text-[13px] font-semibold text-[var(--tx)]">{call.name}</code>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {/* Para una escritura con plan se muestra el plan canónico (resumen + payload exacto),
          no el volcado crudo de args. El resto de tools conserva el preview de args. */}
      {!uiSpec && !call.plan && (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--tx2)]">
          {call.argsText}
        </pre>
      )}

      {call.plan && (
        <div className="mt-2 space-y-2">
          <div className="rounded-[8px] bg-[var(--panel2)] p-3">
            <p className="text-xs font-semibold text-[var(--tx2)]">
              Acción propuesta · {call.plan.actionType} → {call.plan.targetResource}
            </p>
            <p className="mt-1 text-sm text-[var(--tx)]">{call.plan.humanReadableSummary}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--tx2)]">Datos exactos que se enviarán</p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--panel2)] p-2 text-xs text-[var(--tx)]">
              {previewContent(call.plan.exactPayload)}
            </pre>
          </div>
        </div>
      )}

      {call.status === "awaiting_approval" && (
        <div className="mt-2">
          <p className="mb-2 text-xs text-[var(--tx2)]">
            Toda salida de IA es un borrador: nada se guarda hasta que apruebes exactamente lo
            anterior. Revisa el resumen y los datos antes de aprobar.
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={onApprove} className="shrink-0" aria-label={APPROVAL_APPROVE_LABEL}>
              Aprobar
            </Button>
            <button
              type="button"
              onClick={onReject}
              aria-label={APPROVAL_REJECT_LABEL}
              className="shrink-0 rounded-[11px] border border-[var(--border2)] px-[18px] py-2.5 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)]"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {uiSpec && (
        <div className="mt-2 rounded-[8px] bg-[var(--panel2)] p-3">
          <GeneratedUi spec={uiSpec} onSendFollowup={onSendFollowup} onOpenRecord={onOpenRecord} />
        </div>
      )}

      {sandboxResult && (
        <div className="mt-2 space-y-2">
          {sandboxResult.logs.length > 0 && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--panel2)] p-2 text-xs text-[var(--tx2)]">
              {sandboxResult.logs.join("\n")}
            </pre>
          )}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--panel2)] p-2 text-xs text-[var(--tx)]">
            {previewContent(sandboxResult.value)}
          </pre>
        </div>
      )}

      {call.status === "success" && !uiSpec && !sandboxResult && call.resultText && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--panel2)] p-2 text-xs text-[var(--tx)]">
          {call.resultText}
        </pre>
      )}

      {(call.status === "error" || call.status === "rejected") && call.errorText && (
        <p className="mt-2 text-xs text-[var(--danger)]">{call.errorText}</p>
      )}
    </div>
  );
}

/**
 * Kinds de UiSpec de VISUALIZACIÓN: su valor es lo que muestran (gráficas, reportes/propuestas de
 * sólo lectura), no una acción por consumir → quedan visibles en el hilo permanentemente, aunque
 * tengan algún botón de seguimiento. Los demás kinds son INTERACTIVOS (formularios, botones,
 * paneles de revisión/confirmación): una vez usados se contraen.
 */
const DISPLAY_UI_KINDS: ReadonlySet<UiSpec["kind"]> = new Set<UiSpec["kind"]>([
  "chart",
  "template_promotion_proposal",
]);

/** UiSpec rendido por una tool ``ui.*`` exitosa (null si la llamada no renderiza interfaz). */
function toolCallUiSpec(call: ToolCallView): UiSpec | null {
  return call.status === "success" && call.name.startsWith("ui.") && isUiSpec(call.resultContent)
    ? call.resultContent
    : null;
}

/**
 * Congela las tool calls de un turno CERRADO en su forma persistible (``payload.tools``), para
 * anclarlas al mensaje del asistente y restaurar el hilo tal cual quedó. Sólo estados TERMINALES
 * (al cierre no queda nada corriendo ni esperando aprobación); las respuestas sugeridas son
 * efímeras del hilo vivo y no se persisten. ``uiSpecIndex`` referencia el spec por su posición en
 * ``turnUiSpecs`` (el MISMO orden que va a ``payload.ui``): la interfaz se guarda una sola vez.
 */
function persistedToolCallsOf(
  calls: readonly ToolCallView[],
  turnUiSpecs: readonly UiSpec[],
): PersistedToolCall[] {
  const persisted: PersistedToolCall[] = [];
  for (const call of calls) {
    if (call.status !== "success" && call.status !== "error" && call.status !== "rejected") {
      continue;
    }
    const spec = toolCallUiSpec(call);
    if (spec && spec.kind === "suggested_replies") {
      continue;
    }
    // El spec anclado es el MISMO objeto que ``resultContent``: la búsqueda por referencia da su
    // índice en el sobre de UI del mensaje.
    const uiSpecIndex = spec ? turnUiSpecs.indexOf(spec) : -1;
    persisted.push({
      callId: call.callId,
      name: call.name,
      kind: call.kind,
      status: call.status,
      ...(call.argsText ? { argsText: call.argsText } : {}),
      ...(call.resultText ? { resultText: call.resultText } : {}),
      ...(call.errorText ? { errorText: call.errorText } : {}),
      ...(call.uiUsed ? { uiUsed: true } : {}),
      ...(uiSpecIndex >= 0 ? { uiSpecIndex } : {}),
      ...(call.plan
        ? {
            plan: {
              actionType: call.plan.actionType,
              targetResource: call.plan.targetResource,
              humanReadableSummary: call.plan.humanReadableSummary,
              exactPayload: { ...call.plan.exactPayload },
            },
          }
        : {}),
    });
  }
  return persisted;
}

/**
 * Re-siembra las ``ToolCallView`` desde los mensajes RESTAURADOS del historial (``payload.tools``):
 * cada call vuelve bajo su mensaje (``turnId`` sintético) con el estado en que quedó, y las
 * ``ui.*`` recuperan su interfaz desde el spec resuelto — misma tarjeta, misma contracción que en
 * vivo. Un estado no terminal no puede llegar aquí (el guard de persistencia sólo admite
 * success/error/rejected), así que nada restaurado "corre" ni pide aprobación.
 */
function toolCallViewsFromMessages(messages: readonly ChatMessage[]): ToolCallView[] {
  const views: ToolCallView[] = [];
  for (const message of messages) {
    if (!message.turnId || !message.toolCalls) {
      continue;
    }
    for (const call of message.toolCalls) {
      views.push({
        callId: call.callId,
        turnId: message.turnId,
        name: call.name,
        kind: call.kind,
        argsText: call.argsText ?? "",
        status: call.status,
        ...(call.plan ? { plan: call.plan } : {}),
        ...(call.resultText !== undefined ? { resultText: call.resultText } : {}),
        ...(call.uiSpec ? { resultContent: call.uiSpec } : {}),
        ...(call.errorText !== undefined ? { errorText: call.errorText } : {}),
        ...(call.uiUsed ? { uiUsed: true } : {}),
      });
    }
  }
  return views;
}

/**
 * Tool call que debe verse COMPLETA en el hilo (no contraída):
 * - escrituras a la ESPERA de aprobación (la tarjeta P1 es interactiva; ocultarla bloquearía el turno);
 * - interfaces de VISUALIZACIÓN (gráficas/reportes): permanentes;
 * - interfaces INTERACTIVAS (formularios/botones/paneles) mientras el médico NO las haya usado.
 * El resto (pasos de datos e interfaces ya usadas) se contrae en el resumen del turno.
 */
function isInlineToolCall(call: ToolCallView): boolean {
  if (call.status === "awaiting_approval") {
    return true;
  }
  const spec = toolCallUiSpec(call);
  if (!spec) {
    return false;
  }
  return DISPLAY_UI_KINDS.has(spec.kind) || !call.uiUsed;
}

/**
 * Envoltorio de una interfaz generada YA USADA: la contrae a un resumen expandible ("Interfaz
 * utilizada"), mismo lenguaje visual del panel de razonamiento. Sin ``collapsed`` rinde el hijo
 * tal cual (interfaz vigente o de visualización).
 */
function UsedUiCollapse({
  collapsed,
  children,
}: Readonly<{ collapsed: boolean; children: ReactNode }>) {
  if (!collapsed) {
    return <>{children}</>;
  }
  return (
    <details className="group/usedui">
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-[var(--bg2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--tx3)] transition hover:text-[var(--tx2)] [&::-webkit-details-marker]:hidden">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 transition-transform group-open/usedui:rotate-90"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        Interfaz utilizada
      </summary>
      <div className="mt-2 border-l-2 border-[var(--border2)] pl-3">{children}</div>
    </details>
  );
}

/**
 * Herramientas de UN turno, en su lugar del hilo (patrón ReasoningPanel): los pasos de datos van
 * contraídos bajo un resumen con el conteo, expandible si el médico quiere el detalle; las que
 * renderizan interfaz o esperan aprobación se muestran completas debajo. Con ``live`` (turno en
 * vuelo) el grupo se ve abierto mientras se ejecutan.
 */
function TurnToolCalls({
  calls,
  live = false,
  onApprove,
  onReject,
  onSendFollowup,
  onOpenRecord,
  onUiUsed,
}: Readonly<{
  calls: readonly ToolCallView[];
  live?: boolean;
  onApprove: (callId: string) => void;
  onReject: (callId: string) => void;
  onSendFollowup: (text: string) => void;
  onOpenRecord?: (context: ActiveClinicalContext) => void;
  // Marca una tool ui.* como USADA cuando su interfaz dispara un seguimiento o abre el expediente
  // (isInlineToolCall contrae las interactivas usadas; las de visualización quedan intactas).
  onUiUsed?: (callId: string) => void;
}>) {
  const steps = calls.filter((call) => !isInlineToolCall(call));
  const inline = calls.filter(isInlineToolCall);
  // Tarjeta con los callbacks de uso envueltos: cualquier interacción de la interfaz generada
  // (enviar formulario, confirmar plan, clic de botón, abrir expediente) marca la llamada usada.
  const renderCard = (call: ToolCallView): ReactNode => (
    <ToolCallCard
      key={call.callId}
      call={call}
      onApprove={() => onApprove(call.callId)}
      onReject={() => onReject(call.callId)}
      onSendFollowup={(text) => {
        onUiUsed?.(call.callId);
        onSendFollowup(text);
      }}
      onOpenRecord={
        onOpenRecord
          ? (context) => {
              onUiUsed?.(call.callId);
              onOpenRecord(context);
            }
          : undefined
      }
    />
  );
  const running = steps.some((call) => call.status === "running");
  const failed = steps.filter(
    (call) => call.status === "error" || call.status === "rejected",
  ).length;
  return (
    <div className="space-y-2">
      {steps.length > 0 && (
        <details open={live} className="group/tools">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-[var(--bg2)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--tx3)] transition hover:text-[var(--tx2)] [&::-webkit-details-marker]:hidden">
            {running ? (
              <span
                aria-hidden="true"
                className="inline-block h-[11px] w-[11px] shrink-0 rounded-full border-[1.7px] border-[var(--border2)] border-t-[var(--accent-tx)]"
                style={{ animation: "mc-spin .7s linear infinite" }}
              />
            ) : (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 transition-transform group-open/tools:rotate-90"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
            {running
              ? "Usando herramientas…"
              : `${steps.length} ${steps.length === 1 ? "herramienta" : "herramientas"}`}
            {!running && failed > 0 && (
              <span className="text-[var(--danger)]">
                · {failed} con {failed === 1 ? "problema" : "problemas"}
              </span>
            )}
          </summary>
          <div className="mt-2 space-y-2 border-l-2 border-[var(--border2)] pl-3">
            {steps.map(renderCard)}
          </div>
        </details>
      )}
      {inline.map((call) => {
        // RESPUESTAS SUGERIDAS vigentes: chips LIMPIOS bajo el mensaje, sin el cromo de tarjeta de
        // herramienta (deben leerse como continuaciones naturales, no como una tool). Al elegir
        // una se envía el mensaje y la llamada se marca usada (cae contraída al grupo de pasos).
        const spec = toolCallUiSpec(call);
        if (spec && spec.kind === "suggested_replies") {
          return (
            <GeneratedUi
              key={call.callId}
              spec={spec}
              onSendFollowup={(text) => {
                onUiUsed?.(call.callId);
                onSendFollowup(text);
              }}
              onOpenRecord={onOpenRecord}
            />
          );
        }
        return renderCard(call);
      })}
    </div>
  );
}
