"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import { ResourceRowActions } from "@/components/resources/ResourceRowActions";
import type { ResourceActionCapability } from "@/core/api/contracts";
import {
  applicableAppointmentActions,
  avatarColor,
  type AgendaAppointment,
  type AgendaCell,
  type AgendaMode,
  type AgendaStatusTone,
} from "@/core/agenda/calendar-range";

/**
 * Agenda en formato CALENDARIO (MP-CTRL-0135): vista presentacional con alternador [Día · Semana ·
 * Mes]. Fiel a la ruta ``agenda`` del diseño para el modo día (cabecera de fecha + ‹ › + 4 tarjetas
 * de estadística + lista cronológica). Semana = 7 columnas lun-dom; Mes = rejilla de semanas. Es una
 * vista de SÓLO LECTURA: tocar una cita abre el chat de su paciente (mismo nav chat-first del
 * dashboard); "Nueva cita" abre el alta gobernada (RBAC) y las transiciones de estado siguen en la
 * tabla de citas (mecanismo de acciones existente con sus diálogos/P1). El reparto en celdas y los
 * contadores los calcula el módulo puro en el servidor; aquí sólo se pinta con los tokens del diseño.
 */

export interface AgendaStatCard {
  label: string;
  value: number;
  tone: AgendaStatusTone | "accent";
}

export interface AgendaViewProps {
  mode: AgendaMode;
  headerLabel: string;
  weekdayLabels: readonly string[];
  timeZone: string;
  stats: readonly AgendaStatCard[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  modeHrefs: Readonly<Record<AgendaMode, string>>;
  newHref: string;
  canCreate: boolean;
  /** Acciones de transición del contrato (ya proyectadas por permiso); se montan en la tarjeta del día. */
  actions: readonly ResourceActionCapability[];
  actionPlaceholder: string;
  unavailable: boolean;
  day: readonly AgendaAppointment[];
  week: readonly AgendaCell[];
  month: readonly (readonly AgendaCell[])[];
}

const TONE_TEXT: Record<AgendaStatCard["tone"], string> = {
  accent: "var(--accent-tx)",
  info: "var(--info)",
  ok: "var(--ok)",
  default: "var(--tx)",
  danger: "var(--danger)",
  warn: "var(--warn)",
};

function StatusPill({ label, tone }: Readonly<{ label: string; tone: AgendaStatusTone }>) {
  const color = TONE_TEXT[tone];
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-[8px] px-2.5 py-1 text-center text-[11.5px] font-semibold"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {label}
    </span>
  );
}

const MODE_LABEL: Record<AgendaMode, string> = { day: "Día", week: "Semana", month: "Mes" };

