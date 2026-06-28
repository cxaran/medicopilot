import { GatewayError } from "../../kernel/errors.js";
import { createId } from "../../kernel/ids.js";
import { emptyTurnUsage } from "../../domain/usage.js";
import { nativeReasoningEffort } from "../../domain/reasoning.js";
import type { GenerationOptions } from "../../application/capabilities/capability-negotiator.js";
import type { CanonicalMessage } from "../../domain/message.js";
import type { ModelDescriptor } from "../../domain/model.js";
import type { ModelToolDefinition, ToolCallResult } from "../../domain/tool.js";
import type { TurnUsage } from "../../domain/usage.js";
import type {
  CredentialVerification,
  ProviderAdapter,
  ProviderCredentialLease,
  ProviderEvent,
  ProviderResumeInput,
  ProviderTurnInput
} from "../../ports/provider-adapter.port.js";

/** Identificadores de proveedor opencode (alineados con AiProvider del backend). */
export type OpencodeProviderId = "opencode_zen" | "opencode_go";
export const OPENCODE_PROVIDER_ID: OpencodeProviderId = "opencode_zen";
export const OPENCODE_GO_PROVIDER_ID: OpencodeProviderId = "opencode_go";

// Modelos opencode con ENTRADA DE IMAGEN (visión). El /models de opencode NO expone
// modalidades, así que se curan aquí (alineado con el catálogo de OpenClaw). Si el row de
// /models sí trae `modalities`, ese metadato tiene prioridad sobre esta tabla.
const OPENCODE_VISION_MODEL_IDS = new Set<string>([
  "kimi-k2.5",
  "kimi-k2.6",
  "kimi-k2.7-code",
  "mimo-v2-omni",
  "mimo-v2.5",
  "qwen3.5-plus",
  "qwen3.6-plus",
  "qwen3.7-plus"
]);

/**
 * ¿El modelo opencode acepta imágenes? Cura por id (sufijo ``-free`` ignorado) más las
 * familias multimodales conocidas de Zen (Claude, Gemini). El resto se asume text-only de
 * forma honesta (no se inventa visión). minimax-m3, deepseek-* y glm-* son text-only.
 */
export function opencodeSupportsVision(modelId: string): boolean {
  const base = modelId.replace(/-free$/, "");
  if (OPENCODE_VISION_MODEL_IDS.has(base)) {
    return true;
  }
  return /^(claude-|gemini-)/.test(base);
}

export interface OpencodeProviderOptions {
  baseUrl: string;
  // Distingue Zen de Go: misma forma de cable (OpenAI-compatible) pero distinto
  // provider id (para arrendar la credencial correcta) y base URL. Default: zen.
  providerId?: OpencodeProviderId;
  fetchImpl?: typeof fetch;
}

// --- Tipos de cable OpenAI-compatible (parcial, solo lo que usamos). -------------

interface OpenAITextToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAITextToolCall[];
  tool_call_id?: string;
}

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface OpenAIStreamChoiceDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface OpenAIStreamChunk {
  choices?: { delta?: OpenAIStreamChoiceDelta; finish_reason?: string | null }[];
  usage?: OpenAIUsage | null;
}

interface OpenAIModelRow {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  context_window?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  supports_tools?: boolean;
  supports_reasoning?: boolean;
  modalities?: string[];
}

// Estado de continuación específico de opencode: el historial OpenAI (incl. el mensaje
// assistant con tool_calls) más las tools y opciones para reanudar /chat/completions.
interface OpencodeContinuationState {
  protocol: OpencodeProviderId;
  messages: OpenAIMessage[];
  tools: OpenAITool[];
  options: GenerationOptions;
}

function isOpencodeContinuationState(state: unknown): state is OpencodeContinuationState {
  const candidate = state as OpencodeContinuationState | null;
  return Boolean(
    candidate &&
      (candidate.protocol === OPENCODE_PROVIDER_ID || candidate.protocol === OPENCODE_GO_PROVIDER_ID) &&
      Array.isArray(candidate.messages)
  );
}

/**
 * Primer proveedor REAL del gateway (B5): adaptador opencode zen, OpenAI-compatible.
 *
 * Usa la credencial ARRENDADA (B4) en cada llamada (Authorization: Bearer <secret>);
 * el secreto NUNCA se loguea (el adaptador no escribe logs). El base URL es configurable
 * (provisional; se afina en B13 con la key real). Todo el HTTP se prueba mockeado.
 */
