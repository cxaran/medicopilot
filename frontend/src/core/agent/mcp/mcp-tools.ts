import { ToolExecutionError, type ToolDefinition } from "@/core/agent/tools/registry";
import type { ObjectSchema } from "@/core/agent/tools/schema-validator";

import {
  callMcpTool,
  discoverMcpTools,
  mcpServerConfig,
  type McpServerConfig,
  type McpToolListItem,
} from "./mcp-client";

/**
 * Mapeo de tools MCP descubiertas al shape ToolDefinition existente, para que se SURFACEEN por el
 * MISMO camino que cualquier otra tool: catálogo con procedencia, gating por rol y
 * tool_search / tool_describe.
 *
 * Procedencia: "MCP: <servidor>" (vía el campo ``source`` de ToolDefinition).
 *
 * Gating como cualquier tool: una tool MCP marcada read-only por el servidor (annotations.
 * readOnlyHint) se trata como LECTURA (no se gatea por rol, igual que las lecturas nativas); el
 * resto se trata CONSERVADORAMENTE como ESCRITURA y se gatea por el permiso de creación del
 * recurso sintético ``mcp_tools`` (un despliegue lo concede para habilitar tools MCP de
 * escritura). Así una tool MCP de escritura queda gated-out salvo permiso, exactamente como
 * cualquier escritura.
 *
 * EJECUCIÓN (rebanada 2): ``execute`` invoca ``tools/call`` del servidor (ver ``callMcpTool``).
 * Las ToolDefinitions MCP siguen SIN registrarse en el ejecutor nativo (``getTool``); el panel las
 * despacha pasándolas como tools extra a ``resolveToolCall`` (sólo las EFECTIVAS tras el gating).
 * INVARIANTES: (a) toda tool MCP de ESCRITURA pasa por la APROBACIÓN P1 (es kind "write" con
 * approval) antes de ejecutarse; sólo las read-only corren directo. (b) el gating por rol se
 * mantiene (el panel sólo despacha las efectivas). (c) la salida es DATO EXTERNO NO CONFIABLE: se
 * entrega como tool_result, nunca como instrucciones, y no dispara escrituras por sí sola.
 * (d) robustez: ``callMcpTool`` aplica timeout y surface de errores; aquí se traducen a
 * ToolExecutionError con mensaje útil. Sin secretos/PHI en logs.
 */

/** Recurso sintético que gatea las tools MCP de escritura (un despliegue concede su creación). */
export const MCP_WRITE_RESOURCE = "mcp_tools";

/** Procedencia legible de una tool MCP. */
export function mcpProvenance(serverName: string): string {
  return `MCP: ${serverName}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Nombre namespaced de una tool MCP: ``mcp.<servidor>.<tool>`` (evita colisiones). */
export function mcpToolName(serverName: string, toolName: string): string {
  return `mcp.${slug(serverName)}.${toolName}`;
}

// Esquema local permisivo: el validador acotado no cubre esquemas arbitrarios de MCP; la forma
// REAL se expone al modelo vía wireSchema (el inputSchema del servidor). Irrelevante en rebanada
// 1 porque no hay ejecución, pero se mantiene coherente con el resto del registro.
const PASSTHROUGH_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: true,
};

/** Resume (acotado) un valor para mensajes de error, sin volcar todo el contenido. */
function clampText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Mapea los items de ``tools/list`` de un servidor a ToolDefinitions con procedencia MCP y un
 * ``execute`` que llama ``tools/call`` (rebanada 2). El llamador (panel) sigue siendo quien aplica
 * gating y APROBACIÓN P1 antes de invocar ``execute``.
 */
export function mapMcpToolsToDefinitions(
  config: McpServerConfig,
  items: readonly McpToolListItem[],
  fetchImpl?: typeof fetch,
): ToolDefinition[] {
  const serverName = config.name;
  const source = mcpProvenance(serverName);
  return items.map((item) => {
    const readOnly = item.annotations?.readOnlyHint === true;
    const name = mcpToolName(serverName, item.name);
    const description =
      (item.description && item.description.trim()) ||
      `Herramienta MCP «${item.name}» del servidor ${serverName}.`;
    const wireSchema =
      item.inputSchema && typeof item.inputSchema === "object"
        ? item.inputSchema
        : { type: "object", properties: {} };

    const base = {
      name,
      description,
      source,
      inputSchema: PASSTHROUGH_SCHEMA,
      wireSchema,
      // EJECUCIÓN (rebanada 2): invoca tools/call. La salida es DATO EXTERNO NO CONFIABLE; se
      // devuelve tal cual para entregarla como tool_result. Los errores (timeout, upstream,
      // isError del servidor) se traducen a ToolExecutionError con mensaje útil y acotado.
      execute: async (args: Record<string, unknown>): Promise<unknown> => {
        let result;
        try {
          result = await callMcpTool(config, item.name, args, fetchImpl ? { fetchImpl } : {});
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error al llamar la herramienta MCP.";
          throw new ToolExecutionError("mcp_call_failed", clampText(message));
        }
        if (result.isError) {
          throw new ToolExecutionError(
            "mcp_tool_error",
            clampText(
              typeof result.content === "string" ? result.content : JSON.stringify(result.content),
            ),
          );
        }
        return result.content;
      },
    };

    if (readOnly) {
      return { ...base, kind: "read" as const };
    }
    return {
      ...base,
      kind: "write" as const,
      approval: {
        actionType: "mcp_tool_call",
        targetResource: MCP_WRITE_RESOURCE,
        summarize: (args: Record<string, unknown>) =>
          `Ejecutar la herramienta MCP «${item.name}» (${serverName}) con argumentos ` +
          `${JSON.stringify(args)}.`,
      },
    };
  });
}

/**
 * Carga las tools del servidor MCP configurado y las mapea a ToolDefinitions. Sin servidor
 * configurado -> [] (no es error). Cualquier fallo de red/protocolo degrada a [] para NO romper
 * el copiloto (el servidor MCP es opcional). No registra la URL ni cabeceras en logs.
 */
export async function loadMcpTools(fetchImpl: typeof fetch = fetch): Promise<ToolDefinition[]> {
  const config = mcpServerConfig();
  if (!config) {
    return [];
  }
  try {
    const items = await discoverMcpTools(config, fetchImpl);
    return mapMcpToolsToDefinitions(config, items, fetchImpl);
  } catch {
    return [];
  }
}
