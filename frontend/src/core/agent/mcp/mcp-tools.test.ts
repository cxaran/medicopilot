import test from "node:test";
import assert from "node:assert/strict";

import { buildToolCatalog } from "@/core/agent/tool-catalog";
import { searchTools } from "@/core/agent/tool-discovery";
import { getTool, type ToolDefinition } from "@/core/agent/tools/registry";
import { executeTool, resolveToolCall } from "@/core/agent/tools/tool-runner";
import { buildClinicalActionPlan } from "@/core/agent/approval-protocol";

import {
  MCP_WRITE_RESOURCE,
  loadMcpTools,
  mapMcpToolsToDefinitions,
  mcpProvenance,
  mcpToolName,
} from "./mcp-tools.ts";
import type { McpServerConfig, McpToolListItem } from "./mcp-client.ts";

const CONFIG: McpServerConfig = { url: "https://mcp.test/rpc", name: "filesystem" };

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

function jsonRes(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function defsWith(onCall: () => unknown): { defs: ToolDefinition[]; counter: { toolCalls: number } } {
  const counter = { toolCalls: 0 };
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") return jsonRes({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    if (body.method === "tools/call") {
      counter.toolCalls += 1;
      return jsonRes({ jsonrpc: "2.0", id: 3, result: onCall() });
    }
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  return { defs: mapMcpToolsToDefinitions(CONFIG, ITEMS, fetchImpl), counter };
}

const readToolName = mcpToolName("filesystem", "read_file");
const writeToolName = mcpToolName("filesystem", "write_file");

// --- mapeo a ToolDefinition con procedencia MCP ---

test("mapMcpToolsToDefinitions: procedencia 'MCP: <servidor>', nombre namespaced y wireSchema del servidor", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  const read = defs.find((d) => d.name === readToolName)!;
  assert.equal(read.name, "mcp.filesystem.read_file");
  assert.equal(read.source, mcpProvenance("filesystem"));
  assert.equal(read.source, "MCP: filesystem");
  assert.equal(read.kind, "read");
  assert.deepEqual(read.wireSchema, { type: "object", properties: { path: { type: "string" } } });
});

test("mapMcpToolsToDefinitions: read-only -> 'read'; el resto -> 'write' gateado por recurso sintético", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  const write = defs.find((d) => d.name === writeToolName)!;
  assert.equal(write.kind, "write");
  assert.equal(write.approval?.targetResource, MCP_WRITE_RESOURCE);
});

// --- ejecución (rebanada 2) ---

test("ejecución: una tool MCP de lectura ejecuta tools/call y entrega un tool_result (dato no confiable)", async () => {
  const { defs } = defsWith(() => ({ content: [{ type: "text", text: "contenido externo" }], isError: false }));
  const read = defs.find((d) => d.name === readToolName)!;
  const result = await executeTool(read, { path: "/x" });
  assert.equal(result.status, "success");
  // El contenido del servidor se entrega TAL CUAL como tool_result (formato preservado).
  assert.deepEqual(result.status === "success" ? result.content : null, [
    { type: "text", text: "contenido externo" },
  ]);
});

test("ejecución: NO hay executor nativo (getTool) para tools MCP; se despachan vía extraTools", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  assert.equal(getTool(readToolName), undefined);
  // El registro nativo NO las conoce, pero resolveToolCall las resuelve si se pasan como extra.
  const resolved = resolveToolCall(readToolName, { path: "/x" }, defs);
  assert.equal(resolved.outcome, "ready");
});

test("aprobación: una tool MCP de escritura es 'write' (va a la tarjeta P1) y NO ejecuta al resolver", () => {
  const { defs, counter } = defsWith(() => ({ content: [], isError: false }));
  const write = defs.find((d) => d.name === writeToolName)!;
  const resolved = resolveToolCall(writeToolName, { path: "/y" }, defs);
  assert.equal(resolved.outcome, "ready");
  assert.equal(resolved.outcome === "ready" && resolved.tool.kind, "write");
  // Plan canónico P1 con payload exacto.
  const plan = buildClinicalActionPlan(write, { path: "/y" });
  assert.equal(plan.targetResource, MCP_WRITE_RESOURCE);
  assert.deepEqual(plan.exactPayload, { path: "/y" });
  // Resolver/planear NO dispara la llamada al servidor (sólo se ejecuta al aprobar).
  assert.equal(counter.toolCalls, 0);
});

