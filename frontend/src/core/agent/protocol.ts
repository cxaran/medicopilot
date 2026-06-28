// Tipos del protocolo del model-gateway (B6) tal como los ve el frontend (B7).
// Forma de cable snake_case; coincide con transport/websocket del gateway.

export type GatewayProtocol =
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages"
  | "gemini_generate_content"
  | "ollama_chat"
  | "opencode_zen"
  | "opencode_go"
  | "fake";

export interface WireModelCapabilities {
  streaming: string;
  input_modalities: string[];
  output_modalities: string[];
  tool_calling: { support: string; strictSchema: string; parallelCalls: string };
  structured_output: { jsonObject: string; jsonSchema: string; strictSchema: string };
  reasoning: { support: string; allowed_efforts: string[]; summary_output: string };
  prompt_caching: { read: string; write: string };
  token_counting: { exact: string; estimated: string };
  context_window_tokens: number | null;
  effective_context_tokens: number | null;
  max_output_tokens: number | null;
  compat: {
    supportsTools: boolean;
    supportsReasoningEffort: boolean;
    thinkingFormat: string;
    supportsStrictMode: boolean;
    supportsUsageInStreaming: boolean;
    supportsEagerToolInputStreaming: boolean;
  };
}

export interface WireModel {
  id: string;
  label: string;
  provider_id: string;
  provider_model_id: string;
  protocol: GatewayProtocol;
  source: string;
  deprecated_at: string | null;
  capabilities: WireModelCapabilities;
}

export interface WireProviderStatus {
  protocol: GatewayProtocol;
  registered: boolean;
  available: boolean;
}

export interface TurnUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
}

// --- Mensajes cliente -> gateway. -------------------------------------------------

// Parte de imagen: `mimeType`/`data` (base64) en camelCase, igual que el ContentPart del
// dominio del gateway (el parser del WS no renombra el contenido de los mensajes).
export type WireContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };

export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: WireContentPart[];
}

export interface WireTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict: boolean;
}

export interface WireGeneration {
  max_output_tokens: number;
  temperature?: number;
  reasoning_effort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  response_format?: "text" | "json_object" | "json_schema";
  strict_json_schema?: boolean;
}

export type ToolResultPayload =
  | { status: "success"; content: unknown }
  | { status: "error"; code: string; message: string };

export type ClientMessage =
  | {
      type: "turn.start";
      request_id: string;
      profile_id: string;
      messages: WireMessage[];
      tools?: WireTool[];
      generation: WireGeneration;
    }
  | { type: "turn.tool_result"; turn_id: string; call_id: string; result: ToolResultPayload }
  | { type: "models.list"; request_id: string; view?: "default" }
  | { type: "provider.status"; request_id: string }
  | { type: "agent.cancel_turn"; request_id: string; turn_id?: string };

// --- Eventos gateway -> cliente. --------------------------------------------------

export type ServerEvent =
  | { type: "turn.started"; turn_id: string }
  | { type: "turn.text.delta"; turn_id: string; delta: string; snapshot: string }
  | { type: "turn.reasoning.summary"; turn_id: string; summary: string }
  | { type: "turn.tool_call.ready"; turn_id: string; call_id: string; tool_name: string; arguments: unknown }
  | { type: "turn.completed"; turn_id: string; usage: TurnUsage }
  | { type: "turn.cancelled"; turn_id: string }
  | { type: "turn.failed"; turn_id?: string; code: string; message: string; details?: unknown }
  | { type: "models.list.result"; request_id: string; view: string; models: WireModel[] }
  | { type: "provider.status.result"; request_id: string; providers: WireProviderStatus[] }
  | { type: "agent.cancel_turn.result"; request_id: string; cancelled_turn_ids: string[] }
  | { type: "rpc.error"; request_id: string; code: string; message: string }
  | { type: "protocol.error"; code: string; message: string };

export interface ConnectionTicketResponse {
  ticket: string;
  expires_at: string;
}
