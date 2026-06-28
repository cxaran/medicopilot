import type { ResourceCatalog } from "@/core/api/contracts";

import type { ToolDefinition } from "./tools/registry";

/**
 * Catálogo de tools con PROCEDENCIA y gating por rol (tool-hardening, sobre P1). Antes de
 * declarar las tools al modelo, las de ESCRITURA se filtran por los permisos del médico:
 * una tool de escritura solo se declara si el médico puede CREAR en su recurso destino. Las
 * de LECTURA nunca se gatean.
 *
 * Defensa en profundidad, NO sustituto: FastAPI sigue siendo la autoridad y revalida cada
 * ejecución con la cookie del médico. El gating evita siquiera OFRECER al modelo una acción
 * que el médico no podría realizar. La señal de permiso viene del catálogo de recursos
 * (``/api/v1/resources``), que ya está proyectado por permiso: ``forms.create`` solo está
 * presente si el médico tiene el permiso de creación de ese recurso.
 */

// "declared" = se declara al modelo este turno (núcleo + meta + cargadas); "discoverable" = no
// se declara por defecto pero es accesible bajo demanda vía tool_search/tool_describe (no gateada);
// "gated_out" = restringida por rol/permiso (nunca buscable ni declarable).
export type ToolStatus = "declared" | "discoverable" | "gated_out";

export interface ToolCatalogEntry {
  name: string;
  kind: "read" | "write";
  /** Procedencia legible (familia de la tool), para auditoría. */
  source: string;
  /** Recurso destino de una escritura (null para lecturas). */
  targetResource: string | null;
  status: ToolStatus;
  /** Motivo del gating cuando ``status === "gated_out"``. */
  reason: string | null;
}

const SOURCE_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ["clinical.", "Clínica"],
  ["pubmed.", "Investigación"],
  ["memory.", "Memoria"],
  ["ui.", "Interfaz"],
  ["sandbox.", "Utilidad"],
];

/** Procedencia (familia) de una tool a partir de su prefijo de nombre. */
export function toolSource(name: string): string {
  for (const [prefix, label] of SOURCE_BY_PREFIX) {
    if (name.startsWith(prefix)) {
      return label;
    }
  }
  return "Otra";
}

/**
 * Procedencia EFECTIVA de una tool: su ``source`` explícito si lo declara (p. ej. las MCP, que
 * llevan "MCP: <servidor>"), o la inferida por prefijo del nombre en caso contrario.
 */
export function sourceOf(tool: { name: string; source?: string }): string {
  return tool.source ?? toolSource(tool.name);
}

/**
 * Recursos en los que el médico puede CREAR, según el catálogo permission-projected.
 * ``forms.create`` solo aparece si el backend concede el permiso de creación.
 */
export function creatableResources(catalog: ResourceCatalog): Set<string> {
  const set = new Set<string>();
  for (const resource of catalog) {
    if (resource.forms?.create) {
      set.add(resource.name);
    }
  }
  return set;
}

/**
 * Proyecta el catálogo de tools con su procedencia y estado de gating. Lecturas nunca se gatean
 * por rol; escrituras solo pasan el gate si su recurso destino es creable por el médico. Si se
 * pasa ``declaredNames`` (descubrimiento a escala), una tool NO gateada se marca "declared" si
 * está en ese set (núcleo + meta + cargadas) o "discoverable" si solo está disponible bajo
 * demanda. Sin ``declaredNames`` (compat), toda tool no gateada queda "declared".
 */
export function buildToolCatalog(
  tools: readonly ToolDefinition[],
  creatable: Set<string>,
  declaredNames?: ReadonlySet<string>,
): ToolCatalogEntry[] {
  // Estado de una tool que pasa el gating de rol: declarada o solo descubrible bajo demanda.
  const availableStatus = (name: string): ToolStatus =>
    declaredNames && !declaredNames.has(name) ? "discoverable" : "declared";
  const availableReason = (name: string): string | null =>
    declaredNames && !declaredNames.has(name) ? "Disponible bajo demanda vía tool_search." : null;

  return tools.map((tool) => {
    const source = sourceOf(tool);
    if (tool.kind === "read") {
      return {
        name: tool.name,
        kind: "read",
        source,
        targetResource: null,
        status: availableStatus(tool.name),
        reason: availableReason(tool.name),
      };
    }
    const target = tool.approval?.targetResource ?? null;
    // Escritura OWNER-SCOPED (p. ej. memorias del médico): no se gatea por el catálogo RBAC
    // (no es un recurso global), siempre disponible para el dueño. Igual pasa por aprobación.
    if (tool.approval?.ownerScoped) {
      return {
        name: tool.name,
        kind: "write",
        source,
        targetResource: target,
        status: availableStatus(tool.name),
        reason: availableReason(tool.name),
      };
    }
    if (target && creatable.has(target)) {
      return {
        name: tool.name,
        kind: "write",
        source,
        targetResource: target,
        status: availableStatus(tool.name),
        reason: availableReason(tool.name),
      };
    }
    return {
      name: tool.name,
      kind: "write",
      source,
      targetResource: target,
      status: "gated_out",
      reason: target
        ? `El médico no tiene permiso para crear en ${target}.`
        : "La herramienta de escritura no declara recurso destino.",
    };
  });
}

/** Lista EFECTIVA de tools a declarar al modelo (excluye las gateadas por rol). */
export function effectiveTools(
  tools: readonly ToolDefinition[],
  creatable: Set<string>,
): ToolDefinition[] {
  const declared = new Set(
    buildToolCatalog(tools, creatable)
      .filter((entry) => entry.status === "declared")
      .map((entry) => entry.name),
  );
  return tools.filter((tool) => declared.has(tool.name));
}
