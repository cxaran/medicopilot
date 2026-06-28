"use client";

import { useEffect, useRef, useState } from "react";

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
  initialTurnState,
  reduceTurnEvent,
  type TurnState,
} from "@/core/agent/turn-reducer";
import type {
  NormalizedReasoningEffort,
  ServerEvent,
  WireContentPart,
  WireMessage,
  WireModel,
  WireProviderStatus,
} from "@/core/agent/protocol";
import { executeTool, resolveToolCall } from "@/core/agent/tools/tool-runner";
import {
  listTools,
  toWireToolDefinitions,
  defaultToolContext,
  type ToolDefinition,
  type ToolExecutionContext,
} from "@/core/agent/tools/registry";
import {
  buildToolCatalog,
  creatableResources,
  effectiveTools,
  type ToolCatalogEntry,
} from "@/core/agent/tool-catalog";
import {
  declaredTools,
  declaredToolNames,
  isMetaTool,
} from "@/core/agent/tool-discovery";
import {
  ApprovalStore,
  applyApprovalDecision,
  buildClinicalActionPlan,
  type ClinicalActionPlan,
} from "@/core/agent/approval-protocol";
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
import { browserApi } from "@/core/api/browser-client";
import type { ResourceCatalog } from "@/core/api/contracts";
import { isUiSpec, type UiSpec } from "@/core/agent/tools/ui-spec";
import { GeneratedUi } from "@/components/copilot/GeneratedUi";

/** Imagen adjunta a un mensaje: data URL para previsualizar + base64 puro para el cable. */
interface AttachedImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
  name: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: AttachedImage;
  isError?: boolean;
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
}

const TOOL_STATUS: Record<ToolCallStatus, { label: string; tone: BadgeTone }> = {
  running: { label: "Ejecutando…", tone: "info" },
  awaiting_approval: { label: "Requiere aprobación", tone: "warn" },
  success: { label: "Completada", tone: "ok" },
  error: { label: "Error", tone: "danger" },
  rejected: { label: "Rechazada", tone: "neutral" },
};

function previewContent(value: unknown): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
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

