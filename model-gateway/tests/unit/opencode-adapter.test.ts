import { describe, expect, it } from "vitest";
import {
  OpencodeProviderAdapter,
  createOpencodeModel,
  OPENCODE_PROVIDER_ID
} from "../../src/providers/opencode/adapter.js";
import { GatewayError } from "../../src/kernel/errors.js";
import type { GenerationOptions } from "../../src/application/capabilities/capability-negotiator.js";
import type { ProviderCredentialLease, ProviderEvent } from "../../src/ports/provider-adapter.port.js";
import type { CanonicalMessage } from "../../src/domain/message.js";
import type { ModelToolDefinition } from "../../src/domain/tool.js";

const BASE_URL = "https://opencode.test/v1";
const SECRET = "sk-leased-secret-xyz";

const lease: ProviderCredentialLease = {
  leaseId: "lease-1",
  secret: SECRET,
  expiresAt: new Date(Date.now() + 60_000)
};

const options: GenerationOptions = { maxOutputTokens: 512, temperature: 0.2 };

interface Captured {
  url: string;
  init: RequestInit;
}

/** Construye un Response SSE a partir de payloads JSON (uno por evento `data:`). */
function sseResponse(payloads: string[], status = 200): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join("") + "data: [DONE]\n\n";
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    }
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/event-stream" }
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function adapterWith(responses: Response[]): { adapter: OpencodeProviderAdapter; calls: Captured[] } {
  const calls: Captured[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) {
      throw new Error("fetch mock: sin respuestas en cola");
    }
    return next;
  }) as unknown as typeof fetch;

  return { adapter: new OpencodeProviderAdapter({ baseUrl: BASE_URL, fetchImpl }), calls };
}

async function collect(iterable: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

const model = createOpencodeModel({ baseUrl: BASE_URL, modelId: "test-model" });
const userMessage: CanonicalMessage[] = [{ role: "user", content: [{ type: "text", text: "Hola" }] }];

describe("OpencodeProviderAdapter.verifyCredential", () => {
  it("devuelve valid=true con 200 y usa Bearer con la key arrendada", async () => {
    const { adapter, calls } = adapterWith([jsonResponse({ data: [] })]);
    const result = await adapter.verifyCredential(lease);
    expect(result.valid).toBe(true);
    expect(calls[0]!.url).toBe(`${BASE_URL}/models`);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
  });

  it("devuelve valid=false con 401", async () => {
    const { adapter } = adapterWith([jsonResponse({ error: "unauthorized" }, 401)]);
    const result = await adapter.verifyCredential(lease);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unauthorized");
  });
});

describe("OpencodeProviderAdapter.discoverModels", () => {
  it("mapea /models a ModelDescriptor[] con capacidades", async () => {
    const { adapter } = adapterWith([
      jsonResponse({
        data: [
          { id: "modelo-a", name: "Modelo A", context_length: 200000, max_output_tokens: 8192, supports_tools: true },
          { id: "modelo-b", supports_tools: false, supports_reasoning: true }
        ]
      })
    ]);

    const models = await adapter.discoverModels(lease);
    expect(models).toHaveLength(2);

    const a = models[0]!;
    expect(a.id).toBe(`${OPENCODE_PROVIDER_ID}/modelo-a`);
    expect(a.route.protocol).toBe(OPENCODE_PROVIDER_ID);
    expect(a.label).toBe("Modelo A");
    expect(a.capabilities.contextWindowTokens).toBe(200000);
    expect(a.capabilities.maxOutputTokens).toBe(8192);
    expect(a.capabilities.toolCalling.support).toBe("supported");
    expect(a.source).toBe("discovered");

    const b = models[1]!;
    expect(b.capabilities.toolCalling.support).toBe("unsupported");
    expect(b.capabilities.compat.supportsTools).toBe(false);
    expect(b.capabilities.reasoning.support).toBe("supported");
  });

  it("lanza GatewayError si /models falla", async () => {
    const { adapter } = adapterWith([jsonResponse({ error: "boom" }, 500)]);
    await expect(adapter.discoverModels(lease)).rejects.toBeInstanceOf(GatewayError);
  });
});

describe("OpencodeProviderAdapter.startTurn", () => {
  it("traduce deltas de texto y un completed con usage", async () => {
    const { adapter, calls } = adapterWith([
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hola " } }] }),
        JSON.stringify({ choices: [{ delta: { content: "mundo" } }] }),
        JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 2 } }
        })
      ])
    ]);

    const events = await collect(
      adapter.startTurn({
        turnId: "t1",
        model,
        credential: lease,
        messages: userMessage,
        tools: [],
        options,
        signal: new AbortController().signal
      })
    );

    expect(events).toEqual([
      { type: "text.delta", delta: "Hola " },
      { type: "text.delta", delta: "mundo" },
      { type: "completed", usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 } }
    ]);

    // Request correcta a /chat/completions, stream y Bearer.
    expect(calls[0]!.url).toBe(`${BASE_URL}/chat/completions`);
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent.stream).toBe(true);
    expect(sent.model).toBe("test-model");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
  });

  it("emite tool_call.ready con la call correcta cuando el modelo pide una tool", async () => {
    const { adapter } = adapterWith([
      sseResponse([
        JSON.stringify({
          choices: [
            { delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "clinical.search", arguments: '{"q":' } }] } }
          ]
        }),
        JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"aspirina"}' } }] } }]
        }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })
      ])
    ]);

    const tools: ModelToolDefinition[] = [
      { name: "clinical.search", description: "busca", inputSchema: { type: "object" }, strict: false }
    ];

    const events = await collect(
      adapter.startTurn({
        turnId: "t2",
        model,
        credential: lease,
        messages: userMessage,
        tools,
        options,
        signal: new AbortController().signal
      })
    );

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("tool_call.ready");
    if (event.type !== "tool_call.ready") {
      throw new Error("se esperaba tool_call.ready");
    }
    expect(event.call.callId).toBe("call_1");
    expect(event.call.name).toBe("clinical.search");
    expect(event.call.arguments).toEqual({ q: "aspirina" });
    expect(event.continuationState).toBeTruthy();
  });

  it("traduce reasoning_content a reasoning.summary", async () => {
    const { adapter } = adapterWith([
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: "pensando..." } }] }),
        JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
      ])
    ]);

    const events = await collect(
      adapter.startTurn({
        turnId: "t3",
        model,
        credential: lease,
        messages: userMessage,
        tools: [],
        options,
        signal: new AbortController().signal
      })
    );

    expect(events[0]).toEqual({ type: "reasoning.summary", summary: "pensando..." });
    expect(events.at(-1)!.type).toBe("completed");
  });
});

