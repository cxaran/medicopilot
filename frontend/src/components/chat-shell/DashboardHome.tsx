"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import type {
  DashboardCard,
  DashboardData,
  DashboardItem,
  DashboardTone,
} from "@/core/chat-shell/dashboard";

/**
 * Dashboard del INICIO (agente global) — MP-CTRL-0124, rebanada 4 del rediseño. Superficie de
 * aterrizaje del agente global con 3 tarjetas de resumen SÓLO LECTURA: Agenda de hoy, Consultas
 * recientes y Alertas clínicas. Los datos vienen del CONTRATO (las lecturas las compone el server
 * component vía dashboard-data); aquí sólo se renderiza re-skineado con los tokens del diseño.
 *
 * Interacción CHAT-FIRST: cada renglón con paciente enlaza a SU chat (``onOpenPatient`` fija el
 * activeContext del CopilotPanel = ese paciente). El dashboard NO escribe: cualquier acción ocurre
 * dentro del chat del paciente con su aprobación (P1). El chat global sigue accesible debajo.
 */

const TONE_DOT: Record<DashboardTone, string> = {
  default: "var(--tx3)",
  info: "var(--info)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

const TONE_TEXT: Record<DashboardTone, string> = {
  default: "var(--tx2)",
  info: "var(--info)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

function Badge({ label, tone }: Readonly<{ label: string; tone: DashboardTone }>) {
  return (
    <span
      className="shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-semibold"
      style={{
        color: TONE_TEXT[tone],
        backgroundColor: `color-mix(in srgb, ${TONE_TEXT[tone]} 13%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

type ItemLayout = "time-left" | "meta-right" | "dot";

function ItemRow({
  item,
  layout,
  onOpenPatient,
}: Readonly<{
  item: DashboardItem;
  layout: ItemLayout;
  onOpenPatient: (patientId: string, patientLabel: string) => void;
}>) {
  const clickable = item.patientId !== null;
  const handleClick = (): void => {
    if (item.patientId) {
      onOpenPatient(item.patientId, item.patientLabel);
    }
  };
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={handleClick}
      title={clickable ? `Abrir el chat de ${item.patientLabel}` : undefined}
      className={`flex w-full items-start gap-2.5 border-t border-[var(--border)] px-1 py-2.5 text-left transition first:border-t-0 ${
        clickable ? "cursor-pointer hover:bg-[var(--panel2)]" : "cursor-default"
      }`}
    >
      {layout === "dot" && item.badge && (
        <span
          aria-hidden="true"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: TONE_DOT[item.badge.tone] }}
        />
      )}
      {layout === "time-left" && item.meta && (
        <span className="w-[42px] shrink-0 pt-0.5 text-[12px] tabular-nums text-[var(--tx3)]">
          {item.meta}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-[var(--tx)]">
          {item.primary}
        </span>
        {item.secondary && (
          <span className="block truncate text-[11.5px] text-[var(--tx3)]">{item.secondary}</span>
        )}
      </span>
      {layout === "time-left" && item.badge && <Badge label={item.badge.label} tone={item.badge.tone} />}
      {layout === "meta-right" && item.meta && (
        <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11.5px] text-[var(--tx3)]">
          {item.meta}
        </span>
      )}
    </button>
  );
}

function Card({
  title,
  card,
  emptyText,
  layout,
  countTone,
  onOpenPatient,
  footer,
}: Readonly<{
  title: string;
  card: DashboardCard;
  emptyText: string;
  layout: ItemLayout;
  countTone: DashboardTone;
  onOpenPatient: (patientId: string, patientLabel: string) => void;
  footer?: ReactNode;
}>) {
  return (
    <section className="flex flex-col rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--soft)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-[var(--tx)]">{title}</span>
        {card.count > 0 && (
          <span
            className="rounded-[7px] px-2 py-0.5 text-[12px] font-bold"
            style={{
              color: TONE_TEXT[countTone],
              backgroundColor: `color-mix(in srgb, ${TONE_TEXT[countTone]} 14%, transparent)`,
            }}
          >
            {card.count}
          </span>
        )}
      </div>
      {card.items.length === 0 ? (
        <p className="py-2 text-[12.5px] text-[var(--tx3)]">{emptyText}</p>
      ) : (
        <div className="flex flex-col">
          {card.items.map((item) => (
            <ItemRow key={item.key} item={item} layout={layout} onOpenPatient={onOpenPatient} />
          ))}
        </div>
      )}
      {footer}
    </section>
  );
}

export function DashboardHome({
  data,
  onOpenPatient,
}: Readonly<{
  data: DashboardData;
  onOpenPatient: (patientId: string, patientLabel: string) => void;
}>) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--tx)]">Inicio</h1>
        <p className="mt-0.5 text-[13px] text-[var(--tx2)]">
          Resumen del día. Toca un paciente para abrir su chat; el agente global está disponible
          abajo.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          title="Agenda de hoy"
          card={data.agenda}
          emptyText="Sin citas para hoy."
          layout="time-left"
          countTone="info"
          onOpenPatient={onOpenPatient}
          footer={
            <Link
              href="/agenda"
              className="mt-3 block rounded-[9px] border border-[var(--border)] px-3 py-2 text-center text-[12.5px] font-medium text-[var(--accent-tx)] transition hover:bg-[var(--panel2)]"
            >
              Ver agenda completa
            </Link>
          }
        />
        <Card
          title="Consultas recientes"
          card={data.consultations}
          emptyText="Sin consultas recientes."
          layout="meta-right"
          countTone="default"
          onOpenPatient={onOpenPatient}
        />
        <Card
          title="Alertas clínicas"
          card={data.alerts}
          emptyText="Sin alertas pendientes."
          layout="dot"
          countTone="warn"
          onOpenPatient={onOpenPatient}
        />
      </div>
    </div>
  );
}
