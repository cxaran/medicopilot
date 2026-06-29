"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ActiveContextPicker } from "@/components/copilot/ActiveContextPicker";
import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import type { ActiveClinicalContext } from "@/core/agent/active-context";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";
import type { SessionUser } from "@/core/auth/types";

// Iconos SVG inline (sin dependencias). Heredan el color del item via currentColor.
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PatientsIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
    </svg>
  );
}

function ConsultIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M6 3v6a4 4 0 0 0 8 0V3" />
      <path d="M10 17a5 5 0 0 0 9 0v-2" />
      <circle cx="19" cy="13" r="2" />
    </svg>
  );
}

function AgendaIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function PrescriptionIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M6 20V5a1 1 0 0 1 1-1h5a3.5 3.5 0 0 1 0 7H6" />
      <path d="M11 11l5 9" />
    </svg>
  );
}

function CopilotIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M12 3v3M5 8h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <path d="M9 13h.01M15 13h.01M9.5 16.5h5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.2 2.7-4.8 6-4.8s6 1.6 6 4.8" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M21 20c0-2.4-1-3.8-2.5-4.6" />
    </svg>
  );
}

function RolesIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

type NavItem = {
  label: string;
  href: string;
  resource?: string;
  icon: ReactNode;
};

// Navegación PRINCIPAL por ruta (clínica). Mapea a las RUTAS EXISTENTES; los items de recurso sólo
// aparecen si el recurso está en el catálogo del usuario (evita enlaces muertos). "Inicio" no está
// aquí: el inicio chat-first es el botón "Agente global".
const MAIN_NAV: NavItem[] = [
  { label: "Pacientes", href: "/resources/patients", resource: "patients", icon: <PatientsIcon /> },
  {
    label: "Consultas",
    href: "/resources/consultations",
    resource: "consultations",
    icon: <ConsultIcon />,
  },
  {
    label: "Agenda",
    href: "/agenda",
    resource: "appointments",
    icon: <AgendaIcon />,
  },
  {
    label: "Recetas",
    href: "/resources/prescriptions",
    resource: "prescriptions",
    icon: <PrescriptionIcon />,
  },
  { label: "Copiloto", href: "/copilot", icon: <CopilotIcon /> },
];

// Navegación de ADMINISTRACIÓN (pie de la barra), también filtrada por catálogo.
const ADMIN_NAV: NavItem[] = [
  { label: "Usuarios", href: "/resources/users", resource: "users", icon: <UsersIcon /> },
  { label: "Roles y permisos", href: "/resources/roles", resource: "roles", icon: <RolesIcon /> },
];

function navItemClass(active: boolean): string {
  return `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition ${
    active
      ? "bg-[var(--accent-dim)] font-semibold text-[var(--accent-tx)]"
      : "font-medium text-[var(--tx2)] hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
  }`;
}

/**
 * Barra lateral UNIFICADA (MP-CTRL-0128, rebanada 8 del rediseño): una sola columna a sangre que
 * fusiona la navegación heredada por ruta (Pacientes/Consultas/Agenda/Recetas/Copiloto + Usuarios/
 * Roles) con la navegación CHAT-FIRST (agente global + buscador de paciente + pacientes recientes
 * del CONTRATO). Antes había DOS columnas de cromo (la barra de PlatformShell y el aside del
 * ChatShell); aquí se consolidan sin perder ninguna ruta ni capacidad.
 *
 * El contexto clínico activo se comparte vía ``useChatNav`` con el chat del inicio. Al elegir el
 * agente global, un paciente reciente o un resultado del buscador, se fija el contexto y se navega
 * al inicio (``/``), donde el ChatShell ya lo refleja. El resaltado chat-first sólo aplica en el
 * inicio; en otras rutas resalta el item de ruta correspondiente.
 */
export function AppSidebar({
  session,
  availableResources,
  recentPatients,
}: Readonly<{
  session: SessionUser;
  availableResources: readonly string[];
  recentPatients: readonly RecentPatient[];
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeContext, setActiveContext } = useChatNav();

  const available = new Set(availableResources);
  const mainItems = MAIN_NAV.filter((item) => !item.resource || available.has(item.resource));
  const adminItems = ADMIN_NAV.filter((item) => !item.resource || available.has(item.resource));

  const onHome = pathname === "/";
  const globalActive = onHome && activeContext === null;

  // Fija el contexto activo y lleva al inicio (chat-first). En el inicio el push es idempotente.
  const selectContext = (context: ActiveClinicalContext | null): void => {
    setActiveContext(context);
    router.push("/");
  };

  const initial = (session.name?.trim()?.[0] ?? "M").toUpperCase();

  return (
    <aside className="flex w-[286px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg2)]">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]">
          M
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-[var(--tx)]">
          MediCopilot
        </span>
      </div>

      {/* Agente global (inicio chat-first) */}
      <div className="px-3.5 pb-2">
        <button
          type="button"
          onClick={() => selectContext(null)}
          aria-current={globalActive ? "true" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm transition ${
            globalActive
              ? "bg-[var(--accent-dim)] font-semibold text-[var(--accent-tx)]"
              : "border border-[var(--accent-bd)] bg-[var(--accent-dim)] font-semibold text-[var(--accent-tx)] hover:brightness-105"
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-xs font-bold text-[var(--on-accent)]">
            IA
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">Agente global</span>
            <span className="block truncate text-xs text-[var(--tx3)]">Tareas sin paciente</span>
          </span>
        </button>
      </div>

      {/* Buscador de cualquier paciente (reusa el selector de contexto existente). */}
      <div className="px-3.5 pb-2">
        <ActiveContextPicker context={onHome ? activeContext : null} onChange={selectContext} />
      </div>

      {/* Navegación principal por ruta. */}
      {mainItems.length > 0 ? (
        <nav className="flex flex-col gap-1 px-3.5 pb-1">
          {mainItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={navItemClass(active)}
              >
                <span className="flex shrink-0 items-center justify-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Pacientes recientes (del contrato). */}
      <div className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
        Pacientes recientes
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3.5 pb-2">
        {recentPatients.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-[var(--tx3)]">
            No hay pacientes para mostrar todavía.
          </p>
        ) : (
          recentPatients.map((patient) => {
            const active = onHome && activeContext?.patientId === patient.id;
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() =>
                  selectContext({
                    patientId: patient.id,
                    patientLabel: patient.label,
                    consultationId: null,
                    consultationLabel: null,
                  })
                }
                aria-current={active ? "true" : undefined}
                title={patient.label}
                className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition ${
                  active ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--panel2)]"
                }`}
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-xs font-bold text-[var(--on-accent)]">
                  {patient.initial}
                </span>
                <span
                  className={`block min-w-0 flex-1 truncate text-sm ${
                    active ? "font-semibold text-[var(--accent-tx)]" : "text-[var(--tx)]"
                  }`}
                >
                  {patient.label}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Navegación de administración. */}
      {adminItems.length > 0 ? (
        <nav className="flex flex-col gap-1 border-t border-[var(--border)] px-3.5 py-2">
          {adminItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={navItemClass(active)}
              >
                <span className="flex shrink-0 items-center justify-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      {/* Pie: identidad + tema + cuenta/cierre de sesión. */}
      <div className="flex flex-col gap-3 border-t border-[var(--border)] px-3.5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--tx)]">
              {session.name}
            </span>
            <span className="block truncate text-xs text-[var(--tx3)]">{session.email}</span>
          </span>
          <ThemeToggle />
        </div>
        <AccountMenu />
      </div>
    </aside>
  );
}
