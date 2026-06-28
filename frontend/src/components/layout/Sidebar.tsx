"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

function HomeIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

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

// Items del diseno mapeados a las RUTAS EXISTENTES. Los items de recurso solo se
// muestran si el recurso esta en el catalogo del usuario (evita enlaces muertos).
const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: <HomeIcon /> },
  { label: "Copiloto", href: "/copilot", icon: <CopilotIcon /> },
  { label: "Pacientes", href: "/resources/patients", resource: "patients", icon: <PatientsIcon /> },
  {
    label: "Consultas",
    href: "/resources/consultations",
    resource: "consultations",
    icon: <ConsultIcon />,
  },
  { label: "Agenda", href: "/resources/appointments", resource: "appointments", icon: <AgendaIcon /> },
  {
    label: "Recetas",
    href: "/resources/prescriptions",
    resource: "prescriptions",
    icon: <PrescriptionIcon />,
  },
  { label: "Usuarios", href: "/resources/users", resource: "users", icon: <UsersIcon /> },
  { label: "Roles y permisos", href: "/resources/roles", resource: "roles", icon: <RolesIcon /> },
];

export function Sidebar({ availableResources }: Readonly<{ availableResources: string[] }>) {
  const pathname = usePathname();
  const available = new Set(availableResources);
  const items = NAV_ITEMS.filter((item) => !item.resource || available.has(item.resource));

  return (
    <aside className="flex w-[72px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--bg2)] p-3 lg:w-[286px]">
      <div className="mb-2 flex items-center gap-2.5 px-1.5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]">
          M
        </span>
        <span className="hidden text-[17px] font-semibold tracking-tight text-[var(--tx)] lg:inline">
          MediCopilot
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-[var(--accent-dim)] font-semibold text-[var(--accent-tx)]"
                  : "font-medium text-[var(--tx2)] hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
              }`}
            >
              <span className="flex shrink-0 items-center justify-center">{item.icon}</span>
              <span className="hidden truncate lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
