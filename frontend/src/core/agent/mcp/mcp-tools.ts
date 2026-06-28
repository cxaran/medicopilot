import { ToolExecutionError, type ToolDefinition } from "@/core/agent/tools/registry";
import type { ObjectSchema } from "@/core/agent/tools/schema-validator";

import { discoverMcpTools, mcpServerConfig, type McpToolListItem } from "./mcp-client";

/**
 * Mapeo de tools MCP descubiertas al shape ToolDefinition existente, para que se SURFACEEN por el
 * MISMO camino que cualquier otra tool: catálogo con procedencia, gating por rol y
 * tool_search / tool_describe. REBANADA 1: SOLO descubrimiento/listado, sin ejecución.
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
 * SIN ejecución (rebanada 1): estas ToolDefinitions NO se registran en el ejecutor (``getTool``),
 * así que ``resolveToolCall`` jamás las encuentra; además su ``execute`` lanza un error explícito
 * de "no habilitado". La EJECUCIÓN de tools MCP + APROBACIÓN P1 + AISLAMIENTO son la REBANADA 2.
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

/** Mapea los items de ``tools/list`` de un servidor a ToolDefinitions con procedencia MCP. */
export function mapMcpToolsToDefinitions(
  serverName: string,
  items: readonly McpToolListItem[],
): ToolDefinition[] {
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
      // REBANADA 1: sin ejecución. Si algo intentara ejecutarla, falla explícito (rebanada 2).
      execute: async (): Promise<never> => {
        throw new ToolExecutionError(
          "mcp_execution_not_enabled",
          "La ejecución de herramientas MCP aún no está habilitada (llega en la siguiente rebanada, " +
            "con aprobación del médico).",
        );
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
          `${JSON.stringify(args)}. (La ejecución MCP llega en la siguiente rebanada.)`,
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
    return mapMcpToolsToDefinitions(config.name, items);
  } catch {
    return [];
  }
}
