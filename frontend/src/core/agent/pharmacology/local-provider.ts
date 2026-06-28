/**
 * Proveedor LOCAL de farmacología que implementa el MISMO contrato de tool que un servidor MCP
 * (``McpToolListItem`` para el descubrimiento + ``McpCallResult`` para la ejecución), pero EN
 * PROCESO (sin red ni JSON-RPC). Permite ejercitar el camino de extremo a extremo sin un servidor
 * MCP de farmacología real; uno real lo reemplaza puramente por configuración.
 *
 * Cubre los casos de seguridad del medicamento de la auditoría (interacciones, ajuste renal/
 * hepático, etiqueta: alto riesgo, embarazo/lactancia, dosis, alimentos/alcohol, efectos adversos,
 * monitorización). Todo proviene del dataset curado y citado; un fármaco no cubierto devuelve "no
 * disponible" (sin fabricar). La salida es DATO DE REFERENCIA, no una prescripción.
 */

import type { McpCallResult, McpToolListItem } from "@/core/agent/mcp/mcp-client";

import { PHARMA_SOURCE, coveredDrugs, findDrug } from "./dataset";

/** Nombre de servidor lógico del proveedor (para el contrato MCP). */
export const PHARMA_SERVER_NAME = "farmacologia";

const DRUG_PROP = {
  type: "string",
  description: "Nombre del fármaco (genérico o marca), p. ej. 'metformina'.",
} as const;

/** Catálogo de tools del proveedor (shape ``tools/list`` de MCP). Todas de SOLO LECTURA. */
export const PHARMA_TOOL_ITEMS: McpToolListItem[] = [
  {
    name: "drug_interactions",
    description:
      "Consulta interacciones farmacológicas de REFERENCIA de un fármaco (opcionalmente frente a " +
      "otro). Dato no confiable: verifica la fuente oficial; nunca lo presentes como prescripción.",
    inputSchema: {
      type: "object",
      properties: {
        drug: DRUG_PROP,
        other_drug: { type: "string", description: "Otro fármaco para filtrar la interacción (opcional)." },
      },
      required: ["drug"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, title: "Interacciones farmacológicas (referencia)" },
  },
  {
    name: "dose_adjustment",
    description:
      "Consulta el ajuste de dosis de REFERENCIA por insuficiencia renal o hepática de un fármaco. " +
      "Dato no confiable: verifica la fuente oficial; no es una indicación de dosis.",
    inputSchema: {
      type: "object",
      properties: {
        drug: DRUG_PROP,
        organ: {
          type: "string",
          description: "Órgano afectado (renal u hepático). Si se omite, devuelve ambos.",
          enum: ["renal", "hepatic"],
        },
      },
      required: ["drug"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, title: "Ajuste de dosis (referencia)" },
  },
  {
    name: "drug_label",
    description:
      "Devuelve un resumen de etiqueta de REFERENCIA de un fármaco: alto riesgo, embarazo/lactancia, " +
      "dosis aprobada, alimentos/alcohol, efectos adversos y monitorización. Dato no confiable: " +
      "verifica la fuente oficial; no es una prescripción.",
    inputSchema: {
      type: "object",
      properties: { drug: DRUG_PROP },
      required: ["drug"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, title: "Etiqueta de medicamento (referencia)" },
  },
];

function unavailable(drug: string): McpCallResult {
  return {
    content: {
      disponible: false,
      mensaje:
        `No disponible: «${drug}» no está en la base de referencia curada (cobertura limitada). ` +
        "Consulta la fuente oficial (ficha técnica).",
      cobertura: "limitada",
      farmacos_cubiertos: coveredDrugs(),
    },
    isError: false,
  };
}

function badArgs(): McpCallResult {
  return {
    content: { error: "Falta el parámetro 'drug' (nombre del fármaco)." },
    isError: true,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Ejecuta una tool del proveedor local (equivalente a ``tools/call`` de MCP, en proceso). Nunca
 * fabrica: un fármaco no cubierto devuelve "no disponible". Devuelve ``McpCallResult`` para que el
 * mapeo MCP existente lo trate igual que la salida de un servidor real.
 */
export async function callLocalPharmacologyTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const drug = asString(args.drug);
  if (!drug) {
    return badArgs();
  }
  const entry = findDrug(drug);
  if (!entry) {
    return unavailable(drug);
  }

  if (toolName === "drug_interactions") {
    const other = asString(args.other_drug);
    const interacciones = other
      ? entry.interacciones.filter((i) =>
          i.con
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .includes(other.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")),
        )
      : entry.interacciones;
    return {
      content: {
        disponible: true,
        farmaco: entry.nombre,
        interacciones,
        nota:
          other && interacciones.length === 0
            ? `Sin interacción de referencia registrada entre ${entry.nombre} y «${other}» (cobertura limitada; no implica ausencia de interacción).`
            : undefined,
        fuente: PHARMA_SOURCE,
      },
      isError: false,
    };
  }

  if (toolName === "dose_adjustment") {
    const organ = asString(args.organ);
    const ajuste: Record<string, string> = {};
    if (organ !== "hepatic") ajuste.renal = entry.ajuste_renal;
    if (organ !== "renal") ajuste.hepatico = entry.ajuste_hepatico;
    return {
      content: { disponible: true, farmaco: entry.nombre, ajuste, fuente: PHARMA_SOURCE },
      isError: false,
    };
  }

  if (toolName === "drug_label") {
    return {
      content: {
        disponible: true,
        farmaco: entry.nombre,
        alto_riesgo: entry.alto_riesgo,
        embarazo: entry.embarazo,
        lactancia: entry.lactancia,
        dosis_aprobada: entry.dosis_aprobada,
        alimentos_alcohol: entry.alimentos_alcohol,
        efectos_adversos: entry.efectos_adversos,
        monitorizacion: entry.monitorizacion,
        ajuste_renal: entry.ajuste_renal,
        ajuste_hepatico: entry.ajuste_hepatico,
        fuente: PHARMA_SOURCE,
      },
      isError: false,
    };
  }

  return { content: { error: `Herramienta de farmacología desconocida: ${toolName}` }, isError: true };
}