export class OpencodeProviderAdapter implements ProviderAdapter {
  readonly protocol: OpencodeProviderId;
  private readonly providerId: OpencodeProviderId;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpencodeProviderOptions) {
    this.providerId = options.providerId ?? OPENCODE_PROVIDER_ID;
    this.protocol = this.providerId;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verifyCredential(credential: ProviderCredentialLease): Promise<CredentialVerification> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.authHeaders(credential)
      });
      if (response.status === 401 || response.status === 403) {
        return { valid: false, reason: "unauthorized" };
      }
      if (!response.ok) {
        return { valid: false, reason: `status_${response.status}` };
      }
      return { valid: true };
    } catch {
      // No se propaga el error original para no arriesgar fugas de URL/secreto.
      return { valid: false, reason: "unreachable" };
    }
  }

  async discoverModels(credential: ProviderCredentialLease): Promise<ModelDescriptor[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.authHeaders(credential)
    });
    if (!response.ok) {
      throw new GatewayError(
        "PROVIDER_DISCOVERY_FAILED",
        `Opencode model discovery failed with status ${response.status}`
      );
    }

    const payload = (await response.json()) as { data?: OpenAIModelRow[] } | null;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((row) => this.toDescriptor(row));
  }

  async *startTurn(input: ProviderTurnInput): AsyncIterable<ProviderEvent> {
    input.signal.throwIfAborted();
    const messages = toOpenAIMessages(input.messages);
    const tools = toOpenAITools(input.tools);
    yield* this.runCompletion({
      model: input.model,
      credential: input.credential,
      messages,
      tools,
      options: input.options,
      signal: input.signal
    });
  }

  async *resumeTurn(input: ProviderResumeInput): AsyncIterable<ProviderEvent> {
    input.signal.throwIfAborted();
    const state = input.continuationState;
    if (!isOpencodeContinuationState(state)) {
      throw new GatewayError(
        "INVALID_CONTINUATION_STATE",
        "Missing or invalid opencode continuation state"
      );
    }

    const toolMessages: OpenAIMessage[] = input.toolResults.map((result) => ({
      role: "tool",
      tool_call_id: result.callId,
      content: toolResultContent(result)
    }));

    yield* this.runCompletion({
      model: input.model,
      credential: input.credential,
      messages: [...state.messages, ...toolMessages],
      tools: state.tools,
      options: state.options,
      signal: input.signal
    });
  }

  private authHeaders(credential: ProviderCredentialLease): Record<string, string> {
    // El secreto arrendado va SOLO en el header Authorization; nunca se loguea.
    return { authorization: `Bearer ${credential.secret}` };
  }

  private async *runCompletion(params: {
    model: ModelDescriptor;
    credential: ProviderCredentialLease;
    messages: OpenAIMessage[];
    tools: OpenAITool[];
    options: GenerationOptions;
    signal: AbortSignal;
  }): AsyncGenerator<ProviderEvent> {
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
    // Nivel normalizado -> parámetro nativo (low|medium|high; "max"->"high"). Solo se envía
    // si el modelo soporta el control (compat) y el mapeo da un valor; si no, se OMITE.
    const reasoningEffort =
      compat.supportsReasoningEffort
        ? nativeReasoningEffort(params.model.route.protocol, params.options.reasoningEffort)
        : null;
    if (reasoningEffort) {
      body.reasoning_effort = reasoningEffort;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders(params.credential) },
      body: JSON.stringify(body),
      signal: params.signal
    });

    if (!response.ok) {
      throw new GatewayError(
        "PROVIDER_REQUEST_FAILED",
        `Opencode chat completion failed with status ${response.status}`
      );
    }
    if (!response.body) {
      throw new GatewayError("PROVIDER_REQUEST_FAILED", "Opencode chat completion returned no body");
    }

    let assistantText = "";
    let usage: TurnUsage = emptyTurnUsage();
    let finishReason: string | null = null;
    const toolAccumulators = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") {
        break;
      }

      let chunk: OpenAIStreamChunk;
      try {
        chunk = JSON.parse(data) as OpenAIStreamChunk;
      } catch {
        continue;
      }

      if (chunk.usage) {
        usage = mapUsage(chunk.usage);
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
      const calls = [...toolAccumulators.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, value]) => value);
      const first = calls[0];
      if (!first) {
        // finish_reason=tool_calls sin acumular ninguna: trátalo como completado.
        yield { type: "completed", usage };
        return;
      }

      const assistantMessage: OpenAIMessage = {
        role: "assistant",
        content: assistantText.length > 0 ? assistantText : null,
        tool_calls: calls.map((call) => ({
          id: call.id || createId("call"),
          type: "function",
          function: { name: call.name, arguments: call.args }
        }))
      };

      const continuationState: OpencodeContinuationState = {
        protocol: this.providerId,
        messages: [...params.messages, assistantMessage],
        tools: params.tools,
        options: params.options
      };

      // El gateway reenvía una tool call por vez (waiting_for_tool); se emite la primera.
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

  private toDescriptor(row: OpenAIModelRow): ModelDescriptor {
    return createOpencodeModel({
      baseUrl: this.baseUrl,
      modelId: row.id,
      row,
      providerId: this.providerId
    });
  }
}

