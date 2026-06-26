import { describe, expect, it } from "vitest";
import { negotiateCapabilities } from "../../src/application/capabilities/capability-negotiator.js";
import { createFakeModel } from "../../src/domain/model.js";

const policy = {
  tools: true,
  structuredOutput: true,
  reasoning: true,
  images: false,
  audio: false
};

describe("capability negotiator", () => {
  it("rejects tools when model toolCalling is unsupported", () => {
    const base = createFakeModel();
    const model = createFakeModel({
      capabilities: {
        ...base.capabilities,
        toolCalling: { ...base.capabilities.toolCalling, support: "unsupported" }
      }
    });

    expect(() =>
      negotiateCapabilities({
        model,
        policy,
        tools: [{ name: "clinical.test", description: "test", inputSchema: {}, strict: false }],
        generation: { maxOutputTokens: 100 }
      })
    ).toThrow("Tool calling is not supported");
  });

  it("rejects strict JSON Schema when unsupported", () => {
    const base = createFakeModel();
    const model = createFakeModel({
      capabilities: {
        ...base.capabilities,
        structuredOutput: { ...base.capabilities.structuredOutput, strictSchema: "unsupported" }
      }
    });

    expect(() =>
      negotiateCapabilities({
        model,
        policy,
        tools: [],
        generation: { maxOutputTokens: 100, responseFormat: "json_schema", strictJsonSchema: true }
      })
    ).toThrow("Strict JSON Schema output is not supported");
  });
});
