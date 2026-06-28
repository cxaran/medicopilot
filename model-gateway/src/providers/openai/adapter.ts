import { GatewayError } from "../../kernel/errors.js";
import { createId } from "../../kernel/ids.js";
import { emptyTurnUsage } from "../../domain/usage.js";
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

/**
 * Adaptador de proveedor OpenAI / Codex (P6, paridad OpenClaw Codex provider). Un solo
 * provider id ``openai`` cubre DOS "auth shapes" (patrón OpenClaw: la auth elige el
 * transporte para el mismo provider): API key directa o suscripción ChatGPT Plus vía OAuth
 * (Codex). El puente de arriendo (B4/B10) ya resuelve ambos casos y entrega un Bearer (la
 * API key descifrada o el access token OAuth refrescado), así que el adaptador SIEMPRE
 * autentica con ``Authorization: Bearer <secret>`` y nunca ve ni almacena la credencial.
 *
 * Dos FAMILIAS de cable, seleccionadas por ``apiFlavor``:
 *  - ``chat_completions``: OpenAI estándar (/chat/completions + /models), como opencode.
 *  - ``codex_responses``: app-server Responses de Codex (/responses) para los turnos de
 *    AGENTE de la suscripción ChatGPT Plus (modela el runtime nativo Codex de OpenClaw).
 *
 * Relay de tools (el navegador ejecuta; el gateway NUNCA toca tools clínicas), streaming
 * acumulado a snapshot, y resolución de capacidades HONESTA (lo desconocido es null/unknown,
 * jamás stub en el camino real). Aislamiento por usuario: el lease es transitorio.
 */

export const OPENAI_PROVIDER_ID = "openai";
export type OpenAIApiFlavor = "chat_completions" | "codex_responses";

export interface OpenAIProviderOptions {
  baseUrl: string;
  // Familia de cable. Default: chat_completions (OpenAI API key). Para ChatGPT Plus/Codex
  // (OAuth) se usa codex_responses contra el base URL del backend de ChatGPT.
  apiFlavor?: OpenAIApiFlavor;
  fetchImpl?: typeof fetch;
}

// Ventanas de contexto DOCUMENTADAS públicamente por familia de modelo OpenAI (prefijo).
// Solo se usan cuando el proveedor NO expone metadatos (caso Codex/Responses). No es un
// stub: son valores publicados; lo que no esté aquí queda como null (desconocido honesto).
const OPENAI_DOCUMENTED_CONTEXT: ReadonlyArray<readonly [RegExp, number]> = [
  [/^gpt-5/, 400000],
  [/^gpt-4\.1/, 1047576],
  [/^gpt-4o/, 128000],
  [/^o[134](-|$)/, 200000]
];

// Familias de modelos OpenAI que razonan (documentado): serie o* y gpt-5. El resto, unknown.
const OPENAI_REASONING_RE = /^(o[134](-|$)|gpt-5)/;

function documentedContextWindow(modelId: string): number | null {
  for (const [re, window] of OPENAI_DOCUMENTED_CONTEXT) {
    if (re.test(modelId)) {
      return window;
    }
  }
  return null;
}

// --- Tipos de cable chat/completions (parcial; igual que opencode). ----------------

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

// --- Tipos de cable Responses (Codex app-server; parcial). -------------------------

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "input_image"; image_url: string };

