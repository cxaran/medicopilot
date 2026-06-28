import test from "node:test";
import assert from "node:assert/strict";

import { discoverMcpTools, mcpServerConfig, type McpServerConfig } from "./mcp-client.ts";

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
