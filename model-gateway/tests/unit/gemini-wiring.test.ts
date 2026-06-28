import { describe, expect, it } from "vitest";
import { StartTurn } from "../../src/application/turns/start-turn.js";
import { ResumeTurnAfterTool } from "../../src/application/turns/resume-turn-after-tool.js";
import { ModelDiscoveryService } from "../../src/application/capabilities/model-discovery.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { GeminiProviderAdapter, createGeminiModel } from "../../src/providers/gemini/adapter.js";
import { InMemoryModelCatalog } from "../../src/infrastructure/catalog/in-memory-model-catalog.js";
import { InMemoryTurnStore } from "../../src/infrastructure/turn-store/in-memory-turn-store.js";
import { NoopRateLimiter } from "../../src/infrastructure/rate-limit/noop-rate-limiter.js";
import type { TurnEvent, TurnEventSink } from "../../src/application/turns/start-turn.js";
import type { StartTurnRequest } from "../../src/application/capabilities/request-normalizer.js";
import type { GatewaySettings } from "../../src/config/settings.js";
import type { TelemetryPort } from "../../src/ports/telemetry.port.js";
import type { BrowserSession } from "../../src/domain/gateway-session.js";
import type { ControlPlanePort, TurnAuthorization } from "../../src/ports/control-plane.port.js";
import type { ProviderCredentialLease } from "../../src/ports/provider-adapter.port.js";
import type { ModelToolDefinition } from "../../src/domain/tool.js";

/**
 * Wiring end-to-end del adaptador Gemini SIN Google real: control-plane que resuelve el perfil
 * "gemini", arriendo de credencial, StartTurn -> stream (streamGenerateContent) -> relay de
 * function-call -> ResumeTurnAfterTool. El proveedor se mockea con un fetch en cola (SSE Gemini).
 */

const BASE_URL = "https://gemini.test/v1beta";
const MODEL_ID = "gemini-2.5-flash";

const settings: GatewaySettings = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 0,
  publicPathPrefix: "/model-gateway",
  enableRootPathAlias: true,
  cookieName: "mg_session",
  allowedOrigins: ["http://localhost:3000"],
  globalMaxContextTokens: 128000,
  safetyReserveTokens: 1024,
  maxWebSocketMessageBytes: 1024 * 1024,
  maxToolsPerTurn: 16,
  maxToolResultBytes: 64 * 1024,
  toolResultTimeoutMs: 60000,
  devTicket: "test-ticket",
  agentTicketSecret: "",
  opencodeBaseUrl: "https://opencode.test/v1",
  opencodeDefaultModel: "test-model"
};

class GeminiControlPlane implements ControlPlanePort {
  leasedSecrets: string[] = [];
  async authorizeTurn(input: { browserSessionId: string; profileId: string }): Promise<TurnAuthorization> {
    return {
      userId: "user_test",
      sessionId: input.browserSessionId,
      tenantId: null,
      profileId: input.profileId,
      providerId: "gemini",
      credentialId: "user_test",
      modelId: MODEL_ID,
      allowedCapabilities: { tools: true, structuredOutput: true, reasoning: true, images: false, audio: false },
      limits: {
        maxConcurrentTurns: 2,
        maxInputTokens: null,
        maxOutputTokens: 4096,
        maxTurnDurationSeconds: 60,
        maxToolResultBytes: 64 * 1024
      }
    };
  }
  async leaseCredential(): Promise<ProviderCredentialLease> {
    const secret = "leased-gemini-key";
    this.leasedSecrets.push(secret);
    return { leaseId: "lease-1", secret, expiresAt: new Date(Date.now() + 60_000) };
  }
  async leaseCredentialForProvider(): Promise<ProviderCredentialLease | null> {
    return null;
  }
  async releaseCredentialLease(): Promise<void> {}
  async reportTurnUsage(): Promise<void> {}
}

function telemetry(): TelemetryPort {
  return { info() {}, warn() {}, error() {} };
}

// Respuesta SSE de streamGenerateContent (alt=sse): cada chunk va como `data: <json>`.
function sseResponse(chunks: Array<Record<string, unknown>>): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function textTurnChunks(text: string): Array<Record<string, unknown>> {
  return [
    {
      candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
    }
  ];
}

function functionCallChunks(name: string): Array<Record<string, unknown>> {
  return [
    {
      candidates: [
        { content: { role: "model", parts: [{ functionCall: { name, args: {} } }] }, finishReason: "STOP" }
      ],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 }
    }
  ];
}

