"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/layout/AppSidebar";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";
import type { SessionUser } from "@/core/auth/types";

// Titulo de la cabecera derivado de la ruta (faithful al header del diseno, que
// muestra la seccion actual). Para recursos mapea los nombres conocidos a su
// etiqueta en espanol; si no, cae a "Recursos".
const RESOURCE_LABELS: Record<string, string> = {
  patients: "Pacientes",
  consultations: "Consultas",
  prescriptions: "Recetas",
  appointments: "Citas",
  doctors: "Médicos",
  medication_templates: "Plantillas de medicamentos",
  clinical_codes: "Códigos clínicos",
  institutional_settings: "Configuración institucional",
  audit_events: "Auditoría",
  users: "Usuarios",
  roles: "Roles y permisos",
};

function deriveTitle(pathname: string): string {
  if (pathname === "/") return "Inicio";
  if (pathname.startsWith("/agenda")) return "Agenda";
  if (pathname.startsWith("/copilot")) return "Copiloto";
  if (pathname.startsWith("/reports")) return "Reportes";
  if (pathname.startsWith("/scales")) return "Escalas";
  if (pathname.startsWith("/account")) return "Mi cuenta";
  if (pathname.startsWith("/patients")) return "Pacientes";
  if (pathname === "/resources") return "Recursos";
  if (pathname.startsWith("/resources/")) {
    const name = pathname.split("/")[2] ?? "";
    return RESOURCE_LABELS[name] ?? "Recursos";
  }
  return "MediCopilot";
}

/**
 * Cromo responsive del shell autenticado: reproduce el modelo de layout del
 * diseno (MediCopilot.dc.html) — alto completo sin scroll exterior, barra
 * lateral estatica en escritorio y cajon deslizante en movil, mas la cabecera
 * fija de 62px (titulo + notificaciones + ayuda + hamburguesa movil).
 *
 * Mantiene intacta la barra lateral existente (AppSidebar) y el area de
 * contenido; solo aporta la cabecera y el comportamiento de cajon en movil.
 */
export function ResponsiveShell({
  session,
  availableResources,
  recentPatients,
  children,
}: Readonly<{
  session: SessionUser;
  availableResources: readonly string[];
  recentPatients: readonly RecentPatient[];
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Cierra el cajon al cambiar de ruta (patron recomendado por React: ajustar estado durante el
  // render al cambiar una prop, en vez de un efecto con setState).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setNavOpen(false);
  }

  const title = deriveTitle(pathname);

  return (
    <div
      data-nav-open={navOpen ? "1" : "0"}
      className="flex h-screen overflow-hidden bg-[var(--bg)] text-[var(--tx)]"
    >
      {/* Backdrop del cajon (solo visible en movil con el cajon abierto). */}
      <div
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
        className="mc-sidebar-backdrop fixed inset-0 z-[89] bg-black/40"
      />

      <AppSidebar
        session={session}
        availableResources={availableResources}
        recentPatients={recentPatients}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        <header className="flex h-[62px] shrink-0 items-center justify-between border-b border-[var(--border)] px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              title="Menú"
              aria-label="Abrir menú"
              className="mc-menu-btn h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)]"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="truncate text-[15.5px] font-semibold tracking-tight">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Notificaciones"
              aria-label="Notificaciones"
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:text-[var(--tx)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6" />
                <path d="M10 21h4" />
              </svg>
            </button>
            <button
              type="button"
              title="Ayuda"
              aria-label="Ayuda"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:text-[var(--tx)]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.2 9.2a2.8 2.8 0 015.4 1c0 1.8-2.6 2.2-2.6 4M12 17.2h.01" />
              </svg>
            </button>
          </div>
        </header>

        {/* Region de contenido: unico scroller. Conserva el padding del shell
            anterior para no alterar las paginas existentes. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