function ArrowIcon({ dir }: Readonly<{ dir: "prev" | "next" }>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

const navBtn =
  "flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:bg-[var(--panel2)]";

export function AgendaView(props: Readonly<AgendaViewProps>) {
  const router = useRouter();
  const { setActiveContext } = useChatNav();

  // Tocar una cita abre el chat de su paciente (chat-first); sin paciente, no navega.
  const openPatient = (item: AgendaAppointment): void => {
    if (!item.patientId) {
      return;
    }
    setActiveContext({
      patientId: item.patientId,
      patientLabel: item.patientLabel,
      consultationId: null,
      consultationLabel: null,
    });
    router.push("/");
  };

  return (
    <div className="mx-auto w-full max-w-[1040px]">
      {/* Cabecera: fecha + navegación + alternador + nueva cita. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--tx)]">
            {props.headerLabel}
          </h1>
          <div className="flex gap-1">
            <Link href={props.prevHref} aria-label="Anterior" className={navBtn}>
              <ArrowIcon dir="prev" />
            </Link>
            <Link href={props.nextHref} aria-label="Siguiente" className={navBtn}>
              <ArrowIcon dir="next" />
            </Link>
          </div>
          <Link
            href={props.todayHref}
            className="rounded-[9px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--tx2)] transition hover:bg-[var(--panel2)]"
          >
            Hoy
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {/* Alternador de rango. */}
          <div className="flex rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-0.5">
            {(["day", "week", "month"] as const).map((m) => {
              const active = props.mode === m;
              return (
                <Link
                  key={m}
                  href={props.modeHrefs[m]}
                  aria-current={active ? "true" : undefined}
                  className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition ${
                    active
                      ? "bg-[var(--accent-dim)] text-[var(--accent-tx)]"
                      : "text-[var(--tx2)] hover:text-[var(--tx)]"
                  }`}
                >
                  {MODE_LABEL[m]}
                </Link>
              );
            })}
          </div>
          {props.canCreate ? (
            <Link
              href={props.newHref}
              className="flex items-center gap-2 rounded-[11px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--accent-tx)] transition hover:brightness-105"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva cita
            </Link>
          ) : null}
        </div>
      </div>

      {/* Tarjetas de estadística (del MISMO conjunto de resultados). */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {props.stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3.5"
          >
            <div
              className="text-[26px] font-bold tracking-tight tabular-nums"
              style={{ color: TONE_TEXT[stat.tone] }}
            >
              {stat.value}
            </div>
            <div className="mt-0.5 text-[12.5px] text-[var(--tx2)]">{stat.label}</div>
          </div>
        ))}
      </div>

      {props.unavailable ? (
        <p className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-4 py-8 text-center text-[13px] text-[var(--tx3)]">
          No tienes acceso a la agenda de citas.
        </p>
      ) : props.mode === "day" ? (
        <DayList
          items={props.day}
          onOpen={openPatient}
          actions={props.actions}
          actionPlaceholder={props.actionPlaceholder}
        />
      ) : props.mode === "week" ? (
        <WeekGrid cells={props.week} weekdayLabels={props.weekdayLabels} timeZone={props.timeZone} onOpen={openPatient} />
      ) : (
        <MonthGrid weeks={props.month} weekdayLabels={props.weekdayLabels} onOpen={openPatient} />
      )}
    </div>
  );
}

function DayList({
  items,
  onOpen,
  actions,
  actionPlaceholder,
}: Readonly<{
  items: readonly AgendaAppointment[];
  onOpen: (item: AgendaAppointment) => void;
  actions: readonly ResourceActionCapability[];
  actionPlaceholder: string;
}>) {
  if (items.length === 0) {
    return (
      <p className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-4 py-8 text-center text-[13px] text-[var(--tx3)]">
        Sin citas para esta fecha.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        // Acciones de transición aplicables al estado de ESTA cita (del contrato; el RBAC ya lo aplicó
        // el backend al proyectarlas). Vacío -> la tarjeta queda navegacional.
        const rowActions = applicableAppointmentActions(actions, item.statusKey);
        return (
          <div
            key={item.id}
            className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3.5"
          >
            {/* Zona clicable: abre el chat del paciente (botón propio, no anida acciones). */}
            <button
              type="button"
              onClick={() => onOpen(item)}
              disabled={!item.patientId}
              title={item.patientId ? `Abrir el chat de ${item.patientLabel}` : undefined}
              className={`flex min-w-0 flex-1 items-center gap-4 text-left transition ${
                item.patientId ? "cursor-pointer hover:opacity-80" : "cursor-default"
              }`}
            >
              <div className="w-[52px] shrink-0 text-center">
                <div className="text-[15px] font-semibold tabular-nums text-[var(--tx)]">
                  {item.timeHM ?? "--:--"}
                </div>
                {item.durationMinutes !== null ? (
                  <div className="text-[11px] text-[var(--tx3)]">{item.durationMinutes} min</div>
                ) : null}
              </div>
              <div className="h-9 w-px shrink-0 self-stretch bg-[var(--border)]" />
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold text-white"
                style={{ backgroundColor: avatarColor(item.patientId ?? item.patientLabel) }}
              >
                {item.initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-[var(--tx)]">
                  {item.patientLabel}
                </div>
                {item.reason ? (
                  <div className="truncate text-[12.5px] text-[var(--tx2)]">{item.reason}</div>
                ) : null}
              </div>
            </button>
            <div className="flex items-center gap-3">
              <StatusPill label={item.statusLabel} tone={item.statusTone} />
              {rowActions.length > 0 ? (
                <ResourceRowActions
                  placeholder={actionPlaceholder}
                  id={item.id}
                  actions={rowActions}
                  item={{ id: item.id, status: item.statusKey }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayCellChip({
  item,
  timeZone,
  onOpen,
}: Readonly<{
  item: AgendaAppointment;
  timeZone?: string;
  onOpen: (item: AgendaAppointment) => void;
}>) {
  const color = TONE_TEXT[item.statusTone];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      disabled={!item.patientId}
      title={`${item.patientLabel}${item.reason ? ` · ${item.reason}` : ""}`}
      className={`flex w-full items-center gap-1.5 rounded-[7px] px-1.5 py-1 text-left text-[11px] transition ${
        item.patientId ? "cursor-pointer hover:bg-[var(--panel2)]" : "cursor-default"
      }`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {timeZone && item.timeHM ? (
        <span className="shrink-0 tabular-nums text-[var(--tx3)]">{item.timeHM}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--tx)]">{item.patientLabel}</span>
    </button>
  );
}

function WeekGrid({
  cells,
  weekdayLabels,
  timeZone,
  onOpen,
}: Readonly<{
  cells: readonly AgendaCell[];
  weekdayLabels: readonly string[];
  timeZone: string;
  onOpen: (item: AgendaAppointment) => void;
}>) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-7">
      {cells.map((cell, index) => (
        <div
          key={cell.dateIso}
          className="flex min-h-[140px] flex-col rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-2"
        >
          <div
            className={`mb-1.5 flex items-baseline justify-between gap-1 px-0.5 ${
              cell.isToday ? "text-[var(--accent-tx)]" : "text-[var(--tx2)]"
            }`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              {weekdayLabels[index] ?? ""}
            </span>
            <span
              className={`text-[13px] font-bold tabular-nums ${
                cell.isToday ? "rounded-[6px] bg-[var(--accent-dim)] px-1.5" : ""
              }`}
            >
              {cell.date.day}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {cell.items.length === 0 ? (
              <span className="px-1.5 py-1 text-[11px] text-[var(--tx3)]">—</span>
            ) : (
              cell.items.map((item) => (
                <DayCellChip key={item.id} item={item} timeZone={timeZone} onOpen={onOpen} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const MONTH_CELL_LIMIT = 3;

function MonthGrid({
  weeks,
  weekdayLabels,
  onOpen,
}: Readonly<{
  weeks: readonly (readonly AgendaCell[])[];
  weekdayLabels: readonly string[];
  onOpen: (item: AgendaAppointment) => void;
}>) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--panel)]">
      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--panel2)]">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--tx3)]"
          >
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((cell) => (
            <div
              key={cell.dateIso}
              className={`flex min-h-[104px] flex-col gap-1 border-b border-r border-[var(--border)] p-1.5 ${
                cell.inMonth ? "" : "bg-[var(--panel2)] opacity-60"
              }`}
            >
              <div className="flex justify-end px-0.5">
                <span
                  className={`text-[12px] font-semibold tabular-nums ${
                    cell.isToday
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]"
                      : "text-[var(--tx2)]"
                  }`}
                >
                  {cell.date.day}
                </span>
              </div>
              {cell.items.slice(0, MONTH_CELL_LIMIT).map((item) => (
                <DayCellChip key={item.id} item={item} onOpen={onOpen} />
              ))}
              {cell.items.length > MONTH_CELL_LIMIT ? (
                <span className="px-1.5 text-[10.5px] font-medium text-[var(--tx3)]">
                  +{cell.items.length - MONTH_CELL_LIMIT} más
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
