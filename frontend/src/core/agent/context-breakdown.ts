import type { WireMessage, WireTool } from "@/core/agent/protocol";
import {
  estimateTokens,
  estimateToolSchemaTokens,
  messageText,
} from "@/core/agent/context-window";
import {
  operationalLayerMessage,
  personaLayerMessage,
  safetyLayerMessage,
  type PersonaFields,
} from "@/core/agent/persona";

/**
 * DESGLOSE del contexto que recibe el agente, para mostrarlo en un diálogo: cada instrucción/dato
 * que se antepone a la conversación, con su contenido y el % APROXIMADO de la ventana del modelo que
 * ocupa. NO incluye el chat (los mensajes ya viven en su propia interfaz). Módulo PURO (sin React ni
 * red): reconstruye las MISMAS capas líder que ``composeLeadingLayers`` + el esquema de herramientas,
 * y estima tokens con los mismos helpers que la barra de contexto, así los números concuerdan.
 */

export interface ContextBreakdownItem {
  key: string;
  /** Nombre de la capa (p. ej. "Seguridad clínica"). */
  label: string;
  /** Qué es, en una línea. */
  description: string;
  /** ``true`` = instrucción/dato de CONFIANZA (nuestro); ``false`` = dato inyectado no confiable. */
  trusted: boolean;
  /** Tokens estimados del elemento. */
  tokens: number;
  /** % APROXIMADO de la ventana del modelo que ocupa (redondeado). */
  percent: number;
  /** Contenido textual del elemento (para visualizarlo tal cual lo recibe el modelo). */
  content: string;
}

export interface ContextBreakdown {
  items: ContextBreakdownItem[];
  /** Suma de tokens de los elementos mostrados (todo lo que NO es el chat). */
  totalTokens: number;
  /** % de la ventana que ocupan en conjunto (redondeado). */
  totalPercent: number;
  /** Ventana efectiva del modelo (tokens), para contextualizar los %. */
  budgetWindow: number;
}

export interface ContextBreakdownInput {
  persona: PersonaFields | null | undefined;
  doctorProfile: WireMessage | null;
  activeContext: WireMessage | null;
  patientSummary: WireMessage | null;
  memory: WireMessage | null;
  toolsWire: readonly WireTool[];
  /** Ventana efectiva del modelo en tokens; si es 0 los % quedan en 0 (presupuesto desconocido). */
  budgetWindow: number;
}

const pct = (tokens: number, window: number): number =>
  window > 0 ? Math.round((tokens / window) * 100) : 0;

/** Resumen legible del esquema de herramientas (no el JSON crudo): conteo + nombres. */
function toolsContent(tools: readonly WireTool[]): string {
  if (tools.length === 0) {
    return "Sin herramientas declaradas.";
  }
  const names = tools.map((t) => t.name).sort((a, b) => a.localeCompare(b));
  return `El modelo tiene declaradas ${tools.length} herramientas (nombre + descripción + esquema de argumentos):\n` +
    names.map((n) => `• ${n}`).join("\n");
}

/**
 * Arma el desglose. Reconstruye las capas estables (seguridad/operativa/persona) desde sus builders
 * y toma las demás capas ya construidas; el esquema de herramientas se contabiliza como un elemento
 * propio (su costo en tokens es real aunque no sea "texto" del prompt).
 */
export function buildContextBreakdown(input: ContextBreakdownInput): ContextBreakdown {
  const { budgetWindow } = input;
  const items: ContextBreakdownItem[] = [];

  const push = (
    key: string,
    label: string,
    description: string,
    trusted: boolean,
    content: string,
  ): void => {
    const tokens = estimateTokens(content);
    items.push({ key, label, description, trusted, tokens, percent: pct(tokens, budgetWindow), content });
  };

  // Capas ESTABLES (siempre presentes): se reconstruyen con los mismos builders del turno.
  push(
    "safety",
    "Seguridad clínica",
    "Reglas innegociables del producto (fija, no editable).",
    true,
    messageText(safetyLayerMessage()),
  );
  push(
    "operational",
    "Guía operativa de herramientas",
    "Cómo usar las herramientas con fluidez (instrucción nuestra).",
    true,
    messageText(operationalLayerMessage()),
  );

  const personaMessage = personaLayerMessage(input.persona);
  if (personaMessage) {
    push(
      "persona",
      "Persona del copiloto",
      "Preferencias del médico (tono, especialidad, estilo).",
      true,
      messageText(personaMessage),
    );
  }
  if (input.doctorProfile) {
    push(
      "doctor",
      "Médico a cargo",
      "Perfil del usuario que atiende (nombre, cédula, especialidad).",
      true,
      messageText(input.doctorProfile),
    );
  }
  if (input.activeContext) {
    push(
      "active_context",
      "Contexto activo",
      "Ámbito de trabajo (paciente/consulta seleccionados).",
      true,
      messageText(input.activeContext),
    );
  }
  if (input.patientSummary) {
    push(
      "patient_summary",
      "Resumen del paciente",
      "Proyección compacta del expediente (referencia).",
      true,
      messageText(input.patientSummary),
    );
  }
  if (input.memory) {
    push(
      "memories",
      "Memorias",
      "Recuerdos del médico recuperados (datos NO confiables).",
      false,
      messageText(input.memory),
    );
  }

  // Esquema de HERRAMIENTAS: costo real de contexto (se estima aparte, no como texto de prompt).
  const toolTokens = estimateToolSchemaTokens(input.toolsWire);
  items.push({
    key: "tools",
    label: "Herramientas (esquema)",
    description: "Definiciones de las herramientas disponibles para el modelo.",
    trusted: true,
    tokens: toolTokens,
    percent: pct(toolTokens, budgetWindow),
    content: toolsContent(input.toolsWire),
  });

  const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);
  return {
    items,
    totalTokens,
    totalPercent: pct(totalTokens, budgetWindow),
    budgetWindow,
  };
}
