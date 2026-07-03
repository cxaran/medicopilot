import type { PatientSummaryRead } from "@/core/api/contracts";
import type { WireMessage } from "@/core/agent/protocol";

/**
 * Formatea el RESUMEN DEL PACIENTE (proyección compacta del expediente, `GET /patients/{id}/summary`)
 * como un bloque de texto de CONTEXTO para el copiloto. Módulo PURO (sin red ni React): se refresca
 * localmente al armar el turno reusando el resumen ya obtenido, sin recargar el historial.
 *
 * Decisiones de token/PHI (el backend ya filtró; aquí sólo se renderiza lo presente):
 *  - Se omiten las secciones y campos vacíos (no se gasta el token de su etiqueta).
 *  - Sólo se muestra el identificador del paciente; ningún UUID anidado (para actuar sobre un
 *    registro el agente usa las herramientas, que traen el id y validan permiso/vigencia).
 *  - El bloque es DATO DE REFERENCIA (no instrucción): así lo declara su encabezado, en línea con la
 *    capa de seguridad. El detalle completo vive en el expediente y se obtiene con las tools.
 */

const HEADER =
  "RESUMEN DEL PACIENTE (datos del expediente, sólo REFERENCIA; para el detalle completo o para " +
  "actuar sobre un registro usa las herramientas, que traen los identificadores y validan permisos)";

/** Fecha ISO -> YYYY-MM-DD (sin hora). Devuelve la cadena original si no parsea. */
function ymd(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const idx = iso.indexOf("T");
  return idx > 0 ? iso.slice(0, idx) : iso;
}

/** Hora HH:MM a partir de "HH:MM:SS". */
function hm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}

/** Une partes no vacías con el separador dado. */
function join(parts: (string | null | undefined)[], sep: string): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(sep);
}

type Summary = PatientSummaryRead;

function generalLine(g: Summary["datos_generales"]): string {
  return join(
    [
      g.nombre,
      g.edad != null ? `${g.edad} años` : null,
      g.sexo,
      g.ocupacion,
      g.embarazo ? `embarazo: ${g.embarazo}` : null,
    ],
    " · ",
  );
}

function vitalsLine(v: NonNullable<Summary["signos_vitales"]>): string {
  const ta =
    v.presion_sistolica != null || v.presion_diastolica != null
      ? `TA ${v.presion_sistolica ?? "?"}/${v.presion_diastolica ?? "?"}`
      : null;
  const measures = join(
    [
      v.peso_kg != null ? `peso ${v.peso_kg} kg` : null,
      v.talla_cm != null ? `talla ${v.talla_cm} cm` : null,
      v.temperatura_c != null ? `temp ${v.temperatura_c}°C` : null,
      ta,
      v.frecuencia_cardiaca != null ? `FC ${v.frecuencia_cardiaca}` : null,
      v.frecuencia_respiratoria != null ? `FR ${v.frecuencia_respiratoria}` : null,
      v.saturacion_o2 != null ? `SatO2 ${v.saturacion_o2}%` : null,
      v.glucosa_capilar != null ? `glucosa ${v.glucosa_capilar}` : null,
      v.dolor != null ? `dolor ${v.dolor}/10` : null,
    ],
    ", ",
  );
  const date = ymd(v.fecha);
  return date ? `Signos vitales (${date}): ${measures}` : `Signos vitales: ${measures}`;
}

/** Agrega una sección de lista (encabezado + viñetas) sólo si hay elementos. */
function section(lines: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }
  lines.push("", `${title}:`);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

/**
 * Construye el mensaje de cable (rol system) con el resumen del paciente, o ``null`` si no hay
 * resumen. Todo lo vacío se omite; el bloque queda tan compacto como los datos presentes.
 */