/**
 * Construye un ModelDescriptor de opencode con capacidades OpenAI-compatible. Si se pasa
 * una fila de /models (`row`), se enriquece desde sus metadatos; donde falten, defaults.
 */
export function createOpencodeModel(input: {
  baseUrl: string;
  modelId: string;
  row?: OpenAIModelRow;
  providerId?: OpencodeProviderId;
}): ModelDescriptor {
  const row = input.row;
  const providerId = input.providerId ?? OPENCODE_PROVIDER_ID;
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const supportsTools = row?.supports_tools ?? true;
  const supportsReasoning = row?.supports_reasoning ?? false;
  // Si /models trae `modalities`, ese metadato manda; si no (caso opencode, que devuelve filas
  // bare), se cura la visión por id con `opencodeSupportsVision`.
  const hasVision = row?.modalities
    ? row.modalities.includes("image")
    : opencodeSupportsVision(input.modelId);
  const inputModalities = new Set<"text" | "image" | "audio" | "video" | "file">(["text"]);
  if (hasVision) {
    inputModalities.add("image");
  }
  const contextWindow = row?.context_length ?? row?.context_window ?? 128000;
  const maxOutput = row?.max_output_tokens ?? row?.max_tokens ?? null;

  return {
    id: `${providerId}/${input.modelId}`,
    label: row?.name ?? input.modelId,
    route: {
      providerId,
      providerModelId: input.modelId,
      protocol: providerId,
      endpointBaseUrl: baseUrl
    },
    capabilities: {
      streaming: "supported",
      inputModalities,
      outputModalities: new Set(["text"]),
      toolCalling: {
        support: supportsTools ? "supported" : "unsupported",
        strictSchema: "unknown",
        parallelCalls: "supported"
      },
      structuredOutput: {
        jsonObject: "supported",
        jsonSchema: "unknown",
        strictSchema: "unknown"
      },
      reasoning: {
        support: supportsReasoning ? "supported" : "unknown",
        allowedEfforts: supportsReasoning ? ["low", "medium", "high"] : [],
        summaryOutput: "unknown"
      },
      promptCaching: { read: "unknown", write: "unknown" },
      tokenCounting: { exact: "unsupported", estimated: "supported" },
      contextWindowTokens: contextWindow,
      effectiveContextTokens: null,
      maxOutputTokens: maxOutput,
      compat: {
        supportsTools,
        supportsReasoningEffort: supportsReasoning,
        thinkingFormat: supportsReasoning ? "openai_reasoning_effort" : "none",
        supportsStrictMode: false,
        supportsUsageInStreaming: true,
        supportsEagerToolInputStreaming: true
      }
    },
    source: row ? "discovered" : "curated",
    metadataRevision: row?.created != null ? String(row.created) : null,
    deprecatedAt: null
  };
}

// --- Helpers de mapeo y parsing. --------------------------------------------------

function toOpenAIMessages(messages: CanonicalMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    const onlyText = message.content.every((part) => part.type === "text");
    if (onlyText) {
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return { role: message.role, content: text };
    }

    const parts: OpenAIContentPart[] = message.content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      return { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } };
    });
    return { role: message.role, content: parts };
  });
}

function toOpenAITools(tools: ModelToolDefinition[]): OpenAITool[] {
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

function toolResultContent(result: ToolCallResult): string {
  if (result.result.status === "success") {
    return typeof result.result.content === "string"
      ? result.result.content
      : JSON.stringify(result.result.content);
  }
  return JSON.stringify({ error: { code: result.result.code, message: result.result.message } });
}

function mapUsage(usage: OpenAIUsage): TurnUsage {
  return {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: null
  };
}

function safeParseJson(raw: string): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

/**
 * Parser SSE incremental sobre el ReadableStream de la respuesta. Emite el payload de
 * cada línea `data:` (sin el prefijo). No interpreta el JSON: eso lo hace el llamador.
 */
async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
