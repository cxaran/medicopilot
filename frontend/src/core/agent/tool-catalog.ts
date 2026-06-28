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

export type ToolStatus = "declared" | "gated_out";

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
 * Proyecta el catálogo de tools con su procedencia y estado de gating. Lecturas siempre
 * declaradas; escrituras declaradas solo si su recurso destino es creable por el médico.
 */
export function buildToolCatalog(
  tools: readonly ToolDefinition[],
  creatable: Set<string>,
): ToolCatalogEntry[] {
  return tools.map((tool) => {
    const source = toolSource(tool.name);
    if (tool.kind === "read") {
      return { name: tool.name, kind: "read", source, targetResource: null, status: "declared", reason: null };
    }
    const target = tool.approval?.targetResource ?? null;
    if (target && creatable.has(target)) {
      return { name: tool.name, kind: "write", source, targetResource: target, status: "declared", reason: null };
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
