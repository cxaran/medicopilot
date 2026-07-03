"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";

import { ResourcePagination } from "@/components/resources/ResourcePagination";
import { useFocusTrap } from "@/components/resources/use-focus-trap";
import { AnimatedOrb } from "@/components/ui/AnimatedOrb";
import { useSession } from "@/core/auth/SessionProvider";
import type {
  DashboardCard,
  DashboardData,
  DashboardItem,
  DashboardTone,
} from "@/core/chat-shell/dashboard";

// Límite de renglones VISIBLES por tarjeta (las alertas pueden ser decenas y la card
// crecería sin tope); el resto se consulta con "Ver más" en un diálogo paginado.
const CARD_PREVIEW_LIMIT = 5;
// Renglones por página dentro del diálogo (paginación en memoria sobre lo ya cargado).
const DIALOG_PAGE_SIZE = 10;

const svgProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CalendarIcon() {
  return (
    <svg {...svgProps} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg {...svgProps} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg {...svgProps} aria-hidden="true">
      <path d="M12 3l9.5 16.5H2.5z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...svgProps} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg {...svgProps} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

/**
 * Saludo según la hora local (se evalúa al montar; chat-first del inicio). Sin nombre cae a un
 * saludo genérico; con nombre lo personaliza. No expone datos clínicos.
 */
/** Saludo NEUTRO (sin hora) para el render del servidor: determinista, igual en SSR y en la primera
 *  hidratación del cliente (evita el desajuste por diferencia de zona horaria server/cliente). */
function neutralGreeting(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hola, ${trimmed}` : "Hola";
}

/** Saludo por hora LOCAL, aplicado solo en el cliente tras hidratar. */
function hourGreeting(hour: number, name: string | null): string {
  const part = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const trimmed = name?.trim();
  return trimmed ? `${part}, ${trimmed}` : part;
}

// ``true`` solo tras hidratar en el cliente; ``false`` en SSR y en la primera hidratación. Permite
// renderizar contenido dependiente del cliente (hora local) sin desajuste de hidratación y sin
// setState dentro de un efecto. No se suscribe a nada (snapshot estable).
const noopSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// Accesos rápidos del inicio: navegación a flujos clave, filtrada por permiso (RBAC desde la
// sesión). No escribe; sólo enlaza a rutas existentes. Se ocultan los que el rol no permite.
type QuickAction = { label: string; href: string; permission: string; icon: ReactNode };
const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: "Nuevo paciente", href: "/resources/patients/new", permission: "patients:create", icon: <PlusIcon /> },
  { label: "Nueva cita", href: "/resources/appointments/new", permission: "appointments:create", icon: <PlusIcon /> },
  { label: "Ver agenda", href: "/agenda", permission: "appointments:read", icon: <CalendarIcon /> },
  { label: "Buscar paciente", href: "/resources/patients", permission: "patients:read", icon: <SearchIcon /> },
];

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

/**
 * Diálogo "Ver más" de una tarjeta: la lista COMPLETA ya cargada, paginada en memoria
 * (DIALOG_PAGE_SIZE por página). Accesible: focus trap, Escape y clic en el fondo
 * cierran. Abrir el chat de un paciente desde un renglón también cierra el diálogo.
 */
function CardItemsDialog({
  title,
  items,
  layout,
  onOpenPatient,
  onClose,
}: Readonly<{
  title: string;
  items: DashboardItem[];
  layout: ItemLayout;
  onOpenPatient: (patientId: string, patientLabel: string) => void;
  onClose: () => void;
}>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useFocusTrap(panelRef);

  const pageItems = items.slice(offset, offset + DIALOG_PAGE_SIZE);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,17,16,0.4)] p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className="flex max-h-[80vh] w-full max-w-[480px] flex-col rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--soft2)]"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[14px] font-semibold text-[var(--tx)]">
            {title}
            <span className="ml-2 text-[12px] font-medium text-[var(--tx3)]">{items.length}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--tx3)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
          >
            <svg {...svgProps} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {pageItems.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              layout={layout}
              onOpenPatient={(patientId, patientLabel) => {
                onClose();
                onOpenPatient(patientId, patientLabel);
              }}
            />
          ))}
        </div>
        <div className="mt-3">
          <ResourcePagination
            variant="compact"
            pagination={{
              total: items.length,
              limit: DIALOG_PAGE_SIZE,
              offset,
              has_next: offset + DIALOG_PAGE_SIZE < items.length,
            }}
            onPrev={() => setOffset(Math.max(0, offset - DIALOG_PAGE_SIZE))}
            onNext={() => setOffset(offset + DIALOG_PAGE_SIZE)}
          />
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  iconColor,
  card,
  emptyText,
  layout,
  countTone,
  onOpenPatient,
  footer,
}: Readonly<{
  title: string;
  icon: ReactNode;
  iconColor: string;
  card: DashboardCard;
  emptyText: string;
  layout: ItemLayout;
  countTone: DashboardTone;
  onOpenPatient: (patientId: string, patientLabel: string) => void;
  footer?: ReactNode;
}>) {
  const [expanded, setExpanded] = useState(false);
  // La tarjeta muestra a lo más CARD_PREVIEW_LIMIT renglones; el resto vive en el diálogo.
  const previewItems = card.items.slice(0, CARD_PREVIEW_LIMIT);
  const hiddenCount = card.items.length - previewItems.length;

  return (
    <section className="flex flex-col rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--soft)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--tx)]">
          <span className="flex shrink-0 items-center" style={{ color: iconColor }} aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
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
          {previewItems.map((item) => (
            <ItemRow key={item.key} item={item} layout={layout} onOpenPatient={onOpenPatient} />
          ))}
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 rounded-[9px] border border-dashed border-[var(--border)] px-3 py-1.5 text-center text-[12.5px] font-medium text-[var(--accent-tx)] transition hover:bg-[var(--panel2)]"
        >
          Ver más ({hiddenCount})
        </button>
      )}
      {footer}
      {expanded && (
        <CardItemsDialog
          title={title}
          items={card.items}
          layout={layout}
          onOpenPatient={onOpenPatient}
          onClose={() => setExpanded(false)}
        />
      )}
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
  const { session, hasPermission } = useSession();
  // SSR y primera hidratación: saludo NEUTRO (determinista, igual server/cliente). Tras hidratar, el
  // cliente aplica el saludo por hora LOCAL. Así el HTML del servidor coincide con el del cliente y no
  // hay error de hidratación por la diferencia de zona horaria.
  const hydrated = useHydrated();
  const greeting = hydrated
    ? hourGreeting(new Date().getHours(), session.name)
    : neutralGreeting(session.name);
  const quickActions = QUICK_ACTIONS.filter((action) => hasPermission(action.permission));

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col items-center gap-4">
      {/* Hero del inicio (fiel a MediCopilot.dc.html): orbe animado + saludo grande centrado. */}
      <div className="orb-intro-soft mt-2">
        <AnimatedOrb size={72} />
      </div>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-blur-intro text-[30px] font-medium tracking-tight text-[var(--tx)]">
          {greeting}
        </h1>
        <p className="text-blur-intro-delay mt-2 max-w-[520px] text-[15px] leading-relaxed text-[var(--tx2)]">
          Su copiloto clínico con IA. Toca un paciente para abrir su chat y revisar su expediente; el
          agente global está disponible abajo.
        </p>
      </div>
      {quickActions.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-2.5">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-2 rounded-[14px] bg-[var(--panel)] px-4 py-2.5 text-[13.5px] font-medium text-[var(--tx)] shadow-[var(--soft)] transition hover:-translate-y-px"
            >
              <span className="flex shrink-0 items-center text-[var(--accent-tx)]" aria-hidden="true">
                {action.icon}
              </span>
              {action.label}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4 grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          title="Agenda de hoy"
          icon={<CalendarIcon />}
          iconColor="var(--accent)"
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
          icon={<DocIcon />}
          iconColor="var(--accent)"
          card={data.consultations}
          emptyText="Sin consultas recientes."
          layout="meta-right"
          countTone="default"
          onOpenPatient={onOpenPatient}
        />
        <Card
          title="Alertas clínicas"
          icon={<AlertIcon />}
          iconColor="var(--warn)"
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
