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
import type { ServerEvent, WireModel, WireProviderStatus } from "@/core/agent/protocol";
import {
  executeTool,
  rejectedByUserResult,
  resolveToolCall,
} from "@/core/agent/tools/tool-runner";
import { toWireToolDefinitions, type ToolDefinition } from "@/core/agent/tools/registry";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
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
  resultText?: string;
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

const PROFILE_ID = "profile_clinical_assistant";

export function CopilotPanel() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [models, setModels] = useState<WireModel[]>([]);
  const [providers, setProviders] = useState<WireProviderStatus[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turn, setTurn] = useState<TurnState>(initialTurnState());
  const [toolCalls, setToolCalls] = useState<ToolCallView[]>([]);
  const [input, setInput] = useState("");

  const clientRef = useRef<AgentClient | null>(null);
  const turnRef = useRef<TurnState>(initialTurnState());
  const idRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Escrituras pendientes de aprobación: callId -> tool+args+turn (no se ejecutan
  // hasta que el médico confirme).
  const pendingWritesRef = useRef<
    Map<string, { tool: ToolDefinition; args: Record<string, unknown>; turnId: string }>
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
        void executeTool(tool, validArgs).then((result) => {
          patchToolCall(
            callId,
            result.status === "success"
              ? { status: "success", resultText: previewContent(result.content) }
              : { status: "error", errorText: result.message },
          );
          clientRef.current?.sendToolResult(turnId, callId, result);
        });
        return;
      }

      // Escritura: gated por confirmación explícita del médico (Aprobar / Rechazar).
      pendingWritesRef.current.set(callId, { tool, args: validArgs, turnId });
      upsertToolCall({
        callId,
        turnId,
        name: tool.name,
        kind: "write",
        argsText,
        status: "awaiting_approval",
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
  const canSend = status === "connected" && !isBusy && input.trim().length > 0;

  const handleSend = (): void => {
    const text = input.trim();
    if (!text || status !== "connected" || isBusy) {
      return;
    }
    const userMessage: ChatMessage = { id: nextId(), role: "user", text };
    const history = [...messagesRef.current, userMessage];
    const wireMessages = history.map((message) => ({
      role: message.role,
      content: [{ type: "text" as const, text: message.text }],
    }));

    setMessages(history);
    turnRef.current = { ...initialTurnState(), status: "running" };
    setTurn(turnRef.current);

    clientRef.current?.startTurn({
      profileId: PROFILE_ID,
      messages: wireMessages,
      // Declara al modelo las tools que el navegador puede ejecutar.
      tools: toWireToolDefinitions(),
      generation: { max_output_tokens: 1024 },
    });
    setInput("");
  };

  const handleCancel = (): void => {
    clientRef.current?.cancelTurn(turnRef.current.turnId ?? undefined);
  };

  const approveWrite = (callId: string): void => {
    const pending = pendingWritesRef.current.get(callId);
    if (!pending) {
      return;
    }
    pendingWritesRef.current.delete(callId);
    patchToolCall(callId, { status: "running" });
    void executeTool(pending.tool, pending.args).then((result) => {
      patchToolCall(
        callId,
        result.status === "success"
          ? { status: "success", resultText: previewContent(result.content) }
          : { status: "error", errorText: result.message },
      );
      clientRef.current?.sendToolResult(pending.turnId, callId, result);
    });
  };

  const rejectWrite = (callId: string): void => {
    const pending = pendingWritesRef.current.get(callId);
    if (!pending) {
      return;
    }
    pendingWritesRef.current.delete(callId);
    const result = rejectedByUserResult();
    patchToolCall(callId, { status: "rejected", errorText: result.message });
    clientRef.current?.sendToolResult(pending.turnId, callId, result);
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
            onChange={(event) => setSelectedModel(event.target.value)}
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
          </p>
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

        <div className="flex items-end gap-2 border-t border-[var(--border)] pt-3">
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
      </Card>
    </div>
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
        {message.text}
      </div>
    </div>
  );
}

function ToolCallCard({
  call,
  onApprove,
  onReject,
}: Readonly<{ call: ToolCallView; onApprove: () => void; onReject: () => void }>) {
  const meta = TOOL_STATUS[call.status];
  return (
    <div className="rounded-[12px] border border-[var(--border2)] bg-[var(--bg2)] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={call.kind === "write" ? "warn" : "accent"}>
          {call.kind === "write" ? "Escritura" : "Lectura"}
        </Badge>
        <code className="text-sm font-semibold text-[var(--tx)]">{call.name}</code>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--tx2)]">
        {call.argsText}
      </pre>

      {call.status === "awaiting_approval" && (
        <div className="mt-2">
          <p className="mb-2 text-xs text-[var(--tx2)]">
            El modelo propone una acción de escritura (crea un borrador). Requiere tu confirmación
            explícita.
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

      {call.status === "success" && call.resultText && (
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
