import { GatewayError } from "../../kernel/errors.js";
import type { ModelDescriptor, ReasoningEffort } from "../../domain/model.js";
import type { ModelToolDefinition } from "../../domain/tool.js";

export interface GenerationOptions {
  maxOutputTokens: number;
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
  responseFormat?: "text" | "json_object" | "json_schema";
  strictJsonSchema?: boolean;
}

export interface CapabilityPolicy {
  tools: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  images: boolean;
  audio: boolean;
}

export interface CapabilityNegotiationRequest {
  model: ModelDescriptor;
  tools: readonly ModelToolDefinition[];
  generation: GenerationOptions;
  policy: CapabilityPolicy;
  /** El turno incluye al menos una parte de imagen en sus mensajes. */
  hasImageContent?: boolean;
}

export interface CapabilityNegotiationResult {
  tools: readonly ModelToolDefinition[];
  generation: GenerationOptions;
}

function requireSupported(value: string, code: string, message: string): void {
  if (value !== "supported") {
    throw new GatewayError(code, message, { support: value });
  }
}

export function negotiateCapabilities(request: CapabilityNegotiationRequest): CapabilityNegotiationResult {
  const { model, tools, generation, policy } = request;

  if (request.hasImageContent) {
    if (!policy.images) {
      throw new GatewayError("CAPABILITY_NOT_ALLOWED", "Image input is disabled by profile policy");
    }

    if (!model.capabilities.inputModalities.has("image")) {
      throw new GatewayError(
        "CAPABILITY_UNSUPPORTED",
        "Image input is not supported by the selected model"
      );
    }
  }

  if (tools.length > 0) {
    if (!policy.tools) {
      throw new GatewayError("CAPABILITY_NOT_ALLOWED", "Tool calling is disabled by profile policy");
    }

    requireSupported(
      model.capabilities.toolCalling.support,
      "CAPABILITY_UNSUPPORTED",
      "Tool calling is not supported by the selected model"
    );

    // B5: respeta también el flag fino de compatibilidad del proveedor. La capacidad
    // granular (arriba) sigue siendo la autoridad; esto cubre proveedores que anuncian
    // soporte general pero deshabilitan tools para un modelo concreto.
    if (!model.capabilities.compat.supportsTools) {
      throw new GatewayError("CAPABILITY_UNSUPPORTED", "Tool calling is not supported by the selected model");
    }

    if (tools.some((tool) => tool.strict)) {
      requireSupported(
        model.capabilities.toolCalling.strictSchema,
        "CAPABILITY_UNSUPPORTED",
        "Strict tool schema is not supported by the selected model"
      );
    }
  }

  if (generation.responseFormat === "json_schema" || generation.strictJsonSchema) {
    if (!policy.structuredOutput) {
      throw new GatewayError("CAPABILITY_NOT_ALLOWED", "Structured output is disabled by profile policy");
    }

    requireSupported(
      model.capabilities.structuredOutput.jsonSchema,
      "CAPABILITY_UNSUPPORTED",
      "JSON Schema output is not supported by the selected model"
    );

    if (generation.strictJsonSchema) {
      requireSupported(
        model.capabilities.structuredOutput.strictSchema,
        "CAPABILITY_UNSUPPORTED",
        "Strict JSON Schema output is not supported by the selected model"
      );
    }
  }

  if (generation.reasoningEffort) {
    if (!policy.reasoning) {
      throw new GatewayError("CAPABILITY_NOT_ALLOWED", "Reasoning controls are disabled by profile policy");
    }

    requireSupported(
      model.capabilities.reasoning.support,
      "CAPABILITY_UNSUPPORTED",
      "Reasoning controls are not supported by the selected model"
    );

    if (!model.capabilities.reasoning.allowedEfforts.includes(generation.reasoningEffort)) {
      throw new GatewayError("CAPABILITY_UNSUPPORTED", "Requested reasoning effort is not supported by the selected model", {
        reasoningEffort: generation.reasoningEffort
      });
    }
  }

  if (model.capabilities.maxOutputTokens && generation.maxOutputTokens > model.capabilities.maxOutputTokens) {
    throw new GatewayError("OUTPUT_LIMIT_EXCEEDED", "Requested output tokens exceed the selected model limit", {
      requested: generation.maxOutputTokens,
      max: model.capabilities.maxOutputTokens
    });
  }

  return { tools, generation };
}