export function CopilotPanel() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [models, setModels] = useState<WireModel[]>([]);
  const [providers, setProviders] = useState<WireProviderStatus[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  // Esfuerzo de razonamiento NORMALIZADO por turno (P5). Solo se ofrece/envía cuando el modelo
  // negociado soporta el control; default "medium" (se omite en modelos sin razonamiento).
  const [reasoningEffort, setReasoningEffort] = useState<NormalizedReasoningEffort>("medium");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turn, setTurn] = useState<TurnState>(initialTurnState());
  const [toolCalls, setToolCalls] = useState<ToolCallView[]>([]);
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);

  // Gating por rol (tool-hardening): recursos en los que el médico puede crear (del catálogo
  // permission-projected). Las escrituras se filtran ANTES de declararlas al modelo. Vacío
  // por defecto: hasta cargar el catálogo no se ofrece ninguna escritura (defensa en
  // profundidad; FastAPI revalida igual). ``toolCatalog`` es la vista de procedencia/auditoría.
  const [toolCatalog, setToolCatalog] = useState<ToolCatalogEntry[]>([]);
  const creatableRef = useRef<Set<string>>(new Set());
  // Descubrimiento a escala (tool_search/tool_describe): nombres de tools CARGADAS bajo demanda
  // en este hilo. Se suman al set declarado en los turnos siguientes (el set por turno se
  // mantiene pequeño: núcleo + meta + cargadas). Persiste durante la vida del panel.
  const loadedToolsRef = useRef<Set<string>>(new Set());

  // RECALL (P2): nº de memorias del médico inyectadas en el último turno, para el indicador
  // de contexto. ``null`` = aún no hay turno con recall. Las memorias viajan como contexto NO
  // confiable; nunca como instrucciones (ver memory-recall).
  const [recalledCount, setRecalledCount] = useState<number | null>(null);

  // CONTEXTO CLÍNICO ACTIVO: paciente (y consulta opcional) sobre los que asiste el copiloto.
  // Acota el recall (P2) y se SURFACEA en el turno y el chip indicador. Sólo fija el ámbito (no
  // carga PHI del expediente). Ref para usarlo en los handlers del turno (closures con deps vacías).
  const [activeContext, setActiveContext] = useState<ActiveClinicalContext | null>(null);
  const activeContextRef = useRef<ActiveClinicalContext | null>(null);

  // CONTEXTO (P3): contabilidad usado/presupuesto para el indicador, y aviso de compactación.
  // ``usage`` se actualiza con la estimación local al enviar y con el usage REPORTADO por el
  // gateway al completar el turno. ``compaction`` describe la última compactación (si la hubo).
  const [contextStats, setContextStats] = useState<ContextUsage | null>(null);
  const [compaction, setCompaction] = useState<{ dropped: number; preservedIds: string[] } | null>(
    null,
  );
  // Planes APROBADOS que se conservan en el contexto verbatim (preserve): así el modelo
  // recuerda las acciones ya ejecutadas y sus identificadores aunque se compacte la charla.
  const approvedPlansRef = useRef<ContextSegment[]>([]);
  // Presupuesto del modelo seleccionado (ventana efectiva + input usable), para usarlo dentro
  // de los handlers del turno (closures con deps vacías).
  const budgetRef = useRef<{ window: number; usable: number }>({ window: 0, usable: 0 });
  // USO/COSTO (P7): acumulado de tokens de la sesión (este médico) y la tarifa del modelo
  // seleccionado. Refs para usarlos en los handlers del turno (closures con deps vacías).
  const sessionUsageRef = useRef<NormalizedUsage>(emptyUsage());
  const pricingRef = useRef<ModelCostRate | null>(null);
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

  const upsertToolCall = (view: ToolCallView): void => {
    setToolCalls((prev) => [...prev, view]);
  };

  const patchToolCall = (callId: string, patch: Partial<ToolCallView>): void => {
    setToolCalls((prev) =>
      prev.map((call) => (call.callId === callId ? { ...call, ...patch } : call)),
    );
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Mantiene el ref del contexto activo en sincronía para los handlers del turno (closures).
  useEffect(() => {
    activeContextRef.current = activeContext;
  }, [activeContext]);

  // Mantiene el presupuesto de contexto del modelo seleccionado (ventana efectiva + usable) y
  // su tarifa de precio (para el costo estimado P7).
  useEffect(() => {
    const model = models.find((entry) => entry.id === selectedModel);
    budgetRef.current = {
      window: effectiveContextWindow(model?.capabilities),
      usable: usableInputTokens(model?.capabilities),
    };
    pricingRef.current = resolvePricing(model);
  }, [models, selectedModel]);

  // Carga el catálogo de recursos (permission-projected) para gatear las tools de escritura
  // por rol y mostrar la procedencia. Si falla, queda vacío -> ninguna escritura se ofrece.
  useEffect(() => {
    let active = true;
    browserApi<ResourceCatalog>("/api/v1/resources")
      .then((catalog) => {
        if (!active) return;
        const creatable = creatableResources(catalog);
        creatableRef.current = creatable;
        const eff = effectiveTools(listTools(), creatable);
        setToolCatalog(
          buildToolCatalog(listTools(), creatable, declaredToolNames(eff, loadedToolsRef.current)),
        );
      })
      .catch(() => {
        if (!active) return;
        creatableRef.current = new Set();
        const eff = effectiveTools(listTools(), new Set());
        setToolCatalog(
          buildToolCatalog(listTools(), new Set(), declaredToolNames(eff, loadedToolsRef.current)),
        );
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
        if (next.assistantText.trim()) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "assistant", text: next.assistantText },
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
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: `No se pudo completar el turno: ${next.error?.message ?? next.error?.code ?? "error"}`,
            isError: true,
          },
        ]);
        turnRef.current = initialTurnState();
        setTurn(turnRef.current);
      } else if (event.type === "turn.cancelled") {
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
      const resolved = resolveToolCall(toolName, args);
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
        clientRef.current?.sendToolResult(turnId, callId, resolved.result);
        return;
      }

      const { tool, args: validArgs } = resolved;
      const argsText = previewContent(validArgs);

      if (tool.kind === "read") {
        upsertToolCall({ callId, turnId, name: tool.name, kind: "read", argsText, status: "running" });
        // Contexto de descubrimiento para las meta-tools (tool_search/tool_describe): el set
        // BUSCABLE es el efectivo (ya gateado por rol) sin las meta-tools; markLoaded suma las
        // cargadas (se declararán en turnos siguientes) y refresca la vista de procedencia.
        const eff = effectiveTools(listTools(), creatableRef.current);
        const ctx: ToolExecutionContext = {
          ...defaultToolContext,
          discovery: {
            searchable: eff.filter((candidate) => !isMetaTool(candidate.name)),
            markLoaded: (names) => {
              let changed = false;
              for (const name of names) {
                if (!loadedToolsRef.current.has(name)) {
                  loadedToolsRef.current.add(name);
                  changed = true;
                }
              }
              if (changed) {
                setToolCatalog(
                  buildToolCatalog(
                    listTools(),
                    creatableRef.current,
                    declaredToolNames(eff, loadedToolsRef.current),
                  ),
                );
              }
            },
          },
        };
        void executeTool(tool, validArgs, ctx).then((result) => {
          patchToolCall(
            callId,
            result.status === "success"
              ? { status: "success", resultText: previewContent(result.content), resultContent: result.content }
              : { status: "error", errorText: result.message },
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
        setSelectedModel((current) => current || event.models[0]?.id || "");
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

    const client = new AgentClient({
      gatewayUrl: getAgentGatewayUrl(),
      onEvent,
      onStatusChange: (next) => {
        setStatus(next);
        if (next === "connected") {
          client.listModels();
          client.providerStatus();
        }
      },
    });
    clientRef.current = client;
    void client.connect();

    return () => client.disconnect();
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
  const canSend =
    status === "connected" &&
    !isBusy &&
    (input.trim().length > 0 || attachedImage !== null);

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
    const userMessage: ChatMessage = {
      id: nextId(),
      role: "user",
      text,
      ...(image ? { image } : {}),
    };
    const history = [...messagesRef.current, userMessage];
    // Cada mensaje de la charla es un SEGMENTO atómico para la compactación (texto + cable).
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
      return { messages: [{ role: message.role, content }], text: message.text ?? "" };
    });

    setMessages(history);
    turnRef.current = { ...initialTurnState(), status: "running" };
    setTurn(turnRef.current);

    // RECALL antes de que el modelo responda: las memorias se inyectan como un mensaje
    // ``system`` delimitado al frente del contexto (datos, no instrucciones; ver memory-recall).
    const recall = await recallMemoryMessage();
    // Descubrimiento a escala: se declara solo el set ACOTADO (núcleo + meta + tools cargadas
    // bajo demanda), no todo el catálogo. El resto sigue accesible vía tool_search/tool_describe.
    const declared = declaredTools(
      effectiveTools(listTools(), creatableRef.current),
      loadedToolsRef.current,
    );
    const toolsWire = toWireToolDefinitions(declared);

    // PERSONA (P4) + CONTEXTO ACTIVO: capas LÍDER en orden fijo
    // [SEGURIDAD] -> [PERSONA] -> [CONTEXTO ACTIVO] -> [MEMORIAS]. La seguridad es fija (código),
    // SIEMPRE primera; el contexto activo (ámbito del paciente) es instrucción de confianza y va
    // antes de las memorias (datos no confiables). La conversación (compactada) va al final.
    const activeContextMessage = buildActiveContextMessage(activeContextRef.current);
    const leadingLayers = composeLeadingLayers(personaRef.current, recall, activeContextMessage);

    // CONTEXTO (P3): el overhead fijo (esquema de tools + capas líder) no se compacta; los
    // planes APROBADOS se conservan verbatim y la charla vieja se resume si excede el
    // presupuesto. Solo afecta la ventana que ve el modelo; el expediente en FastAPI no se toca.
    const leadingTokens = leadingLayers.reduce(
      (sum, message) => sum + estimateTokens(messageText(message)),
      0,
    );
    const overhead = estimateToolSchemaTokens(toolsWire) + leadingTokens;
    const segments: ContextSegment[] = [...approvedPlansRef.current, ...historySegments];
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
        approvedPlansRef.current = [
          ...approvedPlansRef.current,
          { messages: [{ role: "system", content: [{ type: "text", text: note }] }], text: note, preserve: true },
        ];
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
    // Rechazo: no se escribe nada; se reanuda el turno con el resultado de rechazo.
    patchToolCall(callId, { status: "rejected", errorText: outcome.result.message });
    clientRef.current?.sendToolResult(pending.turnId, callId, outcome.result);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--tx)]">Copiloto clínico</h1>
          <p className="mt-1 text-sm text-[var(--tx2)]">
            Asistente de IA conectado al gateway de modelos.
          </p>
        </div>
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </header>

      <div
        role="note"
        className="rounded-[12px] border border-[var(--border2)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-4 py-3 text-sm text-[var(--tx)]"
      >
        Toda salida de IA es un <strong>borrador</strong> que el médico debe revisar y aprobar.
        El copiloto nunca diagnostica, receta ni guarda información final de forma autónoma.
      </div>

      {status === "unavailable" && (
        <Card className="border-[var(--danger)]">
          <p className="text-sm text-[var(--tx)]">
            No se pudo conectar con el gateway de modelos. Puedes seguir usando el expediente con
            normalidad; el copiloto estará disponible cuando el gateway esté configurado.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Card className="flex flex-col gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--tx2)]">
            Modelo
          </label>
          <Select
            value={selectedModel}
            onChange={(event) => handleModelChange(event.target.value)}
            disabled={models.length === 0}
            aria-label="Modelo del copiloto"
          >
            {models.length === 0 ? (
              <option value="">Sin modelos disponibles</option>
            ) : (
              models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {model.protocol}
                </option>
              ))
            )}
          </Select>
          <p className="text-xs text-[var(--tx2)]">
            {models.length} modelo(s) en el catálogo del gateway.
            {selectedModelSupportsVision && " · admite imágenes"}
          </p>
          {selectedModelSupportsReasoning && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="copilot-reasoning-effort"
                className="text-xs font-semibold uppercase tracking-wide text-[var(--tx2)]"
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
        </Card>

        <Card className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--tx2)]">
            Proveedores
          </span>
          {providers.length === 0 ? (
            <span className="text-sm text-[var(--tx2)]">—</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {providers.map((provider) => (
                <Badge key={provider.protocol} tone={provider.available ? "ok" : "neutral"}>
                  {provider.protocol}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ActiveContextPicker context={activeContext} onChange={setActiveContext} />

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

      {contextStats && <ContextUsageBar usage={contextStats} compaction={compaction} />}

      {usageStats && <CostUsageBar stats={usageStats} />}

      <ToolCatalogPanel entries={toolCatalog} />

      <Card className="flex min-h-[280px] flex-col gap-3">
        <div className="flex-1 space-y-3" aria-live="polite">
          {messages.length === 0 && !isBusy && (
            <p className="text-sm text-[var(--tx2)]">
              Escribe un mensaje para empezar. El asistente responderá en borrador.
            </p>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {toolCalls.map((call) => (
            <ToolCallCard
              key={call.callId}
              call={call}
              onApprove={() => approveWrite(call.callId)}
              onReject={() => rejectWrite(call.callId)}
              onSendFollowup={handleSendFollowup}
            />
          ))}

          {isBusy && (
            <div className="rounded-[12px] bg-[var(--panel2)] px-3.5 py-2.5">
              <div className="mb-1 text-xs font-semibold text-[var(--tx2)]">Asistente (borrador)</div>
              <p className="whitespace-pre-wrap text-sm text-[var(--tx)]">
                {turn.assistantText || "Pensando…"}
              </p>
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

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => handleSelectImage(event.target.files?.[0] ?? null)}
              aria-hidden="true"
              tabIndex={-1}
            />
            {selectedModelSupportsVision && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={status !== "connected" || isBusy}
                className="shrink-0 rounded-[11px] border border-[var(--border2)] px-3 py-2.5 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
                aria-label="Adjuntar imagen"
                title="Adjuntar imagen"
              >
                Imagen
              </button>
            )}
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                status === "connected" ? "Escribe tu consulta…" : "Copiloto no conectado"
              }
              disabled={status !== "connected" || isBusy}
              aria-label="Mensaje para el copiloto"
            />
            {isBusy ? (
              <Button type="button" onClick={handleCancel} className="shrink-0">
                Cancelar
              </Button>
            ) : (
              <Button type="button" onClick={handleSend} disabled={!canSend} className="shrink-0">
                Enviar
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ContextUsageBar({
  usage,
  compaction,
}: Readonly<{
  usage: ContextUsage;
  compaction: { dropped: number; preservedIds: string[] } | null;
}>) {
  const tone =
    usage.percent >= 90 ? "var(--danger)" : usage.percent >= 75 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2.5 text-xs text-[var(--tx2)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Contexto</span>
        {usage.unknownBudget ? (
          <span>Presupuesto del modelo no informado</span>
        ) : (
          <span>
            {usage.used.toLocaleString("es")} / {usage.budget.toLocaleString("es")} tokens ·{" "}
            {usage.percent}% · {usage.source}
          </span>
        )}
      </div>
      {!usage.unknownBudget && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border2)]"
          role="progressbar"
          aria-valuenow={usage.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Uso del contexto del modelo"
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${usage.percent}%`, backgroundColor: tone }}
          />
        </div>
      )}
      {compaction && (
        <p>
          Se compactó la conversación: se resumieron {compaction.dropped} intercambio(s) antiguo(s)
          {compaction.preservedIds.length > 0
            ? `, conservando ${compaction.preservedIds.length} identificador(es) clínico(s).`
            : "."}{" "}
          Los datos del expediente no se modificaron.
        </p>
      )}
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
  const discoverable = entries.filter((entry) => entry.status === "discoverable");
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
          {declared.length} activas · {discoverable.length} bajo demanda · {gatedOut.length} restringidas{" "}
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--tx2)]">
            Para no inflar el contexto, cada turno se declara solo un núcleo pequeño de
            herramientas; el modelo descubre el resto «bajo demanda» con tool_search/tool_describe.
            Las acciones de escritura solo se ofrecen si tu rol permite crear en el recurso, y el
            servidor revalida cada acción.
          </p>
          <ul className="space-y-1">
            {entries.map((entry) => (
              <li
                key={entry.name}
                className="flex flex-wrap items-center gap-2 rounded-[8px] bg-[var(--panel2)] px-2.5 py-1.5"
              >
                <Badge tone={entry.kind === "write" ? "warn" : "accent"}>
                  {entry.kind === "write" ? "Escritura" : "Lectura"}
                </Badge>
                <code className="text-xs text-[var(--tx)]">{entry.name}</code>
                <span className="text-xs text-[var(--tx2)]">· {entry.source}</span>
                <Badge
                  tone={
                    entry.status === "declared"
                      ? "ok"
                      : entry.status === "discoverable"
                        ? "accent"
                        : "neutral"
                  }
                >
                  {entry.status === "declared"
                    ? "Activa"
                    : entry.status === "discoverable"
                      ? "Bajo demanda"
                      : "Restringida"}
                </Badge>
                {entry.reason ? (
                  <span className="text-xs text-[var(--tx2)]">{entry.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function MessageBubble({ message }: Readonly<{ message: ChatMessage }>) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-[var(--accent)] text-[var(--on-accent)]"
            : message.isError
              ? "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
              : "bg-[var(--panel2)] text-[var(--tx)]"
        }`}
      >
        {!isUser && (
          <div className="mb-1 text-xs font-semibold text-[var(--tx2)]">Asistente (borrador)</div>
        )}
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
    </div>
  );
}

function isSandboxResult(value: unknown): value is { value: unknown; logs: string[] } {
  return typeof value === "object" && value !== null && "logs" in value;
}

function ToolCallCard({
  call,
  onApprove,
  onReject,
  onSendFollowup,
}: Readonly<{
  call: ToolCallView;
  onApprove: () => void;
  onReject: () => void;
  onSendFollowup: (text: string) => void;
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

  return (
    <div className="rounded-[12px] border border-[var(--border2)] bg-[var(--bg2)] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={call.kind === "write" ? "warn" : "accent"}>
          {call.kind === "write" ? "Escritura" : "Lectura"}
        </Badge>
        <code className="text-sm font-semibold text-[var(--tx)]">{call.name}</code>
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
            <Button type="button" onClick={onApprove} className="shrink-0">
              Aprobar
            </Button>
            <button
              type="button"
              onClick={onReject}
              className="shrink-0 rounded-[11px] border border-[var(--border2)] px-[18px] py-2.5 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--panel2)]"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {uiSpec && (
        <div className="mt-2 rounded-[8px] bg-[var(--panel2)] p-3">
          <GeneratedUi spec={uiSpec} onSendFollowup={onSendFollowup} />
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
