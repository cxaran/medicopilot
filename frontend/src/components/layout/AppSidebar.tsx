"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ResourceActionConfirmDialog } from "@/components/resources/ResourceActionConfirmDialog";
import { AnimatedOrb } from "@/components/ui/AnimatedOrb";
import { avatarColor, BRAND_AVATAR_GRADIENT } from "@/components/ui/avatar-color";
import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import type { ActiveClinicalContext } from "@/core/agent/active-context";
import { mergeRecentPatients, type RecentPatient } from "@/core/chat-shell/recent-patients";
import type { SessionUser } from "@/core/auth/types";

// Máximo de pacientes recientes visibles (mismo tope que la lista servida por el layout).
const RECENT_LIMIT = 8;

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
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
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

function DoctorIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M7 3v5a5 5 0 0 0 10 0V3" />
      <path d="M12 13v3a4 4 0 0 1-8 0v-1" />
      <circle cx="18" cy="15" r="2.5" />
    </svg>
  );
}

function MedTemplateIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3.5" y="8.5" width="9" height="12" rx="2" transform="rotate(-45 8 14.5)" />
      <path d="M8 11l5 5" />
    </svg>
  );
}

function CodesIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7l2.1 1.2M17.7 15.8l2.1 1.2M4.2 17l2.1-1.2M17.7 8.2l2.1-1.2" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M4 20h16M7 20V11M12 20V5M17 20v-6" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M12 3v18M5 7h14M5 7l-2.5 5a3 3 0 0 0 5 0L5 7m14 0-2.5 5a3 3 0 0 0 5 0L19 7" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M9 4h6l4 4v12H5V4z" />
      <path d="M14 4v4h4M9 13l2 2 3.5-3.5" />
    </svg>
  );
}

function BackupIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M7 18a4.5 4.5 0 1 1 .5-8.97 6 6 0 0 1 11.4 1.72A3.75 3.75 0 0 1 18 18H7z" />
      <path d="M12 12v5m0 0-2-2m2 2 2-2" />
    </svg>
  );
}

function ResourcesIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

type NavItem = {
  label: string;
  href: string;
  resource?: string;
  icon: ReactNode;
  // Resaltado por igualdad exacta en lugar de prefijo. Necesario para "/resources" (el índice del
  // catálogo), que de otro modo se marcaría activo también en /resources/patients y similares.
  exact?: boolean;
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
  // Reportes agregados (sin recurso de catálogo: la página degrada con aviso si falta reports:read).
  { label: "Reportes", href: "/reports", icon: <ReportsIcon /> },
  // Escalas clínicas (sin recurso de catálogo: degrada si falta clinical_scales:read).
  { label: "Escalas", href: "/scales", icon: <ScaleIcon /> },
  // Catálogo COMPLETO de recursos (reincorpora ResourceCatalog): índice de todos los recursos
  // visibles para el rol, no la lista curada. Sin recurso de catálogo: siempre visible para la
  // sesión; la propia página proyecta por permisos.
  { label: "Recursos", href: "/resources", icon: <ResourcesIcon />, exact: true },
];

// Navegación de ADMINISTRACIÓN (pie de la barra), también filtrada por catálogo: cada item solo
// aparece si el recurso está en el catálogo del usuario (RBAC). Incluye control de acceso
// (usuarios/roles) y catálogos administrables (médicos, plantillas de medicamentos, códigos
// clínicos y configuración institucional) que antes no tenían punto de entrada humano y solo eran
// alcanzables tecleando la URL genérica.
const ADMIN_NAV: NavItem[] = [
  { label: "Médicos", href: "/resources/doctors", resource: "doctors", icon: <DoctorIcon /> },
  {
    label: "Plantillas de medicamentos",
    href: "/resources/medication_templates",
    resource: "medication_templates",
    icon: <MedTemplateIcon />,
  },
  {
    label: "Códigos clínicos",
    href: "/resources/clinical_codes",
    resource: "clinical_codes",
    icon: <CodesIcon />,
  },
  {
    label: "Configuración institucional",
    href: "/resources/institutional_settings",
    resource: "institutional_settings",
    icon: <SettingsIcon />,
  },
  {
    label: "Auditoría",
    href: "/resources/audit_events",
    resource: "audit_events",
    icon: <AuditIcon />,
  },
  // Archivos reales de la carpeta de respaldos en Drive (fase inicial del explorador).
  {
    label: "Respaldos",
    href: "/backups",
    resource: "backup_settings",
    icon: <BackupIcon />,
  },
  { label: "Usuarios", href: "/resources/users", resource: "users", icon: <UsersIcon /> },
  { label: "Roles y permisos", href: "/resources/roles", resource: "roles", icon: <RolesIcon /> },
];

