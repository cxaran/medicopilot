import test from "node:test";
import assert from "node:assert/strict";

import {
  callMcpTool,
  discoverMcpTools,
  mcpServerConfig,
  type McpServerConfig,
} from "./mcp-client.ts";

const config: McpServerConfig = { url: "https://mcp.test/rpc", name: "filesystem" };

interface Recorded {
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * Fetch falso de un endpoint MCP Streamable HTTP: enruta por el método JSON-RPC del cuerpo.
 * ``responder`` permite variar el formato (JSON vs SSE) por método.
 */
function fakeMcp(
  responder: (method: string) => Response,
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ body, headers: (init?.headers as Record<string, string>) ?? {} });
    return responder(String(body.method));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonRpc(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sseRpc(value: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(value)}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const TOOLS = [
  { name: "read_file", description: "Lee un archivo", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "write_file", description: "Escribe un archivo", inputSchema: { type: "object" } },
];

// --- configuración por entorno ---

test("mcpServerConfig: sin NEXT_PUBLIC_MCP_SERVER_URL -> null (no hay MCP, no es error)", () => {
  const prev = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  try {
    assert.equal(mcpServerConfig(), null);
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_URL = prev;
  }
});

test("mcpServerConfig: con URL devuelve config (nombre por defecto 'servidor')", () => {
  const prevUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  const prevName = process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  process.env.NEXT_PUBLIC_MCP_SERVER_URL = "https://mcp.test/rpc";
  delete process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  try {
    assert.deepEqual(mcpServerConfig(), { url: "https://mcp.test/rpc", name: "servidor" });
  } finally {
    if (prevUrl !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_URL = prevUrl;
    else delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
    if (prevName !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_NAME = prevName;
  }
});

// --- handshake initialize -> initialized -> tools/list ---

test("discoverMcpTools: hace initialize, notifications/initialized y tools/list (forma JSON-RPC)", async () => {
  const { fetchImpl, calls } = fakeMcp((method) => {
    if (method === "initialize") {
      return jsonRpc(
        { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: {} } },
        { "mcp-session-id": "sess-1" },
      );
    }
    if (method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (method === "tools/list") {
      return jsonRpc({ jsonrpc: "2.0", id: 2, result: { tools: TOOLS } });
    }
    return jsonRpc({ jsonrpc: "2.0", error: { message: "método inesperado" } });
  });

  const tools = await discoverMcpTools(config, fetchImpl);

  // Secuencia exacta de métodos JSON-RPC.
  assert.deepEqual(
    calls.map((c) => c.body.method),
    ["initialize", "notifications/initialized", "tools/list"],
  );
  // initialize anuncia versión y clientInfo.
  assert.equal(calls[0]!.body.jsonrpc, "2.0");
  const initParams = calls[0]!.body.params as Record<string, unknown>;
  assert.ok(initParams.protocolVersion);
  assert.ok(initParams.clientInfo);
  // El session id del initialize se reenvía en las llamadas siguientes.
  assert.equal(calls[1]!.headers["mcp-session-id"], "sess-1");
  assert.equal(calls[2]!.headers["mcp-session-id"], "sess-1");
  // Devuelve los items de tools/list.
  assert.deepEqual(
    tools.map((t) => t.name),
    ["read_file", "write_file"],
  );
});

test("discoverMcpTools: soporta respuesta SSE (text/event-stream) en tools/list", async () => {
  const { fetchImpl } = fakeMcp((method) => {
    if (method === "initialize") {
      return sseRpc({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    }
    if (method === "tools/list") {
      return sseRpc({ jsonrpc: "2.0", id: 2, result: { tools: TOOLS } });
    }
    return new Response(null, { status: 202 });
  });
  const tools = await discoverMcpTools(config, fetchImpl);
  assert.equal(tools.length, 2);
});

test("discoverMcpTools: lanza si initialize devuelve error JSON-RPC", async () => {
  const { fetchImpl } = fakeMcp(() => jsonRpc({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "no autorizado" } }));
  await assert.rejects(() => discoverMcpTools(config, fetchImpl), /initialize/);
});

// --- tools/call (rebanada 2) ---

test("callMcpTool: tras el handshake, invoca tools/call con name + arguments y devuelve content", async () => {
  const { fetchImpl, calls } = fakeMcp((method) => {
    if (method === "initialize") return jsonRpc({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    if (method === "tools/call") {
      return jsonRpc({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: "hola" }], isError: false } });
    }
    return new Response(null, { status: 202 });
  });

  const result = await callMcpTool(config, "read_file", { path: "/x" }, { fetchImpl });
  assert.equal(result.isError, false);
  assert.deepEqual(result.content, [{ type: "text", text: "hola" }]);

  // El cuerpo de tools/call usa el nombre RAW del servidor y pasa los argumentos.
  const callBody = calls.find((c) => c.body.method === "tools/call")!;
  const params = callBody.body.params as Record<string, unknown>;
  assert.equal(params.name, "read_file");
  assert.deepEqual(params.arguments, { path: "/x" });
});

test("callMcpTool: marca isError cuando el servidor lo reporta", async () => {
  const { fetchImpl } = fakeMcp((method) => {
    if (method === "initialize") return jsonRpc({ jsonrpc: "2.0", id: 1, result: {} });
    if (method === "tools/call") {
      return jsonRpc({ jsonrpc: "2.0", id: 3, result: { content: "archivo no encontrado", isError: true } });
    }
    return new Response(null, { status: 202 });
  });
  const result = await callMcpTool(config, "read_file", {}, { fetchImpl });
  assert.equal(result.isError, true);
});

test("callMcpTool: error JSON-RPC en tools/call se surface con mensaje útil", async () => {
  const { fetchImpl } = fakeMcp((method) => {
    if (method === "initialize") return jsonRpc({ jsonrpc: "2.0", id: 1, result: {} });
    if (method === "tools/call") {
      return jsonRpc({ jsonrpc: "2.0", id: 3, error: { code: -32602, message: "argumentos inválidos" } });
    }
    return new Response(null, { status: 202 });
  });
  await assert.rejects(() => callMcpTool(config, "read_file", {}, { fetchImpl }), /tools\/call/);
});

test("callMcpTool: timeout aborta y surface 'tiempo de espera agotado' (no cuelga)", async () => {
  // fetch que respeta el signal: si se aborta antes de los 50ms, rechaza con AbortError.
  const slowFetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })),
        50,
      );
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    })) as unknown as typeof fetch;

  await assert.rejects(
    () => callMcpTool(config, "read_file", {}, { fetchImpl: slowFetch, timeoutMs: 5 }),
    /tiempo de espera/,
  );
});