describe("OpencodeProviderAdapter.resumeTurn", () => {
  it("tras un tool result, reanuda y completa", async () => {
    // 1) startTurn que pide la tool, para capturar la continuationState real.
    const startAdapter = adapterWith([
      sseResponse([
        JSON.stringify({
          choices: [
            { delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "clinical.search", arguments: "{}" } }] } }
          ]
        }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })
      ])
    ]);
    const startEvents = await collect(
      startAdapter.adapter.startTurn({
        turnId: "t4",
        model,
        credential: lease,
        messages: userMessage,
        tools: [{ name: "clinical.search", description: "busca", inputSchema: {}, strict: false }],
        options,
        signal: new AbortController().signal
      })
    );
    const toolEvent = startEvents[0]!;
    if (toolEvent.type !== "tool_call.ready") {
      throw new Error("se esperaba tool_call.ready");
    }

    // 2) resumeTurn con el resultado de la tool y la continuationState capturada.
    const { adapter, calls } = adapterWith([
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Listo." } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 8 } })
      ])
    ]);

    const events = await collect(
      adapter.resumeTurn({
        turnId: "t4",
        model,
        credential: lease,
        toolResults: [{ callId: "call_9", result: { status: "success", content: { hits: 3 } } }],
        continuationState: toolEvent.continuationState ?? null,
        signal: new AbortController().signal
      })
    );

    expect(events).toEqual([
      { type: "text.delta", delta: "Listo." },
      { type: "completed", usage: { inputTokens: 20, outputTokens: 8, cachedInputTokens: null } }
    ]);

    // El historial reenviado incluye el mensaje tool con el tool_call_id correcto.
    const sent = JSON.parse(String(calls[0]!.init.body));
    const toolMsg = sent.messages.at(-1);
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_9");
  });

  it("lanza GatewayError si la continuationState es inválida", async () => {
    const { adapter } = adapterWith([]);
    await expect(
      collect(
        adapter.resumeTurn({
          turnId: "t5",
          model,
          credential: lease,
          toolResults: [],
          continuationState: null,
          signal: new AbortController().signal
        })
      )
    ).rejects.toBeInstanceOf(GatewayError);
  });
});
