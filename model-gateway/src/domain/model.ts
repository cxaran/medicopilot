export type ProviderId = string;
export type ModelId = string;

export type ProviderProtocol =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "gemini_generate_content"
  | "ollama_chat"
  // B5: opencode zen es OpenAI-compatible (chat completions + /models, Bearer auth).
  | "opencode_zen"
  // OpenCode Go: misma API OpenAI-compatible que Zen pero otro base URL y catalogo
  // (suscripcion); se enruta con su propio provider id para arrendar la credencial correcta.
  | "opencode_go"
  | "fake";

// Formato de "thinking"/razonamiento que entiende el proveedor en el cable (patrón
// OpenClaw): cada familia expone el control de razonamiento de forma distinta.
export type ThinkingFormat =
  | "none"
  | "openai_reasoning_effort"
  | "anthropic_thinking"
  | "gemini_thinking";

// Flags finos de compatibilidad (patrón OpenClaw ModelCatalogCompatConfig). Son
// PISTAS DE FORMA DE CABLE que consumen los adaptadores de proveedor para construir
// la request; la negociación granular (toolCalling/structuredOutput/reasoning) sigue
// siendo la autoridad para aceptar/rechazar.
export interface ModelCompatFlags {
  supportsTools: boolean;
  supportsReasoningEffort: boolean;
  thinkingFormat: ThinkingFormat;
  // Structured/strict output (response_format json_schema con strict).
  supportsStrictMode: boolean;
  // Usage incluido dentro del stream (OpenAI stream_options.include_usage).
  supportsUsageInStreaming: boolean;
  // Streaming temprano de argumentos de tool (deltas de tool_call.function.arguments).
  supportsEagerToolInputStreaming: boolean;
}

export type CapabilitySupport = "supported" | "unsupported" | "unknown";

export type InputModality = "text" | "image" | "audio" | "video" | "file";
export type OutputModality = "text" | "image" | "audio" | "json";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelCapabilities {
  streaming: CapabilitySupport;
  inputModalities: ReadonlySet<InputModality>;
  outputModalities: ReadonlySet<OutputModality>;
  toolCalling: {
    support: CapabilitySupport;
    strictSchema: CapabilitySupport;
    parallelCalls: CapabilitySupport;
  };
  structuredOutput: {
    jsonObject: CapabilitySupport;
    jsonSchema: CapabilitySupport;
    strictSchema: CapabilitySupport;
  };
  reasoning: {
    support: CapabilitySupport;
    allowedEfforts: readonly ReasoningEffort[];
    summaryOutput: CapabilitySupport;
  };
  promptCaching: {
    read: CapabilitySupport;
    write: CapabilitySupport;
  };
  tokenCounting: {
    exact: CapabilitySupport;
    estimated: CapabilitySupport;
  };
  // Ventana de contexto NATIVA del modelo (lo que anuncia el proveedor).
  contextWindowTokens: number | null;
  // Cap EFECTIVO en runtime (más bajo que el nativo si la cuenta/plan lo limita); se
  // mantiene separado del nativo para que el context budgeter pueda usar el menor.
  effectiveContextTokens: number | null;
  maxOutputTokens: number | null;
  // Flags finos de compatibilidad consumidos por los adaptadores de proveedor.
  compat: ModelCompatFlags;
}

export interface ModelRoute {
  providerId: ProviderId;
  providerModelId: ModelId;
  protocol: ProviderProtocol;
  endpointBaseUrl: string;
}

export interface ModelDescriptor {
  id: `${ProviderId}/${ModelId}`;
  label: string;
  route: ModelRoute;
  capabilities: ModelCapabilities;
  source: "curated" | "discovered" | "manual";
  metadataRevision: string | null;
  deprecatedAt: string | null;
}

export function createFakeModel(overrides: Partial<ModelDescriptor> = {}): ModelDescriptor {
  const base: ModelDescriptor = {
    id: "fake/fake-model",
    label: "Fake Model",
    route: {
      providerId: "fake",
      providerModelId: "fake-model",
      protocol: "fake",
      endpointBaseUrl: "memory://fake"
    },
    capabilities: {
      streaming: "supported",
      inputModalities: new Set(["text"]),
      outputModalities: new Set(["text"]),
      toolCalling: {
        support: "supported",
        strictSchema: "supported",
        parallelCalls: "unsupported"
      },
      structuredOutput: {
        jsonObject: "supported",
        jsonSchema: "supported",
        strictSchema: "supported"
      },
      reasoning: {
        support: "unsupported",
        allowedEfforts: [],
        summaryOutput: "unsupported"
      },
      promptCaching: {
        read: "unsupported",
        write: "unsupported"
      },
      tokenCounting: {
        exact: "unsupported",
        estimated: "supported"
      },
      contextWindowTokens: 128000,
      effectiveContextTokens: null,
      maxOutputTokens: 4096,
      compat: {
        supportsTools: true,
        supportsReasoningEffort: false,
        thinkingFormat: "none",
        supportsStrictMode: true,
        supportsUsageInStreaming: true,
        supportsEagerToolInputStreaming: false
      }
    },
    source: "manual",
    metadataRevision: "test",
    deprecatedAt: null
  };

  return { ...base, ...overrides };
}
