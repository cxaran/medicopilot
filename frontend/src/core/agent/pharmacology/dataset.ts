/**
 * Conjunto de referencia farmacológica CURADO, ACOTADO y HONESTAMENTE INCOMPLETO.
 *
 * Existe para ejercitar el camino de extremo a extremo cuando NO hay un servidor MCP de
 * farmacología real al que apuntar. Un servidor MCP real lo reemplaza por completo cambiando la
 * configuración (ver ``pharmacology-tools.ts``); este módulo respeta el MISMO contrato de tool.
 *
 * REGLAS (no se relajan):
 *  - NO se inventan datos. Cada entrada cita su fuente y los hechos son de etiqueta/ficha técnica
 *    ampliamente documentados (resumen, no exhaustivo).
 *  - La cobertura es ``limitada`` (un puñado de fármacos comunes); un fármaco no cubierto devuelve
 *    "no disponible", nunca una respuesta fabricada.
 *  - Todo es DATO DE REFERENCIA, no una indicación ni una prescripción: el médico verifica la
 *    fuente oficial y decide.
 */

/** Nota de fuente/cobertura común a todas las entradas curadas. */
export const PHARMA_SOURCE =
  "Resumen de referencia curado a partir de la ficha técnica/etiqueta oficial del medicamento " +
  "(no exhaustivo). Cobertura limitada a fármacos de ejemplo. Verifica siempre la fuente oficial.";

export interface PharmaInteraction {
  /** Sustancia/grupo con el que interactúa (texto). */
  con: string;
  /** Efecto/riesgo de la interacción. */
  efecto: string;
}

export interface PharmaEntry {
  /** Nombre canónico para mostrar. */
  nombre: string;
  /** Nombres alternativos en minúsculas para la búsqueda (genérico/marca/variantes). */
  alias: string[];
  interacciones: PharmaInteraction[];
  ajuste_renal: string;
  ajuste_hepatico: string;
  embarazo: string;
  lactancia: string;
  alto_riesgo: string;
  efectos_adversos: string;
  monitorizacion: string;
  alimentos_alcohol: string;
  dosis_aprobada: string;
}