function createSink(): TurnEventSink & { events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  return { events, async emit(event) { events.push(event); } };
}

function browserSession(): BrowserSession {
  return {
    id: "bs_test",
    userId: "user_test",
    sessionRef: "session_test",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000)
  };
}

function startRequest(overrides: Partial<StartTurnRequest> = {}): StartTurnRequest {
  return {
    requestId: "req_1",
    profileId: `gemini/${MODEL_ID}`,
    messages: [{ role: "user", content: [{ type: "text", text: "Hola" }] }],
    tools: [],
    generation: { maxOutputTokens: 100 },
    ...overrides
  };
}

function setup(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) {
      throw new Error("fetch mock: sin respuestas en cola");
    }
    return next;
  }) as unknown as typeof fetch;

  const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
  const providerRegistry = new ProviderRegistry([adapter]);
  const modelCatalog = new InMemoryModelCatalog([createGeminiModel({ baseUrl: BASE_URL, modelId: MODEL_ID })]);
  const controlPlane = new GeminiControlPlane();
  const tel = telemetry();
  const modelDiscovery = new ModelDiscoveryService({
    controlPlane,
    providerRegistry,
    modelCatalog,
    telemetry: tel,
    discoverableProviderIds: []
  });
  const turnStore = new InMemoryTurnStore();
  const startTurn = new StartTurn({
    controlPlane,
    modelCatalog,
    modelDiscovery,
    providerRegistry,
    turnStore,
    limiter: new NoopRateLimiter(),
    telemetry: tel,
    settings
  });
  const resume = new ResumeTurnAfterTool({
    turnStore,
    modelCatalog,
    providerRegistry,
    controlPlane,
    telemetry: tel,
    settings
  });
  return { startTurn, resume, turnStore, controlPlane, calls };
}

const toolDef: ModelToolDefinition = {
  name: "clinical.list_patients",
  description: "Lista pacientes",
  inputSchema: { type: "object", additionalProperties: false },
  strict: false
};