test("aprobación: la llamada al servidor sólo ocurre al EJECUTAR (aprobar); rechazar no llama", async () => {
  const { defs, counter } = defsWith(() => ({ content: [{ type: "text", text: "ok" }], isError: false }));
  const write = defs.find((d) => d.name === writeToolName)!;
  // Simula RECHAZO: no se ejecuta -> sin llamadas.
  assert.equal(counter.toolCalls, 0);
  // Simula APROBACIÓN: el panel ejecuta el payload aprobado.
  const result = await executeTool(write, { path: "/y" });
  assert.equal(result.status, "success");
  assert.equal(counter.toolCalls, 1);
});

test("gating: una tool MCP gateada por rol no se puede ejecutar (no está en las extraTools efectivas)", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  // El panel pasa SÓLO las efectivas. La de escritura, sin permiso, queda fuera.
  const effectiveMcp = defs.filter((d) => d.name === readToolName); // write gateado -> excluido
  const resolved = resolveToolCall(writeToolName, { path: "/y" }, effectiveMcp);
  assert.equal(resolved.outcome, "unknown_tool");
});

// --- robustez: errores y surface limpio ---

test("robustez: isError del servidor se traduce a tool_result de error con mensaje útil", async () => {
  const { defs } = defsWith(() => ({ content: "archivo no encontrado", isError: true }));
  const read = defs.find((d) => d.name === readToolName)!;
  const result = await executeTool(read, { path: "/x" });
  assert.equal(result.status, "error");
  assert.equal(result.status === "error" && result.code, "mcp_tool_error");
  assert.match(result.status === "error" ? result.message : "", /archivo no encontrado/);
});

test("robustez: un fallo de red en tools/call se surface como error (no cuelga)", async () => {
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") return jsonRes({ jsonrpc: "2.0", id: 1, result: {} });
    if (body.method === "tools/call") throw new Error("conexión rechazada");
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  const defs = mapMcpToolsToDefinitions(CONFIG, ITEMS, fetchImpl);
  const read = defs.find((d) => d.name === readToolName)!;
  const result = await executeTool(read, { path: "/x" });
  assert.equal(result.status, "error");
  assert.equal(result.status === "error" && result.code, "mcp_call_failed");
});

// --- gating/búsqueda como cualquier tool (rebanada 1, sin regresión) ---

test("buildToolCatalog: la tool MCP de lectura aparece (no gateada) con procedencia MCP", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  const read = buildToolCatalog(defs, new Set()).find((e) => e.name === readToolName)!;
  assert.notEqual(read.status, "gated_out");
  assert.equal(read.source, "MCP: filesystem");
});

test("buildToolCatalog: la tool MCP de escritura queda gated_out sin permiso, y disponible con él", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  const gated = buildToolCatalog(defs, new Set()).find((e) => e.name === writeToolName)!;
  assert.equal(gated.status, "gated_out");
  const allowed = buildToolCatalog(defs, new Set([MCP_WRITE_RESOURCE])).find((e) => e.name === writeToolName)!;
  assert.notEqual(allowed.status, "gated_out");
});

test("searchTools: la tool MCP aparece en la búsqueda con procedencia 'MCP: <servidor>'", () => {
  const { defs } = defsWith(() => ({ content: [], isError: false }));
  const hit = searchTools("archivo", defs).find((h) => h.name === readToolName)!;
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
    if (body.method === "initialize") return jsonRes({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    if (body.method === "tools/list") return jsonRes({ jsonrpc: "2.0", id: 2, result: { tools: ITEMS } });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  try {
    const defs = await loadMcpTools(fetchImpl);
    assert.deepEqual(defs.map((d) => d.name).sort(), [readToolName, writeToolName]);
    assert.equal(defs[0]!.source, "MCP: filesystem");
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_URL = prev;
    else delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
    if (prevName !== undefined) process.env.NEXT_PUBLIC_MCP_SERVER_NAME = prevName;
    else delete process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  }
});
