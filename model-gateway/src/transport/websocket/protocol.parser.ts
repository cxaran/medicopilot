import { Value } from "@sinclair/typebox/value";
import { TurnStartMessageSchema, TurnToolResultMessageSchema } from "./protocol.schema.js";
import type { ClientMessage } from "./protocol.schema.js";
import type { StartTurnRequest } from "../../application/capabilities/request-normalizer.js";
import type { ToolCallResult } from "../../domain/tool.js";

function schemaErrorText(schema: typeof TurnStartMessageSchema | typeof TurnToolResultMessageSchema, value: unknown): string {
  return [...Value.Errors(schema, value)].map((error) => `${error.path} ${error.message}`).join("; ");
}

export type ParsedClientMessage =
  | { kind: "turn.start"; request: StartTurnRequest }
  | { kind: "turn.tool_result"; turnId: string; result: ToolCallResult };

export function parseClientMessage(raw: unknown): ParsedClientMessage {
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;

  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    throw new Error("WebSocket message must contain a type");
  }

  const typed = parsed as ClientMessage;
  if (typed.type === "turn.start") {
    if (!Value.Check(TurnStartMessageSchema, typed)) {
      throw new Error(schemaErrorText(TurnStartMessageSchema, typed));
    }

    const generation: StartTurnRequest["generation"] = {
      maxOutputTokens: typed.generation.max_output_tokens
    };

    if (typed.generation.temperature !== undefined) {
      generation.temperature = typed.generation.temperature;
    }

    if (typed.generation.reasoning_effort !== undefined) {
      generation.reasoningEffort = typed.generation.reasoning_effort;
    }

    if (typed.generation.response_format !== undefined) {
      generation.responseFormat = typed.generation.response_format;
    }

    if (typed.generation.strict_json_schema !== undefined) {
      generation.strictJsonSchema = typed.generation.strict_json_schema;
    }

    return {
      kind: "turn.start",
      request: {
        requestId: typed.request_id,
        profileId: typed.profile_id,
        messages: typed.messages,
        tools: (typed.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
          strict: tool.strict
        })),
        generation
      }
    };
  }

  if (typed.type === "turn.tool_result") {
    if (!Value.Check(TurnToolResultMessageSchema, typed)) {
      throw new Error(schemaErrorText(TurnToolResultMessageSchema, typed));
    }

    return {
      kind: "turn.tool_result",
      turnId: typed.turn_id,
      result: {
        callId: typed.call_id,
        result: typed.result
      }
    };
  }

  throw new Error("Unknown WebSocket message type");
}
