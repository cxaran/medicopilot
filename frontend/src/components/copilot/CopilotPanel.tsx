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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
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
  const [input, setInput] = useState("");

  const clientRef = useRef<AgentClient | null>(null);
  const turnRef = useRef<TurnState>(initialTurnState());
  const idRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);

  const nextId = (): string => {
    idRef.current += 1;
    return `m${idRef.current}`;
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
      generation: { max_output_tokens: 1024 },
    });
    setInput("");
  };

  const handleCancel = (): void => {
    clientRef.current?.cancelTurn(turnRef.current.turnId ?? undefined);
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

          {isBusy && (
            <div className="rounded-[12px] bg-[var(--panel2)] px-3.5 py-2.5">
              <div className="mb-1 text-xs font-semibold text-[var(--tx2)]">Asistente (borrador)</div>
              <p className="whitespace-pre-wrap text-sm text-[var(--tx)]">
                {turn.assistantText || "Pensando…"}
              </p>
              {turn.pendingToolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {turn.pendingToolCalls.map((call) => (
                    <div key={call.callId} className="text-xs">
                      <Badge tone="warn">Herramienta pendiente</Badge>{" "}
                      <span className="text-[var(--tx2)]">
                        El modelo pidió <code className="text-[var(--tx)]">{call.toolName}</code> (se
                        ejecutará en una próxima versión).
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