type ResponsesInputItem =
  | { type: "message"; role: "system" | "user" | "assistant"; content: ResponsesContentPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

interface ResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

// Evento SSE del Responses API: lleva un `type` discriminante.
interface ResponsesStreamEvent {
  type: string;
  delta?: string;
  item?: { type?: string; call_id?: string; id?: string; name?: string; arguments?: string };
  response?: { usage?: ResponsesUsage | null };
}

// --- Estado de continuación (por flavor). ------------------------------------------

interface ChatContinuationState {
  protocol: "openai";
  flavor: "chat_completions";
  messages: OpenAIMessage[];
  tools: OpenAITool[];
  options: GenerationOptions;
}

interface CodexContinuationState {
  protocol: "openai";
  flavor: "codex_responses";
  input: ResponsesInputItem[];
  tools: ResponsesTool[];
  options: GenerationOptions;
}

type OpenAIContinuationState = ChatContinuationState | CodexContinuationState;

function isOpenAIContinuationState(state: unknown): state is OpenAIContinuationState {
  const c = state as OpenAIContinuationState | null;
  return Boolean(
    c &&
      c.protocol === "openai" &&
      (c.flavor === "chat_completions" || c.flavor === "codex_responses")
  );
}

export class OpenAIProviderAdapter implements ProviderAdapter {
  readonly protocol = "openai" as const;
  private readonly baseUrl: string;
  private readonly apiFlavor: OpenAIApiFlavor;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiFlavor = options.apiFlavor ?? "chat_completions";
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
      // En Codex/Responses /models puede no existir (404): no es "no autorizado", así que
      // se acepta como válido (la verificación real ocurre en el turno).
      if (response.ok || (this.apiFlavor === "codex_responses" && response.status === 404)) {
        return { valid: true };
      }
      return { valid: false, reason: `status_${response.status}` };
    } catch {
      return { valid: false, reason: "unreachable" };
    }
  }

  async discoverModels(credential: ProviderCredentialLease): Promise<ModelDescriptor[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.authHeaders(credential)
    });
    if (!response.ok) {
      // Codex/Responses (suscripción) suele NO exponer /models: el modelo se ofrece por
      // catálogo curado (lo registra el container con su id documentado). No es un error.
      if (this.apiFlavor === "codex_responses") {
        return [];
      }
      throw new GatewayError(
        "PROVIDER_DISCOVERY_FAILED",
        `OpenAI model discovery failed with status ${response.status}`
      );
    }
    const payload = (await response.json()) as { data?: OpenAIModelRow[] } | null;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((row) =>
      createOpenAIModel({ baseUrl: this.baseUrl, modelId: row.id, row, apiFlavor: this.apiFlavor })
    );
  }

  async *startTurn(input: ProviderTurnInput): AsyncIterable<ProviderEvent> {
    input.signal.throwIfAborted();
    if (this.apiFlavor === "codex_responses") {
      yield* this.runCodexResponses({
        model: input.model,
        credential: input.credential,
        input: toResponsesInput(input.messages),
        tools: toResponsesTools(input.tools),
        options: input.options,
        signal: input.signal
      });
      return;
    }
    yield* this.runChatCompletion({
      model: input.model,
      credential: input.credential,
      messages: toOpenAIMessages(input.messages),
      tools: toOpenAITools(input.tools),
      options: input.options,
      signal: input.signal
    });
  }

  async *resumeTurn(input: ProviderResumeInput): AsyncIterable<ProviderEvent> {
    input.signal.throwIfAborted();
    const state = input.continuationState;
    if (!isOpenAIContinuationState(state)) {
      throw new GatewayError("INVALID_CONTINUATION_STATE", "Missing or invalid OpenAI continuation state");
    }

    if (state.flavor === "codex_responses") {
      const outputs: ResponsesInputItem[] = input.toolResults.map((result) => ({
        type: "function_call_output",
        call_id: result.callId,
        output: toolResultContent(result)
      }));
      yield* this.runCodexResponses({
        model: input.model,
        credential: input.credential,
        input: [...state.input, ...outputs],
        tools: state.tools,
        options: state.options,
        signal: input.signal
      });
      return;
    }

    const toolMessages: OpenAIMessage[] = input.toolResults.map((result) => ({
      role: "tool",
      tool_call_id: result.callId,
      content: toolResultContent(result)
    }));
    yield* this.runChatCompletion({
      model: input.model,
      credential: input.credential,
      messages: [...state.messages, ...toolMessages],
      tools: state.tools,
      options: state.options,
      signal: input.signal
    });
  }

  private authHeaders(credential: ProviderCredentialLease): Record<string, string> {
    // El Bearer arrendado (API key o access token OAuth) va SOLO aquí; nunca se loguea.
    return { authorization: `Bearer ${credential.secret}` };
  }

  // --- chat/completions (OpenAI estándar / API key). -------------------------------

  private async *runChatCompletion(params: {
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
    if (params.options.reasoningEffort && compat.supportsReasoningEffort) {
      body.reasoning_effort = params.options.reasoningEffort;
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
        `OpenAI chat completion failed with status ${response.status}`
      );
    }
    if (!response.body) {
      throw new GatewayError("PROVIDER_REQUEST_FAILED", "OpenAI chat completion returned no body");
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
      const assistantMessage: OpenAIMessage = {
        role: "assistant",
        content: assistantText.length > 0 ? assistantText : null,
        tool_calls: calls.map((call) => ({
          id: call.id || createId("call"),
          type: "function",
          function: { name: call.name, arguments: call.args }
        }))
      };
      const continuationState: ChatContinuationState = {
        protocol: "openai",
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

  // --- Responses (Codex app-server / suscripción ChatGPT Plus). --------------------

  private async *runCodexResponses(params: {
    model: ModelDescriptor;
    credential: ProviderCredentialLease;
    input: ResponsesInputItem[];
    tools: ResponsesTool[];
    options: GenerationOptions;
    signal: AbortSignal;
  }): AsyncGenerator<ProviderEvent> {
    const compat = params.model.capabilities.compat;
    const body: Record<string, unknown> = {
      model: params.model.route.providerModelId,
      input: params.input,
      stream: true,
      max_output_tokens: params.options.maxOutputTokens
    };
    if (params.tools.length > 0) {
      body.tools = params.tools;
      body.tool_choice = "auto";
    }
    if (params.options.reasoningEffort && compat.supportsReasoningEffort) {
      body.reasoning = { effort: params.options.reasoningEffort };
    }

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.authHeaders(params.credential) },
      body: JSON.stringify(body),
      signal: params.signal
    });
    if (!response.ok) {
      throw new GatewayError(
        "PROVIDER_REQUEST_FAILED",
        `Codex responses request failed with status ${response.status}`
      );
    }
    if (!response.body) {
      throw new GatewayError("PROVIDER_REQUEST_FAILED", "Codex responses returned no body");
    }

    let usage: TurnUsage = emptyTurnUsage();
    let assistantText = "";
    const toolCalls: { callId: string; name: string; args: string }[] = [];

    for await (const data of readServerSentEvents(response.body)) {
      if (data === "[DONE]") {
        break;
      }
      let event: ResponsesStreamEvent;
      try {
        event = JSON.parse(data) as ResponsesStreamEvent;
      } catch {
        continue;
      }

      switch (event.type) {
        case "response.output_text.delta": {
          if (typeof event.delta === "string" && event.delta.length > 0) {
            assistantText += event.delta;
            yield { type: "text.delta", delta: event.delta };
          }
          break;
        }
        case "response.reasoning_summary_text.delta": {
          if (typeof event.delta === "string" && event.delta.length > 0) {
            yield { type: "reasoning.summary", summary: event.delta };
          }
          break;
        }
        case "response.output_item.done": {
          const item = event.item;
          if (item?.type === "function_call" && typeof item.name === "string") {
            toolCalls.push({
              callId: item.call_id || item.id || createId("call"),
              name: item.name,
              args: item.arguments ?? ""
            });
          }
          break;
        }
        case "response.completed": {
          if (event.response?.usage) {
            usage = mapResponsesUsage(event.response.usage);
          }
          break;
        }
        case "response.failed":
        case "error": {
          throw new GatewayError("PROVIDER_REQUEST_FAILED", "Codex responses stream reported an error");
        }
        default:
          break;
      }
    }

    const first = toolCalls[0];
    if (first) {
      const assistantItems: ResponsesInputItem[] = [];
      if (assistantText.length > 0) {
        assistantItems.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: assistantText }]
        });
      }
      // El item function_call debe quedar en el input para que el function_call_output case.
      assistantItems.push({
        type: "function_call",
        call_id: first.callId,
        name: first.name,
        arguments: first.args
      });
      const continuationState: CodexContinuationState = {
        protocol: "openai",
        flavor: "codex_responses",
        input: [...params.input, ...assistantItems],
        tools: params.tools,
        options: params.options
      };
      yield {
        type: "tool_call.ready",
        continuationState,
        call: { callId: first.callId, name: first.name, arguments: safeParseJson(first.args) }
      };
      return;
    }

    yield { type: "completed", usage };
  }
}

