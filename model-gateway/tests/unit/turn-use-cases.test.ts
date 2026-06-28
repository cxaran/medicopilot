import { describe, expect, it } from "vitest";
import { createContainer } from "../../src/bootstrap/container.js";
import { StartTurn } from "../../src/application/turns/start-turn.js";
import { ResumeTurnAfterTool } from "../../src/application/turns/resume-turn-after-tool.js";
import type { TurnEvent, TurnEventSink } from "../../src/application/turns/start-turn.js";
import type { StartTurnRequest } from "../../src/application/capabilities/request-normalizer.js";
import type { GatewaySettings } from "../../src/config/settings.js";
import type { TelemetryPort } from "../../src/ports/telemetry.port.js";
import type { BrowserSession } from "../../src/domain/gateway-session.js";
import type { ModelToolDefinition } from "../../src/domain/tool.js";

const baseSettings: GatewaySettings = {
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
  // Alto para que el timeout de tool-result no dispare durante el test.
  toolResultTimeoutMs: 60000,
  devTicket: "test-ticket",
  agentTicketSecret: "",
  opencodeBaseUrl: "https://opencode.test/v1",
  opencodeDefaultModel: "test-model"
};

function createCapturingTelemetry(): TelemetryPort & {
  errors: { message: string; fields: Record<string, unknown> | undefined }[];
} {
  const errors: { message: string; fields: Record<string, unknown> | undefined }[] = [];
  return {
    info() {},
    warn() {},
    error(message, fields) {
      errors.push({ message, fields });
    },
    errors
  };
}

function createSink(): TurnEventSink & { events: TurnEvent[] } {
  const events: TurnEvent[] = [];
  return {
    events,
    async emit(event) {
      events.push(event);
    }
  };
}

function setup(settingsOverride: Partial<GatewaySettings> = {}) {
  const settings = { ...baseSettings, ...settingsOverride };
  const container = createContainer(settings);
  const telemetry = createCapturingTelemetry();
  container.telemetry = telemetry;

  const startTurn = new StartTurn({
    controlPlane: container.controlPlane,
    modelCatalog: container.modelCatalog,
    providerRegistry: container.providerRegistry,
    turnStore: container.turnStore,
    limiter: container.limiter,
    telemetry,
    settings
  });
  const resume = new ResumeTurnAfterTool({
    turnStore: container.turnStore,
    modelCatalog: container.modelCatalog,
    providerRegistry: container.providerRegistry,
    controlPlane: container.controlPlane,
    telemetry,
    settings
  });

  return { container, telemetry, startTurn, resume };
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
    profileId: "profile_clinical_assistant",
    messages: [{ role: "user", content: [{ type: "text", text: "Hola" }] }],
    tools: [],
    generation: { maxOutputTokens: 100 },
    ...overrides
  };
}

const toolDef: ModelToolDefinition = {
  name: "clinical.list",
  description: "Lista",
  inputSchema: { type: "object", additionalProperties: false },
  strict: true
};

function types(events: TurnEvent[]): string[] {
  return events.map((event) => event.type);
}