function types(events: TurnEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("wiring Gemini (StartTurn -> lease -> adapter -> stream -> resume)", () => {
  it("resuelve el perfil gemini, arrienda y completa un turno de texto", async () => {
    const { startTurn, turnStore, controlPlane, calls } = setup([sseResponse(textTurnChunks("Hola doctor"))]);
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest(), sink);

    expect(types(sink.events)).toContain("turn.started");
    expect(types(sink.events)).toContain("turn.completed");
    // Se arrendó la key y se usó x-goog-api-key contra el endpoint por modelo (no Bearer).
    expect(controlPlane.leasedSecrets).toEqual(["leased-gemini-key"]);
    expect(calls[0]?.url).toBe(`${BASE_URL}/models/${MODEL_ID}:streamGenerateContent?alt=sse`);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("leased-gemini-key");
    expect(headers.authorization).toBeUndefined();

    const started = sink.events.find((e) => e.type === "turn.started");
    const turnId = started && "turn_id" in started ? started.turn_id : "";
    expect((await turnStore.get(turnId))?.status).toBe("completed");
  });

  it("acumula los parts de texto en el snapshot", async () => {
    const { startTurn } = setup([
      sseResponse([
        { candidates: [{ content: { role: "model", parts: [{ text: "Hola " }] } }] },
        {
          candidates: [{ content: { role: "model", parts: [{ text: "doctor" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }
        }
      ])
    ]);
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest(), sink);
    const deltas = sink.events.filter((e) => e.type === "turn.text.delta");
    const last = deltas[deltas.length - 1];
    expect(last && "snapshot" in last ? last.snapshot : "").toBe("Hola doctor");
  });

  it("relay de function-call: waiting_for_tool tras el functionCall y completa al reanudar", async () => {
    const { startTurn, resume, turnStore } = setup([
      sseResponse(functionCallChunks("clinical.list_patients")),
      sseResponse(textTurnChunks("Listo"))
    ]);
    const startSink = createSink();
    await startTurn.execute(browserSession(), startRequest({ tools: [toolDef] }), startSink);
    const toolCall = startSink.events.find((e) => e.type === "turn.tool_call.ready");
    if (!toolCall || toolCall.type !== "turn.tool_call.ready") {
      throw new Error("esperado turn.tool_call.ready");
    }
    expect(toolCall.tool_name).toBe("clinical.list_patients");
    expect((await turnStore.get(toolCall.turn_id))?.status).toBe("waiting_for_tool");

    const resumeSink = createSink();
    await resume.execute(
      toolCall.turn_id,
      { callId: toolCall.call_id, result: { status: "success", content: { items: [] } } },
      resumeSink
    );
    expect(types(resumeSink.events)).toContain("turn.completed");
    expect((await turnStore.get(toolCall.turn_id))?.status).toBe("completed");
  });

  it("al reanudar envía un content user con functionResponse correlacionado por NOMBRE", async () => {
    const { startTurn, resume, calls } = setup([
      sseResponse(functionCallChunks("clinical.list_patients")),
      sseResponse(textTurnChunks("Listo"))
    ]);
    const startSink = createSink();
    await startTurn.execute(browserSession(), startRequest({ tools: [toolDef] }), startSink);
    const toolCall = startSink.events.find((e) => e.type === "turn.tool_call.ready");
    if (!toolCall || toolCall.type !== "turn.tool_call.ready") {
      throw new Error("esperado turn.tool_call.ready");
    }
    await resume.execute(
      toolCall.turn_id,
      { callId: toolCall.call_id, result: { status: "success", content: { ok: true } } },
      createSink()
    );
    const resumeBody = JSON.parse(String(calls[1]?.init.body ?? "{}")) as {
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
    };
    const last = resumeBody.contents[resumeBody.contents.length - 1];
    expect(last?.role).toBe("user");
    const fr = last?.parts[0]?.functionResponse as { name?: string; response?: unknown } | undefined;
    expect(fr?.name).toBe("clinical.list_patients");
    expect(fr?.response).toEqual({ ok: true });
    // El content model intermedio debe re-enviar el functionCall (round-trip 1:1).
    const modelContent = resumeBody.contents.find((c) => c.role === "model");
    expect(modelContent?.parts.some((p) => "functionCall" in p)).toBe(true);
  });
});

describe("Gemini: systemInstruction (top-level) y contents", () => {
  async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
    for await (const _ of iterable) {
      void _;
    }
  }
  function captureBody(responses: Response[]) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const queue = [...responses];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) });
      return queue.shift() ?? sseResponse(textTurnChunks("ok"));
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }
  const credential = { leaseId: "l1", secret: "k", expiresAt: new Date(Date.now() + 60_000) };

  it("los mensajes system van a systemInstruction; contents solo lleva user/model", async () => {
    const { calls, fetchImpl } = captureBody([sseResponse(textTurnChunks("ok"))]);
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const model = createGeminiModel({ baseUrl: BASE_URL, modelId: MODEL_ID });
    await drain(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential,
        messages: [
          { role: "system", content: [{ type: "text", text: "CAPA DE SEGURIDAD" }] },
          { role: "system", content: [{ type: "text", text: "PERSONA: formal" }] },
          { role: "assistant", content: [{ type: "text", text: "Hola" }] },
          { role: "user", content: [{ type: "text", text: "Sigue" }] }
        ],
        tools: [],
        options: { maxOutputTokens: 100 },
        signal: new AbortController().signal
      })
    );
    const systemInstruction = calls[0]?.body.systemInstruction as { parts: Array<{ text: string }> };
    expect(systemInstruction.parts[0]?.text).toBe("CAPA DE SEGURIDAD\n\nPERSONA: formal");
    const contents = calls[0]?.body.contents as Array<{ role: string }>;
    expect(contents).toHaveLength(2);
    // assistant -> "model"; el resto -> "user".
    expect(contents.map((c) => c.role)).toEqual(["model", "user"]);
  });
});