/**
 * Construye un ModelDescriptor OpenAI/Codex. Si llega una fila de /models con metadatos, se
 * usan; donde el proveedor no expone nada (caso Codex), se cae a las VENTANAS DOCUMENTADAS
 * por familia y a las familias de razonamiento documentadas; lo desconocido queda null/unknown
 * (jamás un stub inventado).
 */
export function createOpenAIModel(input: {
  baseUrl: string;
  modelId: string;
  row?: OpenAIModelRow;
  apiFlavor?: OpenAIApiFlavor;
}): ModelDescriptor {
  const row = input.row;
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const supportsTools = row?.supports_tools ?? true;
  const supportsReasoning = row?.supports_reasoning ?? OPENAI_REASONING_RE.test(input.modelId);
  const hasVision = row?.modalities ? row.modalities.includes("image") : false;
  const inputModalities = new Set<"text" | "image" | "audio" | "video" | "file">(["text"]);
  if (hasVision) {
    inputModalities.add("image");
  }
  // Ventana: metadato del proveedor si lo hay; si no, ventana documentada por familia; si no,
  // null (desconocido honesto → el budgeter usará el cap global del gateway).
  const contextWindow =
    row?.context_length ?? row?.context_window ?? documentedContextWindow(input.modelId);
  const maxOutput = row?.max_output_tokens ?? row?.max_tokens ?? null;

  return {
    id: `${OPENAI_PROVIDER_ID}/${input.modelId}`,
    label: row?.name ?? input.modelId,
    route: {
      providerId: OPENAI_PROVIDER_ID,
      providerModelId: input.modelId,
      protocol: "openai",
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
        supportsUsageInStreaming: input.apiFlavor !== "codex_responses",
        supportsEagerToolInputStreaming: true
      }
    },
    source: row ? "discovered" : "curated",
    metadataRevision: row?.created != null ? String(row.created) : null,
    deprecatedAt: null
  };
}

