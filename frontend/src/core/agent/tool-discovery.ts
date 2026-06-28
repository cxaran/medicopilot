import { toolSource } from "./tool-catalog";

import type { ToolDefinition, ToolKind } from "./tools/registry";

/**
 * Descubrimiento de tools a ESCALA (paridad OpenClaw tool_search / tool_describe). En vez de
 * declarar TODO el catálogo al modelo cada turno (lo que infla el contexto y choca con
 * GATEWAY_MAX_TOOLS_PER_TURN al crecer), se declara un NÚCLEO pequeño y siempre-presente (las
 * lecturas clínicas que el agente necesita constantemente + las meta-tools) y el resto del
 * catálogo queda DESCUBRIBLE bajo demanda:
 *  - tool_search(query): el modelo encuentra tools relevantes por intención.
 *  - tool_describe(names): carga el esquema completo de las que va a usar este hilo.
 * Las tools cargadas se suman al set DECLARADO en los turnos siguientes (el set por turno se
 * mantiene pequeño y acotado; el catálogo completo sigue accesible).
 *
 * INVARIANTES (no se relajan): el gating por rol/permiso (tool-hardening) decide qué es
 * buscable/cargable (las gateadas NUNCA aparecen en search/describe); el protocolo de aprobación
 * P1 sigue aplicando a cualquier tool de ESCRITURA descubierta (descubrir no salta la aprobación);
 * la procedencia del catálogo refleja declarado/bajo-demanda/restringido. El seam vive en el
 * NAVEGADOR (donde viven las tools, el gating y la procedencia); el gateway sigue
 * provider-neutral y sólo recibe el set declarado, ya pequeño.
 */

// Núcleo SIEMPRE declarado: lecturas clínicas constantes para que los turnos simples funcionen
// sin una vuelta de búsqueda, más las meta-tools de descubrimiento.
export const META_TOOL_NAMES: readonly string[] = ["tool_search", "tool_describe"];

export const CORE_TOOL_NAMES: readonly string[] = [
  "clinical.list_patients",
  "clinical.get_patient",
  "clinical.patient_summary",
  "clinical.list_recent_consultations",
  ...META_TOOL_NAMES,
];

export function isMetaTool(name: string): boolean {
  return META_TOOL_NAMES.includes(name);
}

export interface ToolSearchHit {
  name: string;
  kind: ToolKind;
  source: string;
  description: string;
}

export type ToolDescribeHit =
  | { name: string; kind: ToolKind; description: string; input_schema: Record<string, unknown> }
  | { name: string; error: string };

/**
 * Contexto que el navegador inyecta al ejecutar las meta-tools: el set BUSCABLE (tools efectivas
 * tras el gating, sin las meta-tools) y un callback para marcar como CARGADAS las que el modelo
 * describe (para declararlas en turnos siguientes).
 */
export interface ToolDiscoveryContext {
  searchable: ToolDefinition[];
  markLoaded: (names: string[]) => void;
}

const DEFAULT_SEARCH_LIMIT = 8;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function terms(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 2);
}

/**
 * Busca tools por INTENCIÓN sobre los candidatos (ya filtrados por rol). Puntúa por coincidencia
 * de términos de la consulta en nombre + descripción + procedencia. Excluye las meta-tools. Las
 * gateadas no llegan aquí porque no están en `candidates`.
 */
export function searchTools(
  query: string,
  candidates: readonly ToolDefinition[],
  limit: number = DEFAULT_SEARCH_LIMIT,
): ToolSearchHit[] {
  const queryTerms = terms(query);
  const scored = candidates
    .filter((tool) => !isMetaTool(tool.name))
    .map((tool) => {
      const haystack = normalize(`${tool.name} ${tool.description} ${toolSource(tool.name)}`);
      // Sin términos (consulta vacía) -> score 1 para devolver el catálogo navegable acotado.
      const score =
        queryTerms.length === 0
          ? 1
          : queryTerms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, Math.max(1, limit));

  return scored.map(({ tool }) => ({
    name: tool.name,
    kind: tool.kind,
    source: toolSource(tool.name),
    description: tool.description,
  }));
}

/**
 * Carga el esquema completo de las tools pedidas (de los candidatos efectivos). Un nombre que no
 * exista o esté gateado (no está en `candidates`) o sea una meta-tool devuelve un error por
 * nombre — NUNCA se describe una tool restringida.
 */
export function describeTools(
  names: readonly string[],
  candidates: readonly ToolDefinition[],
): ToolDescribeHit[] {
  const byName = new Map(candidates.filter((tool) => !isMetaTool(tool.name)).map((tool) => [tool.name, tool]));
  return names.map((name) => {
    const tool = byName.get(name);
    if (!tool) {
      return { name, error: `Herramienta no disponible o restringida: ${name}` };
    }
    return {
      name: tool.name,
      kind: tool.kind,
      description: tool.description,
      input_schema: (tool.wireSchema ?? tool.inputSchema) as unknown as Record<string, unknown>,
    };
  });
}

/**
 * Nombres del set DECLARADO al modelo este turno: núcleo + meta + tools cargadas, intersectado
 * con las efectivas (una tool gateada nunca se declara aunque se hubiera "cargado").
 */
export function declaredToolNames(
  effective: readonly ToolDefinition[],
  loaded: Iterable<string>,
): Set<string> {
  const effectiveNames = new Set(effective.map((tool) => tool.name));
  const declared = new Set<string>();
  for (const name of CORE_TOOL_NAMES) {
    if (effectiveNames.has(name)) {
      declared.add(name);
    }
  }
  for (const name of loaded) {
    if (effectiveNames.has(name)) {
      declared.add(name);
    }
  }
  return declared;
}

/** Lista DECLARADA (acotada) a enviar al modelo: efectivas que están en el set declarado. */
export function declaredTools(
  effective: readonly ToolDefinition[],
  loaded: Iterable<string>,
): ToolDefinition[] {
  const declared = declaredToolNames(effective, loaded);
  return effective.filter((tool) => declared.has(tool.name));
}
