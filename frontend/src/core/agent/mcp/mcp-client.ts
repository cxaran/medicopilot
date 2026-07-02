// Cliente MCP MÍNIMO (Model Context Protocol). Hand-rolled (sin SDK de MCP): habla JSON-RPC 2.0
// sobre el transporte Streamable HTTP (un único endpoint POST que responde application/json o
// text/event-stream). El transporte stdio queda FUERA de alcance (no aplica en el navegador).
//
// Alcance: descubrimiento (`initialize` + `notifications/initialized` + `tools/list`) Y
// EJECUCIÓN (`tools/call`, ver ``callMcpTool``). Las tools MCP fluyen por el mismo camino que
// las nativas: las de lectura corren directo y toda ESCRITURA MCP pasa por el protocolo de
// aprobación P1 (igual que cualquier escritura; el mapeo/gating vive en mcp-tools.ts).
//
// Sin secretos en logs: este módulo NO escribe logs; si el endpoint requiere cabeceras
// (p. ej. Authorization de QA), viajan sólo en la petición, nunca se registran.

/** Configuración de UN servidor MCP (dev/QA). Una sola URL configurable. */
export interface McpServerConfig {
  /** Endpoint Streamable HTTP del servidor MCP. */
  url: string;
  /** Nombre legible para la procedencia ("MCP: <name>"). */
  name: string;
  /** Cabeceras extra opcionales (p. ej. Authorization de QA). Nunca se loguean. */
  headers?: Record<string, string>;
}

/** Item de tool tal como lo devuelve `tools/list` (subconjunto que usamos). */
export interface McpToolListItem {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  // Pistas de MCP sobre el comportamiento de la tool; usamos readOnlyHint para gatear.
  annotations?: { readOnlyHint?: boolean; title?: string };
}

// Versión del protocolo MCP que anunciamos; el servidor puede negociar otra distinta.
const MCP_PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "medicopilot-copilot", version: "0.1.0" } as const;

/**
 * Lee la configuración del único servidor MCP desde el entorno (dev/QA). Sin URL configurada,
 * devuelve ``null`` -> no hay tools MCP y NO es error. El nombre cae a "servidor" si no se da.
 */
export function mcpServerConfig(): McpServerConfig | null {
  const url = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  if (!url || !url.trim()) {
    return null;
  }
  const name = process.env.NEXT_PUBLIC_MCP_SERVER_NAME;
  return { url: url.trim(), name: name && name.trim() ? name.trim() : "servidor" };
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/**
 * Extrae el primer objeto JSON-RPC de una respuesta que puede venir como application/json o como
 * un stream SSE (text/event-stream con líneas ``data:``). Para initialize/tools/list la respuesta
 * es un único mensaje, así que basta el primer ``data:`` parseable.
 */
function parseRpcBody(contentType: string, body: string): JsonRpcResponse | null {
  if (contentType.includes("text/event-stream")) {
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            return JSON.parse(payload) as JsonRpcResponse;
          } catch {
            // sigue con la próxima línea data:
          }
        }
      }
    }
    return null;
  }
  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch {
    return null;
  }
}

/** POST de un mensaje JSON-RPC. Devuelve la respuesta parseada y el Mcp-Session-Id si lo hay. */
async function postRpc(
  config: McpServerConfig,
  message: Record<string, unknown>,
  sessionId: string | null,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{ response: JsonRpcResponse | null; sessionId: string | null; status: number }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(config.headers ?? {}),
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  const res = await fetchImpl(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    ...(signal ? { signal } : {}),
  });
  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  // Una notificación puede responder 202 sin cuerpo.
  if (res.status === 202) {
    return { response: null, sessionId: nextSession, status: res.status };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text().catch(() => "");
  return { response: parseRpcBody(contentType, text), sessionId: nextSession, status: res.status };
}

/** Handshake MCP: initialize -> notifications/initialized. Devuelve el session id (o null). */
async function initializeSession(
  config: McpServerConfig,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const init = await postRpc(
    config,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    },
    null,
    fetchImpl,
    signal,
  );
  if (!init.response || init.response.error) {
    throw new Error(`MCP initialize falló: ${init.response?.error?.message ?? `status ${init.status}`}`);
  }
  const sessionId = init.sessionId;
  // Notificación obligatoria tras initialize (sin id; respuesta ignorada).
  await postRpc(config, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, fetchImpl, signal);
  return sessionId;
}

/**
 * Descubre las tools de UN servidor MCP: handshake ``initialize`` -> ``notifications/initialized``
 * -> ``tools/list``. Devuelve los items de tool. Lanza si el handshake o el listado fallan (el
 * llamador de alto nivel degrada a [] sin romper el copiloto). No ejecuta ninguna tool.
 */
export async function discoverMcpTools(
  config: McpServerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<McpToolListItem[]> {
  const sessionId = await initializeSession(config, fetchImpl);
  const list = await postRpc(
    config,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    sessionId,
    fetchImpl,
  );
  if (!list.response || list.response.error) {
    throw new Error(`MCP tools/list falló: ${list.response?.error?.message ?? `status ${list.status}`}`);
  }
  const result = list.response.result as { tools?: McpToolListItem[] } | undefined;
  return Array.isArray(result?.tools) ? result.tools : [];
}

/** Resultado de ``tools/call``: el contenido (datos externos NO confiables) y si fue error. */
export interface McpCallResult {
  content: unknown;
  isError: boolean;
}

/** Tiempo máximo por defecto de una llamada MCP (handshake + tools/call). */
export const DEFAULT_MCP_CALL_TIMEOUT_MS = 30_000;

/**
 * EJECUTA una tool MCP (``tools/call``) — REBANADA 2. Reusa el handshake hand-rolled e invoca
 * la tool con sus argumentos. Robusto: timeout (AbortController) y errores upstream con mensaje
 * útil (patrón MP-CTRL-0077), nunca un cuelgue silencioso. El resultado es DATO EXTERNO NO
 * CONFIABLE: el llamador lo entrega como tool_result, jamás como instrucciones. No registra logs.
 *
 * El gating por rol y la APROBACIÓN P1 son responsabilidad del llamador (panel): este cliente
 * sólo habla con el servidor; no decide si se permite ejecutar.
 */
export async function callMcpTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<McpCallResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MCP_CALL_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const sessionId = await initializeSession(config, fetchImpl, controller.signal);
    const res = await postRpc(
      config,
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: toolName, arguments: args } },
      sessionId,
      fetchImpl,
      controller.signal,
    );
    if (!res.response || res.response.error) {
      throw new Error(`MCP tools/call falló: ${res.response?.error?.message ?? `status ${res.status}`}`);
    }
    const result = res.response.result as { content?: unknown; isError?: boolean } | undefined;
    return { content: result?.content ?? null, isError: result?.isError === true };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("MCP tools/call: tiempo de espera agotado.");
    }
    throw error instanceof Error ? error : new Error("MCP tools/call: error desconocido.");
  } finally {
    clearTimeout(timer);
  }
}