// --- Helpers de mapeo (compartidos / por flavor). ---------------------------------

function toOpenAIMessages(messages: CanonicalMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    const onlyText = message.content.every((part) => part.type === "text");
    if (onlyText) {
      const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return { role: message.role, content: text };
    }
    const parts: OpenAIContentPart[] = message.content.map((part) =>
      part.type === "text"
        ? { type: "text", text: part.text }
        : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } }
    );
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

function toResponsesInput(messages: CanonicalMessage[]): ResponsesInputItem[] {
  return messages.map((message) => {
    const role = message.role === "tool" ? "user" : message.role;
    const content: ResponsesContentPart[] = message.content.map((part) => {
      if (part.type === "text") {
        // El rol assistant usa output_text; el resto, input_text (forma del Responses API).
        return role === "assistant"
          ? { type: "output_text", text: part.text }
          : { type: "input_text", text: part.text };
      }
      return { type: "input_image", image_url: `data:${part.mimeType};base64,${part.data}` };
    });
    return { type: "message", role, content };
  });
}

function toResponsesTools(tools: ModelToolDefinition[]): ResponsesTool[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
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

function mapChatUsage(usage: OpenAIUsage): TurnUsage {
  return {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? null
  };
}

function mapResponsesUsage(usage: ResponsesUsage): TurnUsage {
  return {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? null
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
 * Parser SSE incremental sobre el ReadableStream. Emite el payload de cada línea `data:`
 * (sin el prefijo); no interpreta el JSON (lo hace el llamador).
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