describe("Gemini: mapeo de reasoning normalizado -> thinkingConfig.thinkingBudget", () => {
  async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
    for await (const _ of iterable) {
      void _;
    }
  }
  function captureBody() {
    const calls: { body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
      return sseResponse(textTurnChunks("ok"));
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }
  const credential = { leaseId: "l1", secret: "k", expiresAt: new Date(Date.now() + 60_000) };
  const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "Hola" }] }];

  function genConfig(body: Record<string, unknown>): Record<string, unknown> {
    return body.generationConfig as Record<string, unknown>;
  }

  it("'max' habilita thinkingConfig con budget 24576 (separado de maxOutputTokens)", async () => {
    const { calls, fetchImpl } = captureBody();
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const model = createGeminiModel({ baseUrl: BASE_URL, modelId: MODEL_ID });
    expect(model.capabilities.compat.supportsReasoningEffort).toBe(true);
    await drain(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential,
        messages,
        tools: [],
        options: { maxOutputTokens: 1024, reasoningEffort: "max" },
        signal: new AbortController().signal
      })
    );
    const cfg = genConfig(calls[0]!.body);
    expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 24576, includeThoughts: true });
    expect(cfg.maxOutputTokens).toBe(1024);
  });

  it("'low' usa budget 2048", async () => {
    const { calls, fetchImpl } = captureBody();
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const model = createGeminiModel({ baseUrl: BASE_URL, modelId: MODEL_ID });
    await drain(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential,
        messages,
        tools: [],
        options: { maxOutputTokens: 1024, reasoningEffort: "low" },
        signal: new AbortController().signal
      })
    );
    const cfg = genConfig(calls[0]!.body);
    expect(cfg.thinkingConfig).toEqual({ thinkingBudget: 2048, includeThoughts: true });
  });

  it("'off' omite thinkingConfig", async () => {
    const { calls, fetchImpl } = captureBody();
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const model = createGeminiModel({ baseUrl: BASE_URL, modelId: MODEL_ID });
    await drain(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential,
        messages,
        tools: [],
        options: { maxOutputTokens: 1024, reasoningEffort: "off" },
        signal: new AbortController().signal
      })
    );
    expect(genConfig(calls[0]!.body).thinkingConfig).toBeUndefined();
  });

  it("modelo sin thinking (gemini-2.0-flash) omite el parámetro aunque se pida 'high'", async () => {
    const { calls, fetchImpl } = captureBody();
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const model = createGeminiModel({ baseUrl: BASE_URL, modelId: "gemini-2.0-flash" });
    expect(model.capabilities.compat.supportsReasoningEffort).toBe(false);
    await drain(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential,
        messages,
        tools: [],
        options: { maxOutputTokens: 1024, reasoningEffort: "high" },
        signal: new AbortController().signal
      })
    );
    expect(genConfig(calls[0]!.body).thinkingConfig).toBeUndefined();
  });
});

describe("Gemini: discovery y resolución de capacidades", () => {
  it("discoverModels filtra a generateContent y mapea límites de tokens reales", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
              supportedGenerationMethods: ["generateContent", "streamGenerateContent"]
            },
            {
              name: "models/text-embedding-004",
              supportedGenerationMethods: ["embedContent"]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as unknown as typeof fetch;
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    const models = await adapter.discoverModels({ leaseId: "l", secret: "k", expiresAt: new Date() });
    // El de embeddings se filtra; queda solo el de generateContent.
    expect(models).toHaveLength(1);
    const flash = models[0]!;
    expect(flash.id).toBe("gemini/gemini-2.5-flash");
    expect(flash.route.protocol).toBe("gemini_generate_content");
    expect(flash.route.providerModelId).toBe("gemini-2.5-flash");
    expect(flash.capabilities.contextWindowTokens).toBe(1048576);
    expect(flash.capabilities.maxOutputTokens).toBe(65536);
    expect(flash.capabilities.compat.supportsReasoningEffort).toBe(true);
    expect(flash.capabilities.compat.thinkingFormat).toBe("gemini_thinking");
    expect(flash.source).toBe("discovered");
  });

  it("createGeminiModel: visión multimodal y thinking por familia", () => {
    const flash = createGeminiModel({ baseUrl: BASE_URL, modelId: "gemini-2.5-flash" });
    expect(flash.capabilities.inputModalities.has("image")).toBe(true);
    expect(flash.capabilities.reasoning.support).toBe("supported");
    expect(flash.capabilities.compat.supportsTools).toBe(true);

    const legacy = createGeminiModel({ baseUrl: BASE_URL, modelId: "gemini-2.0-flash" });
    expect(legacy.capabilities.reasoning.support).toBe("unknown");
    expect(legacy.capabilities.compat.supportsReasoningEffort).toBe(false);
  });

  it("discoverModels lanza PROVIDER_DISCOVERY_FAILED si /v1beta/models falla", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const adapter = new GeminiProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
    await expect(adapter.discoverModels({ leaseId: "l", secret: "k", expiresAt: new Date() })).rejects.toThrow();
  });
});
