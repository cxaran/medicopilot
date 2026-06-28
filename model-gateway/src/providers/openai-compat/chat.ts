import { GatewayError } from "../../kernel/errors.js";
import { createId } from "../../kernel/ids.js";
import { emptyTurnUsage } from "../../domain/usage.js";
import type { GenerationOptions } from "../../application/capabilities/capability-negotiator.js";
import type { CanonicalMessage } from "../../domain/message.js";
import type { ModelDescriptor } from "../../domain/model.js";
import type { ModelToolDefinition, ToolCallResult } from "../../domain/tool.js";
import type { TurnUsage } from "../../domain/usage.js";
import type { ProviderEvent } from "../../ports/provider-adapter.port.js";

/**
 * Núcleo de cable OpenAI-COMPATIBLE (chat/completions) compartido por los proveedores que
 * hablan ese protocolo: OpenAI (flavor chat_completions) y OpenRouter. Concentra el build de
 * la request, el bucle de streaming SSE (deltas de texto/razonamiento + acumulación de
 * tool_calls) y el relay de tool-call (continuación + reanudación). Lo específico de cada
 * proveedor (auth, headers extra, mapeo de capacidades en discovery y el parámetro de
 * razonamiento) lo aporta el adaptador vía parámetros. No introduce dependencias de framework.
 *
 * Relay CLIENT-EJECUTA: el gateway NUNCA ejecuta tools clínicas; solo reenvía la tool-call al
 * navegador y, al reanudar, reinyecta el resultado como mensaje `tool`.
 */

// --- Tipos de cable (OAC = OpenAI-compatible chat). --------------------------------

export interface OACTextToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type OACContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface OACMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OACContentPart[] | null;
  tool_calls?: OACTextToolCall[];
  tool_call_id?: string;
}

export interface OACTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
}

interface OACUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface OACStreamChoiceDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface OACStreamChunk {
  choices?: { delta?: OACStreamChoiceDelta; finish_reason?: string | null }[];
  usage?: OACUsage | null;
}

// --- Estado de continuación del flavor chat_completions. ---------------------------

export interface OpenAICompatChatContinuation {
  // Marcador del proveedor dueño (p. ej. "openai" / "openai_chat_completions"): cada adaptador
  // valida el suyo en resumeTurn para no reanudar con un estado ajeno.
  protocol: string;
  flavor: "chat_completions";
  messages: OACMessage[];
  tools: OACTool[];
  options: GenerationOptions;
}

export function isOpenAICompatChatContinuation(
  state: unknown,
  protocol: string
): state is OpenAICompatChatContinuation {
  const c = state as OpenAICompatChatContinuation | null;
  return Boolean(
    c && c.protocol === protocol && c.flavor === "chat_completions" && Array.isArray(c.messages)
  );
}

// --- Mapeo de dominio -> cable. ----------------------------------------------------

export function toOpenAICompatMessages(messages: CanonicalMessage[]): OACMessage[] {
  return messages.map((message) => {
    const onlyText = message.content.every((part) => part.type === "text");
    if (onlyText) {
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return { role: message.role, content: text };
    }
    const parts: OACContentPart[] = message.content.map((part) =>
      part.type === "text"
        ? { type: "text", text: part.text }
        : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } }
    );
    return { role: message.role, content: parts };
  });
}

export function toOpenAICompatTools(tools: ModelToolDefinition[]): OACTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      ...(tool.strict ? { strict: true } : {})
    }
  }));
}

export function toToolResultMessages(results: ToolCallResult[]): OACMessage[] {
  return results.map((result) => ({
    role: "tool",
    tool_call_id: result.callId,
    content: toolResultContent(result)
  }));
}

export function toolResultContent(result: ToolCallResult): string {
  if (result.result.status === "success") {
    return typeof result.result.content === "string"
      ? result.result.content
      : JSON.stringify(result.result.content);
  }
  return JSON.stringify({ error: { code: result.result.code, message: result.result.message } });
}

export function safeParseJson(raw: string): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

function mapChatUsage(usage: OACUsage): TurnUsage {
  return {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    // La familia OpenAI chat/completions no reporta creación de caché por separado.
    cacheWriteTokens: null
  };
}

// --- Motor de turno chat/completions. ----------------------------------------------

