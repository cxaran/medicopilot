export type ProviderId = string;
export type ModelId = string;

export type ProviderProtocol =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "gemini_generate_content"
  | "ollama_chat"
  | "fake";

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
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
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
      maxOutputTokens: 4096
    },
    source: "manual",
    metadataRevision: "test",
    deprecatedAt: null
  };

  return { ...base, ...overrides };
}
