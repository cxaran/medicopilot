// Paletas "/" del composer del chat (D1 del rediseño). DETERMINISTA y PURO: decide qué dropdown
// abrir a partir del texto del composer y filtra los comandos disponibles. No hace E/S ni escribe;
// la UI (CopilotPanel) consume el resultado para pintar la paleta y la búsqueda de pacientes.
//
// Dos modos de paleta, ambos disparados por "/":
//   - "commands": lista de comandos del agente (filtrada por lo escrito tras "/"). Cada comando de
//     tipo "prompt" SIEMBRA un prompt en el composer (no se autoenvía; el médico revisa y manda).
//   - "patient_search": "Ir a paciente" — al escribir "/paciente <texto>" se busca y, al elegir un
//     resultado, se abre su expediente (cambia el contexto activo). La búsqueda la hace la UI contra
//     el endpoint existente GET /patients/search (keystone 0113).

export type ComposerCommandKind = "prompt" | "patient_search";

export interface ComposerCommand {
  /** Disparador con barra, p. ej. "/resumen". */
  name: string;
  /** Texto de ayuda en la fila de la paleta. */
  description: string;
  /** Etiqueta corta (categoría) mostrada a la derecha de la fila. */
  tag: string;
  kind: ComposerCommandKind;
  /** Prompt que se siembra en el composer (sólo kind "prompt"). */
  prompt?: string;
  /** El comando sólo tiene sentido con un paciente activo (la UI lo puede atenuar/indicar). */
  requiresPatient?: boolean;
}

// Catálogo de comandos. Los de tipo "prompt" sólo redactan un mensaje (lectura); cualquier acción
// clínica de escritura sigue pasando por la aprobación P1 dentro del turno. No se inventan comandos
// de escritura directa.
export const COMPOSER_COMMANDS: readonly ComposerCommand[] = [
  {
    name: "/paciente",
    description: "Ir a un paciente: buscar y abrir su expediente",
    tag: "Navegar",
    kind: "patient_search",
  },
  {
    name: "/resumen",
    description: "Resumen clínico del paciente activo",
    tag: "Lectura",
    kind: "prompt",
    prompt: "Dame un resumen clínico del paciente con sus problemas activos, alergias y medicación.",
    requiresPatient: true,
  },
  {
    name: "/labs",
    description: "Últimos resultados de laboratorio del paciente",
    tag: "Lectura",
    kind: "prompt",
    prompt: "Muéstrame los últimos resultados de laboratorio del paciente y marca lo anormal.",
    requiresPatient: true,
  },
  {
    name: "/tareas",
    description: "Pendientes de seguimiento",
    tag: "Lectura",
    kind: "prompt",
    prompt: "Lista los pendientes de seguimiento (tareas, citas no atendidas y labs sin revisar).",
  },
  {
    name: "/agenda",
    description: "Citas de hoy",
    tag: "Lectura",
    kind: "prompt",
    prompt: "¿Qué citas tengo hoy?",
  },
];

export type ComposerPalette =
  | { mode: "none" }
  | { mode: "patient_search"; query: string }
  | { mode: "commands"; query: string; matches: readonly ComposerCommand[] };

/** Primer token tras la "/" (sin la barra), en minúsculas. "" si sólo hay "/". */
function leadingToken(input: string): string {
  return input.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
}

/**
 * Decide la paleta a mostrar para el texto actual del composer.
 *
 * - No empieza por "/" → ninguna paleta.
 * - Coincide con un disparador de búsqueda de paciente ("/paciente" exacto o con texto detrás) →
 *   modo patient_search con el término escrito.
 * - Cualquier otro texto que empiece por "/" → modo commands, filtrando por prefijo del nombre.
 */
export function parseComposerPalette(input: string): ComposerPalette {
  if (!input.startsWith("/")) {
    return { mode: "none" };
  }
  const lower = input.toLowerCase();
  const searchCmd = COMPOSER_COMMANDS.find((command) => command.kind === "patient_search");
  if (searchCmd) {
    const trigger = searchCmd.name.toLowerCase();
    if (lower === trigger || lower.startsWith(`${trigger} `)) {
      return { mode: "patient_search", query: input.slice(searchCmd.name.length).trim() };
    }
  }
  const token = leadingToken(input);
  const matches = COMPOSER_COMMANDS.filter((command) =>
    command.name.slice(1).toLowerCase().startsWith(token),
  );
  return { mode: "commands", query: token, matches };
}