export interface RunOpenAICompatChatParams {
  baseUrl: string;
  fetchImpl: typeof fetch;
  // Para los mensajes de error (p. ej. "OpenAI" / "OpenRouter").
  providerLabel: string;
  // Marcador que se graba en el estado de continuación (valida el resume del adaptador dueño).
  continuationProtocol: string;
  // Headers de autenticación ya construidos por el adaptador (Bearer la key arrendada).
  authHeaders: Record<string, string>;
  // Headers extra opcionales del proveedor (p. ej. HTTP-Referer/X-Title de OpenRouter).
  extraHeaders?: Record<string, string> | undefined;
  model: ModelDescriptor;
  messages: OACMessage[];
  tools: OACTool[];
  options: GenerationOptions;
  // Fragmento de cuerpo específico del proveedor (p. ej. el parámetro de razonamiento, que
  // difiere: OpenAI usa `reasoning_effort`, OpenRouter usa `reasoning: { effort }`).
  bodyExtensions?: Record<string, unknown> | undefined;
  signal: AbortSignal;
}

export async function* runOpenAICompatChat(
  params: RunOpenAICompatChatParams
): AsyncGenerator<ProviderEvent> {
  const compat = params.model.capabilities.compat;
  const body: Record<string, unknown> = {
    model: params.model.route.providerModelId,
    messages: params.messages,
    stream: true,
    max_tokens: params.options.maxOutputTokens
  };
  if (params.tools.length > 0) {
    body.tools = params.tools;
    body.tool_choice = "auto";
  }
  if (params.options.temperature !== undefined) {
    body.temperature = params.options.temperature;
  }
  if (compat.supportsUsageInStreaming) {
    body.stream_options = { include_usage: true };
  }
  if (params.options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  // Extensiones del proveedor al final (razonamiento u otros parámetros de cable).
  Object.assign(body, params.bodyExtensions ?? {});

  const response = await params.fetchImpl(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...params.authHeaders,
      ...(params.extraHeaders ?? {})
    },
    body: JSON.stringify(body),
    signal: params.signal
  });
  if (!response.ok) {
    throw new GatewayError(
      "PROVIDER_REQUEST_FAILED",
      `${params.providerLabel} chat completion failed with status ${response.status}`
    );
  }
  if (!response.body) {
    throw new GatewayError("PROVIDER_REQUEST_FAILED", `${params.providerLabel} chat completion returned no body`);
  }

  let assistantText = "";
  let usage: TurnUsage = emptyTurnUsage();
  let finishReason: string | null = null;
  const toolAccumulators = new Map<number, { id: string; name: string; args: string }>();

  for await (const data of readServerSentEvents(response.body)) {
    if (data === "[DONE]") {
      break;
    }
    let chunk: OACStreamChunk;
    try {
      chunk = JSON.parse(data) as OACStreamChunk;
    } catch {
      continue;
    }
    if (chunk.usage) {
      usage = mapChatUsage(chunk.usage);
    }
    const choice = chunk.choices?.[0];
    if (!choice) {
      continue;
    }
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      assistantText += delta.content;
      yield { type: "text.delta", delta: delta.content };
    }
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      yield { type: "reasoning.summary", summary: reasoning };
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const toolCallDelta of delta.tool_calls) {
        const index = toolCallDelta.index ?? 0;
        const current = toolAccumulators.get(index) ?? { id: "", name: "", args: "" };
        if (toolCallDelta.id) {
          current.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          current.name = toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          current.args += toolCallDelta.function.arguments;
        }
        toolAccumulators.set(index, current);
      }
    }
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  if (finishReason === "tool_calls" || toolAccumulators.size > 0) {
    const calls = [...toolAccumulators.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
    const first = calls[0];
    if (!first) {
      yield { type: "completed", usage };
      return;
    }
    const assistantMessage: OACMessage = {
      role: "assistant",
      content: assistantText.length > 0 ? assistantText : null,
      tool_calls: calls.map((call) => ({
        id: call.id || createId("call"),
        type: "function",
        function: { name: call.name, arguments: call.args }
      }))
    };
    const continuationState: OpenAICompatChatContinuation = {
      protocol: params.continuationProtocol,
      flavor: "chat_completions",
      messages: [...params.messages, assistantMessage],
      tools: params.tools,
      options: params.options
    };
    yield {
      type: "tool_call.ready",
      continuationState,
      call: {
        callId: first.id || createId("call"),
        name: first.name,
        arguments: safeParseJson(first.args)
      }
    };
    return;
  }

  yield { type: "completed", usage };
}

/**
 * Parser SSE incremental sobre el ReadableStream. Emite el payload de cada línea `data:` (sin
 * el prefijo); no interpreta el JSON (lo hace el llamador).
 */
export async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          yield line.slice(5).trim();
        }
      }
    }
    const remainder = buffer.trim();
    if (remainder.startsWith("data:")) {
      yield remainder.slice(5).trim();
    }
  } finally {
    reader.releaseLock();
  }
}
