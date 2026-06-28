import test from "node:test";
import assert from "node:assert/strict";

import { buildToolCatalog } from "@/core/agent/tool-catalog";
import { searchTools } from "@/core/agent/tool-discovery";
import { getTool, ToolExecutionError, type ToolExecutionContext } from "@/core/agent/tools/registry";

import {
  MCP_WRITE_RESOURCE,
  loadMcpTools,
  mapMcpToolsToDefinitions,
  mcpProvenance,
  mcpToolName,
} from "./mcp-tools.ts";
import type { McpToolListItem } from "./mcp-client.ts";

const ITEMS: McpToolListItem[] = [
  {
    name: "read_file",
    description: "Lee un archivo del FS",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "write_file",
    description: "Escribe un archivo",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
];

// --- mapeo a ToolDefinition con procedencia MCP ---

test("mapMcpToolsToDefinitions: procedencia 'MCP: <servidor>', nombre namespaced y wireSchema del servidor", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const read = defs.find((d) => d.name === mcpToolName("filesystem", "read_file"))!;
  assert.equal(read.name, "mcp.filesystem.read_file");
  assert.equal(read.source, mcpProvenance("filesystem"));
  assert.equal(read.source, "MCP: filesystem");
  assert.equal(read.kind, "read");
  // El esquema real del servidor se expone al modelo vía wireSchema.
  assert.deepEqual(read.wireSchema, { type: "object", properties: { path: { type: "string" } } });
});

test("mapMcpToolsToDefinitions: read-only -> 'read'; el resto -> 'write' gateado por recurso sintético", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const write = defs.find((d) => d.name === mcpToolName("filesystem", "write_file"))!;
  assert.equal(write.kind, "write");
  assert.equal(write.approval?.targetResource, MCP_WRITE_RESOURCE);
});

// --- SIN ejecución (rebanada 1) ---

test("rebanada 1: NO hay executor para tools MCP (getTool no las conoce)", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  for (const def of defs) {
    assert.equal(getTool(def.name), undefined);
  }
});

test("rebanada 1: ejecutar una tool MCP lanza 'mcp_execution_not_enabled'", async () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const ctx = {} as ToolExecutionContext;
  await assert.rejects(
    () => defs[0]!.execute({}, ctx),
    (error: unknown) =>
      error instanceof ToolExecutionError && error.code === "mcp_execution_not_enabled",
  );
});

// --- gating por rol EXACTAMENTE como cualquier tool + aparición en tool_search ---

test("buildToolCatalog: la tool MCP de lectura aparece (no gateada) con procedencia MCP", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const catalog = buildToolCatalog(defs, new Set());
  const read = catalog.find((e) => e.name === "mcp.filesystem.read_file")!;
  assert.notEqual(read.status, "gated_out");
  assert.equal(read.source, "MCP: filesystem");
});

test("buildToolCatalog: la tool MCP de escritura queda gated_out sin permiso, y disponible con él", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const gated = buildToolCatalog(defs, new Set()).find((e) => e.name === "mcp.filesystem.write_file")!;
  assert.equal(gated.status, "gated_out");

  const allowed = buildToolCatalog(defs, new Set([MCP_WRITE_RESOURCE])).find(
    (e) => e.name === "mcp.filesystem.write_file",
  )!;
  assert.notEqual(allowed.status, "gated_out");
});

test("searchTools: la tool MCP aparece en la búsqueda con procedencia 'MCP: <servidor>'", () => {
  const defs = mapMcpToolsToDefinitions("filesystem", ITEMS);
  const hits = searchTools("archivo", defs);
  const hit = hits.find((h) => h.name === "mcp.filesystem.read_file")!;
  assert.ok(hit, "la tool MCP debe aparecer en tool_search");
  assert.equal(hit.source, "MCP: filesystem");
});

// --- carga de alto nivel: degrada a [] sin servidor o ante fallos ---

test("loadMcpTools: sin servidor configurado -> [] (no es error)", async () => {
  const prev = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  try {
    assert.deepEqual(await loadMcpTools(), []);
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_URL = prev;
  }
});

test("loadMcpTools: con servidor configurado mapea las tools descubiertas", async () => {
  const prev = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  const prevName = process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  process.env.NEXT_PUBLIC_MCP_SERVER_URL = "https://mcp.test/rpc";
  process.env.NEXT_PUBLIC_MCP_SERVER_NAME = "filesystem";
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (body.method === "tools/list") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: ITEMS } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  try {
    const defs = await loadMcpTools(fetchImpl);
    assert.deepEqual(
      defs.map((d) => d.name).sort(),
      ["mcp.filesystem.read_file", "mcp.filesystem.write_file"],
    );
    assert.equal(defs[0]!.source, "MCP: filesystem");
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_URL = prev;
    else delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
    if (prevName !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_NAME = prevName;
    else delete process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  }
});
