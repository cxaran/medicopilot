import { describe, expect, it } from "vitest";
import { StartTurn } from "../../src/application/turns/start-turn.js";
import { ResumeTurnAfterTool } from "../../src/application/turns/resume-turn-after-tool.js";
import { ModelDiscoveryService } from "../../src/application/capabilities/model-discovery.js";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { OpenAIProviderAdapter, createOpenAIModel } from "../../src/providers/openai/adapter.js";
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
 * Wiring end-to-end del adaptador OpenAI/Codex SIN OpenAI real: control-plane que resuelve
 * el perfil "openai", arriendo de credencial, StartTurn -> stream -> relay de tool ->
 * ResumeTurnAfterTool. El proveedor se mockea con un fetch en cola (SSE OpenAI-compatible).
 */

const BASE_URL = "https://openai.test/v1";

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

// Control-plane que enruta al proveedor "openai" (perfil codex/openai) y arrienda un Bearer.
class OpenAIControlPlane implements ControlPlanePort {
  leasedSecrets: string[] = [];
  async authorizeTurn(input: { browserSessionId: string; profileId: string }): Promise<TurnAuthorization> {
    return {
      userId: "user_test",
      sessionId: input.browserSessionId,
      tenantId: null,
      profileId: input.profileId,
      providerId: "openai",
      credentialId: "user_test",
      modelId: "gpt-4o",
      allowedCapabilities: { tools: true, structuredOutput: true, reasoning: false, images: false, audio: false },
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
    const secret = "leased-openai-token";
    this.leasedSecrets.push(secret);
    return { leaseId: "lease-1", secret, expiresAt: new Date(Date.now() + 60_000) };
  }
  async leaseCredentialForProvider(): Promise<ProviderCredentialLease | null> {
    // Sin discovery por proveedor en el test: se resuelve por catálogo curado.
    return null;
  }
  async releaseCredentialLease(): Promise<void> {}
  async reportTurnUsage(): Promise<void> {}
}

function telemetry(): TelemetryPort {
  return { info() {}, warn() {}, error() {} };
}

function sseResponse(payloads: string[]): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
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
    profileId: "openai/gpt-4o",
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

  const adapter = new OpenAIProviderAdapter({ baseUrl: BASE_URL, fetchImpl });
  const providerRegistry = new ProviderRegistry([adapter]);
  const modelCatalog = new InMemoryModelCatalog([createOpenAIModel({ baseUrl: BASE_URL, modelId: "gpt-4o" })]);
  const controlPlane = new OpenAIControlPlane();
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

describe("wiring OpenAI/Codex (StartTurn -> lease -> adapter -> stream -> resume)", () => {
  it("resuelve el perfil openai, arrienda y completa un turno de texto", async () => {
    const { startTurn, turnStore, controlPlane, calls } = setup([
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hola doctor" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } })
      ])
    ]);
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest(), sink);

    expect(types(sink.events)).toContain("turn.started");
    expect(types(sink.events)).toContain("turn.completed");
    // Se arrendó la credencial y se usó el Bearer contra /chat/completions.
    expect(controlPlane.leasedSecrets).toEqual(["leased-openai-token"]);
    expect(calls[0]?.url).toBe(`${BASE_URL}/chat/completions`);
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer leased-openai-token");

    const started = sink.events.find((e) => e.type === "turn.started");
    const turnId = started && "turn_id" in started ? started.turn_id : "";
    expect((await turnStore.get(turnId))?.status).toBe("completed");
  });

  it("relay de tool: waiting_for_tool tras el tool_call y completa al reanudar", async () => {
    const { startTurn, resume, turnStore } = setup([
      sseResponse([
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "clinical.list_patients", arguments: "{}" } }] } }] }),
        JSON.stringify({ choices: [{ finish_reason: "tool_calls" }] })
      ]),
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Listo" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] })
      ])
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
});