/**
 * Menú de OPCIONES de un chat del sidebar (Inicio y cada paciente): botón de 3 puntos verticales
 * que aparece al pasar el cursor (o al enfocar con teclado) y que también se abre con CLICK
 * SECUNDARIO sobre el item (el wrapper lo maneja). Hoy ofrece "Reiniciar conversación": vacía el
 * historial de ese chat (baja lógica en el backend), nunca datos clínicos.
 */
function ChatItemOptions({
  open,
  onToggle,
  onClose,
  onReset,
  chatLabel,
}: Readonly<{
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReset: () => void;
  chatLabel: string;
}>) {
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={`Opciones del chat de ${chatLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Opciones del chat"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--tx3)] transition hover:bg-[var(--bg2)] hover:text-[var(--tx)] focus:opacity-100 group-hover:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="5.5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="18.5" r="1.7" />
        </svg>
      </button>
      {open && (
        <>
          {/* Telón transparente: cierra el menú al hacer click (o click secundario) fuera. */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={onClose}
            onContextMenu={(event) => {
              event.preventDefault();
              onClose();
            }}
          />
          <div
            role="menu"
            aria-label={`Opciones del chat de ${chatLabel}`}
            className="absolute right-1 top-[calc(100%-2px)] z-50 min-w-[210px] rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[var(--soft)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onReset();
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] font-medium text-[var(--tx)] transition hover:bg-[var(--panel2)] hover:text-[var(--danger)]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 11a8 8 0 1 1 1.6 5.5" />
                <path d="M4 20v-5h5" />
              </svg>
              Reiniciar conversación
            </button>
          </div>
        </>
      )}
    </>
  );
}

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
  const { activeContext, setActiveContext, requestChatReset, recentChatBumps } = useChatNav();

  // Recientes = actividad de chat de ESTA SESIÓN (bumps, al frente) + la lista servida (ya ordenada
  // por la última actividad de las conversaciones persistidas), sin duplicados y acotada.
  const patients = mergeRecentPatients(recentChatBumps, recentPatients, RECENT_LIMIT);

  // Menú de opciones abierto ("global" o el id del paciente); las opciones del chat viven en el
  // sidebar (3 puntos al pasar el cursor o click secundario sobre el item), no dentro del hilo.
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  // Reinicio con confirmación (acción destructiva sobre el historial de chat, nunca sobre datos
  // clínicos): diálogo accesible del diseño, nunca window.confirm. Confirmar declara la intención
  // en ChatNavProvider; el ChatShell la resuelve.
  const [pendingReset, setPendingReset] = useState<{
    patientId: string | null;
    label: string;
  } | null>(null);
  const confirmChatReset = (patientId: string | null, label: string): void => {
    setPendingReset({ patientId, label });
  };

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
    <aside className="mc-sidebar flex w-[286px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg2)]">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <AnimatedOrb size={30} />
        <span className="text-[17px] font-semibold tracking-tight text-[var(--tx)]">
          MediCopilot
        </span>
      </div>

      {/* Inicio (chat-first): el agente global sin paciente es, simplemente, el INICIO — un ítem de
          navegación con icono de casa, como en el diseño (no una tarjeta "Agente global"). Limpia el
          contexto activo y lleva a "/"; se resalta cuando estás en el inicio sin paciente. */}
      <div className="px-3.5 pb-2">
        {/* Wrapper con el menú de opciones del chat global: 3 puntos al pasar el cursor y click
            secundario sobre el item. El botón principal sigue siendo el de navegación. */}
        <div
          className={`group relative flex items-center rounded-[10px] pr-1 transition ${
            globalActive ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--panel2)]"
          }`}
          onContextMenu={(event) => {
            event.preventDefault();
            setOpenMenuKey((key) => (key === "global" ? null : "global"));
          }}
        >
          <button
            type="button"
            onClick={() => selectContext(null)}
            aria-current={globalActive ? "page" : undefined}
            title="Inicio"
            className={`flex min-w-0 flex-1 items-center gap-3 rounded-[10px] border-0 bg-transparent px-3 py-2.5 text-left text-sm transition ${
              globalActive
                ? "font-semibold text-[var(--accent-tx)]"
                : "font-medium text-[var(--tx2)] group-hover:text-[var(--tx)]"
            }`}
          >
            <span className="flex shrink-0 items-center justify-center">
              <HomeIcon />
            </span>
            <span className="truncate">Inicio</span>
          </button>
          <ChatItemOptions
            open={openMenuKey === "global"}
            onToggle={() => setOpenMenuKey((key) => (key === "global" ? null : "global"))}
            onClose={() => setOpenMenuKey(null)}
            onReset={() => confirmChatReset(null, "Inicio")}
            chatLabel="Inicio"
          />
        </div>
      </div>

      {/* Navegación principal por ruta. */}
      {mainItems.length > 0 ? (
        <nav className="flex flex-col gap-1 px-3.5 pb-1">
          {mainItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
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
        {patients.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-[var(--tx3)]">
            No hay pacientes para mostrar todavía.
          </p>
        ) : (
          patients.map((patient) => {
            const active = onHome && activeContext?.patientId === patient.id;
            return (
              // Wrapper con el menú de opciones del chat del paciente: 3 puntos al pasar el cursor
              // y click secundario sobre el item (el botón principal sigue abriendo el chat).
              <div
                key={patient.id}
                className={`group relative flex items-center rounded-[10px] pr-1 transition ${
                  active ? "bg-[var(--accent-dim)]" : "hover:bg-[var(--panel2)]"
                }`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setOpenMenuKey((key) => (key === patient.id ? null : patient.id));
                }}
              >
                <button
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
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left"
                >
                  <span
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-xs font-bold text-white"
                    style={{ background: avatarColor(patient.id) }}
                  >
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
                <ChatItemOptions
                  open={openMenuKey === patient.id}
                  onToggle={() =>
                    setOpenMenuKey((key) => (key === patient.id ? null : patient.id))
                  }
                  onClose={() => setOpenMenuKey(null)}
                  onReset={() => confirmChatReset(patient.id, patient.label)}
                  chatLabel={patient.label}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Navegación de administración. */}
      {adminItems.length > 0 ? (
        <nav className="flex flex-col gap-1 border-t border-[var(--border)] px-3.5 py-2">
          {adminItems.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
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

      {/* Pie: identidad + tema + cuenta (engranaje) + cerrar sesión, en una sola fila. */}
      <div className="border-t border-[var(--border)] px-3.5 py-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold text-white"
            style={{ background: BRAND_AVATAR_GRADIENT }}
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[var(--tx)]">
              {session.name}
            </span>
            {/* Estado de sesión: el médico autenticado está "En línea". El email queda
                accesible desde el menú de cuenta. (El rol no viaja en la sesión.) */}
            <span className="flex items-center gap-1.5 text-xs text-[var(--tx2)]">
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-[var(--ok)]"
              />
              <span className="truncate">En línea</span>
            </span>
          </span>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>

      {/* Confirmación de "Reiniciar chat" (acción destructiva sobre el historial, nunca sobre
          datos clínicos): diálogo accesible del diseño. */}
      {pendingReset && (
        <ResourceActionConfirmDialog
          confirmation={{
            required: true,
            title: "Reiniciar conversación",
            message:
              `Se eliminará de forma permanente todo el historial del chat de ` +
              `${pendingReset.label}. Los datos del expediente no se tocan.`,
            confirm_label: "Reiniciar",
            destructive: true,
          }}
          pending={false}
          error={null}
          onConfirm={() => {
            const target = pendingReset;
            setPendingReset(null);
            if (target) {
              requestChatReset(target.patientId);
            }
          }}
          onCancel={() => setPendingReset(null)}
        />
      )}
    </aside>
  );
}
