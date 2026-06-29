import { requireSession } from "@/core/auth/session";
import { getAgendaData } from "@/core/agenda/agenda-data";
import {
  bucketDay,
  bucketMonth,
  bucketWeek,
  computeRange,
  deriveStats,
  formatCivilDate,
  stepAnchor,
  toAgendaAppointments,
  todayCivil,
  AGENDA_MODES,
  type AgendaMode,
  type CivilDate,
} from "@/core/agenda/calendar-range";
import { AgendaView, type AgendaStatCard } from "@/components/agenda/AgendaView";

// Ruta dedicada de la AGENDA en formato calendario (MP-CTRL-0135). Server component: parsea el modo y
// el ancla de los searchParams, hace UNA lectura del contrato (getAgendaData) y delega TODO el cálculo
// determinista al módulo puro (reparto en celdas + contadores sobre el MISMO conjunto). La vista
// (AgendaView) sólo pinta y enruta clics. Sólo lectura; las escrituras pasan por superficies
// gobernadas (alta de cita con RBAC; transiciones de estado en la tabla de citas con P1).

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const NEW_APPOINTMENT_HREF = "/resources/appointments/new";

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseMode(raw: string | undefined): AgendaMode {
  return AGENDA_MODES.includes(raw as AgendaMode) ? (raw as AgendaMode) : "day";
}

function agendaHref(mode: AgendaMode, anchor: CivilDate): string {
  return `/agenda?mode=${mode}&anchor=${formatCivilDate(anchor)}`;
}

/** Date UTC a mediodía que representa la fecha civil (para etiquetas locale-aware sin desfase). */
function noonUtc(date: CivilDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
}

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function headerLabel(mode: AgendaMode, anchor: CivilDate): string {
  if (mode === "day") {
    return capitalize(
      new Intl.DateTimeFormat("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(noonUtc(anchor)),
    );
  }
  if (mode === "week") {
    const range = computeRange("week", anchor);
    const dm = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" });
    return `${dm.format(noonUtc(range.start))} – ${dm.format(noonUtc(range.end))} ${range.end.year}`;
  }
  return capitalize(
    new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      noonUtc(anchor),
    ),
  );
}

export default async function AgendaPage({ searchParams }: PageProps) {
  await requireSession();
  const params = await searchParams;
  const mode = parseMode(single(params.mode));

  const data = await getAgendaData(mode, single(params.anchor));
  const appointments = toAgendaAppointments(data.rows, data.labels, data.timeZone);
  const stats = deriveStats(appointments);

  const statCards: AgendaStatCard[] = [
    { label: "Total", value: stats.total, tone: "accent" },
    { label: "Confirmadas", value: stats.confirmed, tone: "ok" },
    { label: "Pendientes", value: stats.pending, tone: "info" },
    { label: "Canceladas", value: stats.cancelled, tone: "danger" },
  ];

  const modeHrefs = {
    day: agendaHref("day", data.anchor),
    week: agendaHref("week", data.anchor),
    month: agendaHref("month", data.anchor),
  };

  return (
    <AgendaView
      mode={mode}
      headerLabel={headerLabel(mode, data.anchor)}
      weekdayLabels={WEEKDAY_LABELS}
      timeZone={data.timeZone}
      stats={statCards}
      prevHref={agendaHref(mode, stepAnchor(mode, data.anchor, -1))}
      nextHref={agendaHref(mode, stepAnchor(mode, data.anchor, 1))}
      todayHref={agendaHref(mode, todayCivil(data.timeZone))}
      modeHrefs={modeHrefs}
      newHref={NEW_APPOINTMENT_HREF}
      canCreate={data.canCreate}
      unavailable={data.unavailable}
      day={mode === "day" ? bucketDay(appointments, data.anchor) : []}
      week={mode === "week" ? bucketWeek(appointments, data.anchor, data.timeZone) : []}
      month={mode === "month" ? bucketMonth(appointments, data.anchor, data.timeZone) : []}
    />
  );
}