export function buildPatientSummaryMessage(summary: Summary | null | undefined): WireMessage | null {
  if (!summary) {
    return null;
  }
  const lines: string[] = [HEADER, `Paciente: ${generalLine(summary.datos_generales)}`];

  section(
    lines,
    "Datos clínicos relevantes",
    (summary.resumen_clinico ?? []).map((c) =>
      join([`[${c.tipo}] ${c.titulo}`, c.detalle, c.severidad ? `(${c.severidad})` : null], " — "),
    ),
  );

  section(
    lines,
    "Antecedentes",
    (summary.antecedentes ?? []).map((a) =>
      join(
        [`${a.categoria}: ${a.descripcion}`, a.parentesco ? `(${a.parentesco})` : null, a.notas],
        " ",
      ),
    ),
  );

  const hc = summary.historia_clinica;
  if (hc) {
    const hcItems = join(
      [
        hc.antecedentes_familiares ? `Familiares: ${hc.antecedentes_familiares}` : null,
        hc.antecedentes_patologicos ? `Patológicos: ${hc.antecedentes_patologicos}` : null,
        hc.antecedentes_no_patologicos ? `No patológicos: ${hc.antecedentes_no_patologicos}` : null,
        hc.cirugias_previas ? `Cirugías: ${hc.cirugias_previas}` : null,
        hc.hospitalizaciones ? `Hospitalizaciones: ${hc.hospitalizaciones}` : null,
        hc.habitos ? `Hábitos: ${hc.habitos}` : null,
        hc.gineco_obstetricos ? `Gineco-obstétricos: ${hc.gineco_obstetricos}` : null,
        hc.observaciones ? `Observaciones: ${hc.observaciones}` : null,
      ],
      " | ",
    );
    if (hcItems) {
      lines.push("", `Historia clínica: ${hcItems}`);
    }
  }

  section(
    lines,
    "Consultas recientes",
    (summary.consultas ?? []).map((c) => {
      const dx = (c.diagnosticos ?? [])
        .map((d) => join([d.texto, d.codigo ? `(${d.codigo})` : null], " "))
        .join("; ");
      return join(
        [
          `${ymd(c.fecha)} (${c.estado}) ${c.motivo}`,
          c.evaluacion ? `→ ${c.evaluacion}` : null,
          dx ? `[dx: ${dx}]` : null,
        ],
        " ",
      );
    }),
  );

  section(
    lines,
    "Notas",
    (summary.notas ?? []).map((n) =>
      join(
        [`${n.tipo} (${n.estado})`, n.evaluacion, n.plan ? `Plan: ${n.plan}` : null],
        " · ",
      ),
    ),
  );

  if (summary.signos_vitales) {
    lines.push("", vitalsLine(summary.signos_vitales));
  }

  section(
    lines,
    "Recetas",
    (summary.recetas ?? []).map((rx) => {
      const meds = (rx.medicamentos ?? [])
        .map((m) => join([m.medicamento, m.dosis, m.frecuencia, m.duracion], " "))
        .join("; ");
      const date = ymd(rx.fecha);
      return join([`${rx.estado}${date ? ` (${date})` : ""}`, meds], ": ");
    }),
  );

  section(
    lines,
    "Laboratorio",
    (summary.laboratorios ?? []).map((l) =>
      join(
        [
          `${l.analito} ${join([l.valor, l.unidad], " ")}`.trim(),
          l.marca && l.marca !== "normal" ? `[${l.marca}]` : null,
          `(${ymd(l.fecha)})`,
        ],
        " ",
      ),
    ),
  );

  section(
    lines,
    "Estudios",
    (summary.estudios ?? []).map((e) => `${e.estudio} (${e.estado}, ${ymd(e.fecha)})`),
  );

  section(
    lines,
    "Seguimiento",
    (summary.seguimiento ?? []).map((t) =>
      join([t.titulo, `(${t.prioridad}${t.vence ? `, vence ${ymd(t.vence)}` : ""})`], " "),
    ),
  );

  section(
    lines,
    "Archivos",
    (summary.archivos ?? []).map((f) =>
      join([f.nombre, `(${f.tipo}${f.fecha ? `, ${f.fecha}` : ""})`], " "),
    ),
  );

  section(
    lines,
    "Citas próximas",
    (summary.citas ?? []).map((a) =>
      join([`${a.fecha}${a.hora ? ` ${hm(a.hora)}` : ""}`, a.motivo, `(${a.estado})`], " "),
    ),
  );

  return { role: "system", content: [{ type: "text", text: lines.join("\n") }] };
}