describe("StartTurn", () => {
  it("completa un turno sin tools (el proveedor responde directo)", async () => {
    const { startTurn, container } = setup();
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest(), sink);

    expect(types(sink.events)).toContain("turn.started");
    expect(types(sink.events)).toContain("turn.completed");
    expect(types(sink.events)).not.toContain("turn.tool_call.ready");

    const started = sink.events.find((event) => event.type === "turn.started");
    const turnId = started && "turn_id" in started ? started.turn_id : "";
    const turn = await container.turnStore.get(turnId);
    expect(turn?.status).toBe("completed");
  });

  it("transiciona a waiting_for_tool cuando el proveedor pide una tool", async () => {
    const { startTurn, container } = setup();
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest({ tools: [toolDef] }), sink);

    const toolCall = sink.events.find((event) => event.type === "turn.tool_call.ready");
    expect(toolCall).toBeDefined();
    expect(types(sink.events)).not.toContain("turn.completed");

    const turnId = toolCall && "turn_id" in toolCall ? toolCall.turn_id : "";
    const turn = await container.turnStore.get(turnId);
    expect(turn?.status).toBe("waiting_for_tool");
  });

  it("rechaza demasiadas tools con REQUEST_LIMIT_EXCEEDED sin arrancar el proveedor", async () => {
    const { startTurn } = setup({ maxToolsPerTurn: 0 });
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest({ tools: [toolDef] }), sink);

    expect(types(sink.events)).toEqual(["turn.failed"]);
    const failed = sink.events[0];
    expect(failed).toMatchObject({ type: "turn.failed", code: "REQUEST_LIMIT_EXCEEDED" });
  });

  it("rechaza por presupuesto de contexto con CONTEXT_LIMIT_EXCEEDED", async () => {
    const { startTurn } = setup({ globalMaxContextTokens: 1 });
    const sink = createSink();
    await startTurn.execute(browserSession(), startRequest(), sink);

    const failed = sink.events.find((event) => event.type === "turn.failed");
    expect(failed).toMatchObject({ type: "turn.failed", code: "CONTEXT_LIMIT_EXCEEDED" });
    expect(types(sink.events)).not.toContain("turn.completed");
  });
});

describe("ResumeTurnAfterTool", () => {
  it("reanuda un turno en waiting_for_tool hasta completarlo", async () => {
    const { startTurn, resume, container } = setup();

    const startSink = createSink();
    await startTurn.execute(browserSession(), startRequest({ tools: [toolDef] }), startSink);
    const toolCall = startSink.events.find((event) => event.type === "turn.tool_call.ready");
    if (!toolCall || toolCall.type !== "turn.tool_call.ready") {
      throw new Error("esperado turn.tool_call.ready");
    }

    const resumeSink = createSink();
    await resume.execute(
      toolCall.turn_id,
      { callId: toolCall.call_id, result: { status: "success", content: { rows: [] } } },
      resumeSink
    );

    expect(types(resumeSink.events)).toContain("turn.completed");
    const turn = await container.turnStore.get(toolCall.turn_id);
    expect(turn?.status).toBe("completed");
  });

  it("rechaza el resume de un turno inexistente con TURN_NOT_FOUND", async () => {
    const { resume, telemetry } = setup();
    const sink = createSink();
    await resume.execute(
      "turn_no_existe",
      { callId: "call_x", result: { status: "success", content: {} } },
      sink
    );

    expect(sink.events).toEqual([
      expect.objectContaining({ type: "turn.failed", code: "TURN_NOT_FOUND" })
    ]);
    // MG-001: la telemetria de error no debe filtrar datos sensibles (solo code/turnId).
    expect(telemetry.errors).toHaveLength(1);
    expect(Object.keys(telemetry.errors[0]?.fields ?? {}).sort()).toEqual(["code", "turnId"]);
    expect(telemetry.errors[0]?.fields?.code).toBe("TURN_NOT_FOUND");
  });

  it("rechaza el resume si el turno no esta esperando tool (TURN_NOT_WAITING_FOR_TOOL)", async () => {
    const { startTurn, resume, container } = setup();

    // Un turno sin tools queda 'completed', no 'waiting_for_tool'.
    const startSink = createSink();
    await startTurn.execute(browserSession(), startRequest(), startSink);
    const started = startSink.events.find((event) => event.type === "turn.started");
    if (!started || started.type !== "turn.started") {
      throw new Error("esperado turn.started");
    }
    expect((await container.turnStore.get(started.turn_id))?.status).toBe("completed");

    const resumeSink = createSink();
    await resume.execute(
      started.turn_id,
      { callId: "call_x", result: { status: "success", content: {} } },
      resumeSink
    );

    expect(resumeSink.events).toEqual([
      expect.objectContaining({ type: "turn.failed", code: "TURN_NOT_WAITING_FOR_TOOL" })
    ]);
  });
});