// Hechos de etiqueta ampliamente documentados (textbook). Conservadores y citados.
const ENTRIES: PharmaEntry[] = [
  {
    nombre: "Metformina",
    alias: ["metformina", "metformin", "dimefor", "glucophage"],
    interacciones: [
      { con: "Medios de contraste yodados IV", efecto: "Riesgo de acidosis láctica si hay deterioro renal; suele suspenderse alrededor del estudio." },
      { con: "Alcohol", efecto: "Aumenta el riesgo de acidosis láctica." },
    ],
    ajuste_renal:
      "Contraindicada con TFG < 30 mL/min/1.73m². No iniciar con TFG 30–45; reevaluar beneficio/riesgo y vigilar.",
    ajuste_hepatico: "Usar con precaución; la insuficiencia hepática aumenta el riesgo de acidosis láctica.",
    embarazo: "Su uso en el embarazo debe individualizarse; consulta la fuente oficial.",
    lactancia: "Consulta la fuente oficial.",
    alto_riesgo: "No suele clasificarse como medicamento de alto riesgo.",
    efectos_adversos: "Molestias gastrointestinales (náusea, diarrea); acidosis láctica (rara pero grave).",
    monitorizacion: "Función renal y vitamina B12 en tratamiento prolongado.",
    alimentos_alcohol: "Tomar con alimentos para reducir molestias GI; evitar el consumo excesivo de alcohol.",
    dosis_aprobada: "Dosis habitual individualizada; ver ficha técnica para inicio, titulación y máximo.",
  },
  {
    nombre: "Warfarina",
    alias: ["warfarina", "warfarin", "coumadin"],
    interacciones: [
      { con: "AINEs (p. ej. ibuprofeno)", efecto: "Aumentan el riesgo de sangrado." },
      { con: "Amiodarona y varios antibióticos", efecto: "Pueden aumentar el INR y el riesgo de sangrado." },
      { con: "Alimentos ricos en vitamina K", efecto: "Pueden reducir el efecto anticoagulante." },
    ],
    ajuste_renal: "Usar con precaución; vigilar el INR más estrechamente.",
    ajuste_hepatico: "Mayor sensibilidad y riesgo de sangrado; suele requerir dosis menores y vigilancia estrecha.",
    embarazo: "Teratógena; en general contraindicada en el embarazo.",
    lactancia: "Suele considerarse compatible; consulta la fuente oficial.",
    alto_riesgo: "Sí: anticoagulante de ALTO RIESGO (alta probabilidad de daño por error).",
    efectos_adversos: "Sangrado (el más relevante).",
    monitorizacion: "INR / tiempo de protrombina de forma regular.",
    alimentos_alcohol: "Mantener consumo estable de vitamina K; el alcohol puede alterar el INR.",
    dosis_aprobada: "Individualizada según INR objetivo; ver ficha técnica.",
  },
  {
    nombre: "Ibuprofeno",
    alias: ["ibuprofeno", "ibuprofen", "advil", "motrin"],
    interacciones: [
      { con: "Anticoagulantes (p. ej. warfarina)", efecto: "Aumentan el riesgo de sangrado." },
      { con: "IECA/ARA-II + diuréticos", efecto: "Riesgo renal aumentado (combinación nefrotóxica)." },
      { con: "Litio", efecto: "Puede aumentar los niveles de litio." },
    ],
    ajuste_renal: "Evitar en insuficiencia renal; los AINEs pueden deteriorar la función renal.",
    ajuste_hepatico: "Usar con precaución en hepatopatía.",
    embarazo: "Evitar en el tercer trimestre (riesgo de cierre del ductus arterioso).",
    lactancia: "Suele considerarse compatible a dosis habituales; consulta la fuente oficial.",
    alto_riesgo: "Riesgo gastrointestinal, renal y cardiovascular.",
    efectos_adversos: "Gastrointestinales (úlcera/sangrado), renales y cardiovasculares.",
    monitorizacion: "Función renal y presión arterial en uso prolongado o pacientes de riesgo.",
    alimentos_alcohol: "Tomar con alimentos; el alcohol aumenta el riesgo gastrointestinal.",
    dosis_aprobada: "Sin receta suele limitarse a dosis diarias menores; ver ficha técnica para el máximo.",
  },
  {
    nombre: "Paracetamol",
    alias: ["paracetamol", "acetaminofen", "acetaminofén", "acetaminophen", "tylenol", "tempra"],
    interacciones: [
      { con: "Warfarina (uso crónico)", efecto: "Puede aumentar el INR." },
      { con: "Alcohol", efecto: "Aumenta el riesgo de hepatotoxicidad." },
    ],
    ajuste_renal: "Considerar ampliar el intervalo de dosis en insuficiencia renal grave.",
    ajuste_hepatico: "Reducir o evitar en hepatopatía; es hepatotóxico en sobredosis.",
    embarazo: "Analgésico/antipirético de elección habitual; usar la dosis mínima eficaz.",
    lactancia: "Suele considerarse compatible.",
    alto_riesgo: "Hepatotoxicidad por sobredosis (riesgo principal).",
    efectos_adversos: "Hepatotoxicidad en sobredosis (el más relevante).",
    monitorizacion: "Vigilar la dosis acumulada diaria; función hepática en pacientes de riesgo.",
    alimentos_alcohol: "Evitar el alcohol por el riesgo hepático.",
    dosis_aprobada: "Existe un máximo diario; no exceder. Ver ficha técnica para la dosis exacta.",
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Lista de fármacos cubiertos (nombres canónicos), para transparencia de cobertura. */
export function coveredDrugs(): string[] {
  return ENTRIES.map((entry) => entry.nombre);
}

/** Busca una entrada por nombre o alias (normalizado). Devuelve ``null`` si no está cubierta. */
export function findDrug(query: string): PharmaEntry | null {
  const q = normalize(query);
  if (!q) {
    return null;
  }
  for (const entry of ENTRIES) {
    if (entry.alias.some((alias) => normalize(alias) === q)) {
      return entry;
    }
  }
  // Coincidencia parcial conservadora: el término consultado contiene/está contenido en un alias.
  for (const entry of ENTRIES) {
    if (entry.alias.some((alias) => { const a = normalize(alias); return a.includes(q) || q.includes(a); })) {
      return entry;
    }
  }
  return null;
}
