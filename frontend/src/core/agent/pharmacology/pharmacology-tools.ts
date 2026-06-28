/**
 * Fuente de conocimiento de FARMACOLOGÍA (gap G3) conectada por el MISMO cliente MCP ya construido
 * (rebanadas de descubrimiento + ejecución). Sus tools (pharma.drug_interactions,
 * pharma.dose_adjustment, pharma.drug_label) fluyen por el MISMO camino que cualquier tool:
 * registro + gating por rol + procedencia + tool_search.
 *
 * CONFIGURABLE como endpoint MCP (env, igual que el servidor MCP existente). Si hay un servidor MCP
 * de farmacología real configurado, se usa por JSON-RPC (reusa ``mcp-client``); si no, cae a un
 * proveedor LOCAL curado que respeta el MISMO contrato de tool, de modo que un servidor real lo
 * reemplaza puramente por configuración.
 *
 * ENCUADRE DE SEGURIDAD: son consultas de LECTURA/referencia (sin escritura de PHI), así que se
 * ejecutan SIN la tarjeta de aprobación P1; PERO su salida es DATO DE REFERENCIA NO CONFIABLE: se
 * etiqueta explícitamente (``wrapReference``), el modelo debe presentarla como referencia, decir
 * "verifica la fuente oficial" y NUNCA como prescripción ni dosis autoritativa. No debe rellenar ni
 * disparar una escritura clínica.
 */

import type { ToolDefinition } from "@/core/agent/tools/registry";
import {
  discoverMcpTools,
  type McpServerConfig,
} from "@/core/agent/mcp/mcp-client";
import { mapMcpToolsToDefinitions } from "@/core/agent/mcp/mcp-tools";

import { PHARMA_SERVER_NAME, PHARMA_TOOL_ITEMS, callLocalPharmacologyTool } from "./local-provider";

/** Procedencia cuando la fuente es un servidor MCP de farmacología real. */
export const PHARMA_MCP_PROVENANCE = "Farmacología (MCP)";
/** Procedencia cuando se usa el proveedor de referencia local (fallback). */
export const PHARMA_LOCAL_PROVENANCE = "Farmacología (referencia local)";

/** Aviso fijo que acompaña TODA salida de farmacología (dato de referencia no confiable). */
export const PHARMA_REFERENCE_NOTICE =
  "Dato de REFERENCIA no verificado. No es una indicación ni una prescripción. " +
  "Verifica la fuente oficial (ficha técnica) antes de actuar; la decisión clínica es del médico.";

/** Namespacing de las tools de farmacología: ``pharma.<tool>``. */
export function pharmacologyToolName(itemName: string): string {
  return `pharma.${itemName}`;
}

/**
 * Lee la configuración del servidor MCP de farmacología (opcional) desde el entorno. Sin URL,
 * devuelve ``null`` -> se usa el proveedor local. No registra la URL ni cabeceras.
 */
export function pharmacologyServerConfig(): McpServerConfig | null {
  const url = process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  if (!url || !url.trim()) {
    return null;
  }
  const name = process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_NAME;
  return { url: url.trim(), name: name && name.trim() ? name.trim() : PHARMA_SERVER_NAME };
}

/** Envuelve la salida como DATO DE REFERENCIA NO CONFIABLE, autoetiquetado. */
export function wrapReference(provenance: string): (content: unknown) => unknown {
  return (content: unknown) => ({
    tipo: "referencia_farmacologica",
    confiabilidad: "no_verificada",
    aviso: PHARMA_REFERENCE_NOTICE,
    fuente: provenance,
    resultado: content,
  });
}

/**
 * Carga las tools de farmacología como ToolDefinitions, por el MISMO mapeo MCP. Si hay servidor MCP
 * real configurado, lo descubre por JSON-RPC; ante cualquier fallo cae al proveedor local (la
 * referencia nunca debe quedar fuera). Sin servidor configurado, usa el proveedor local.
 */
export async function loadPharmacologyTools(
  fetchImpl: typeof fetch = fetch,
): Promise<ToolDefinition[]> {
  const config = pharmacologyServerConfig();
  if (config) {
    try {
      const items = await discoverMcpTools(config, fetchImpl);
      return mapMcpToolsToDefinitions(config, items, fetchImpl, {
        provenance: PHARMA_MCP_PROVENANCE,
        namespaceTool: pharmacologyToolName,
        wrapContent: wrapReference(PHARMA_MCP_PROVENANCE),
      });
    } catch {
      // Degrada al proveedor local: la referencia farmacológica no debe desaparecer ante un fallo.
    }
  }
  // Proveedor local (en proceso), mismo contrato de tool. URL vacía: nunca se usa la red.
  const localConfig: McpServerConfig = { url: "", name: PHARMA_SERVER_NAME };
  return mapMcpToolsToDefinitions(localConfig, PHARMA_TOOL_ITEMS, fetchImpl, {
    provenance: PHARMA_LOCAL_PROVENANCE,
    namespaceTool: pharmacologyToolName,
    callTool: callLocalPharmacologyTool,
    wrapContent: wrapReference(PHARMA_LOCAL_PROVENANCE),
  });
}
