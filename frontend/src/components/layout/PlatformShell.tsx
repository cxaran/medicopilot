import { AppSidebar } from "@/components/layout/AppSidebar";
import { ChatNavProvider } from "@/components/chat-shell/ChatNavProvider";
import type { ResourceCatalog as ResourceCatalogType } from "@/core/api/contracts";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";
import type { SessionUser } from "@/core/auth/types";

/**
 * Cromo del shell autenticado tras la rebanada 8 del rediseño (MP-CTRL-0128): UNA sola barra lateral
 * a sangre (``AppSidebar``) que fusiona la navegación heredada por ruta con la navegación chat-first
 * (agente global + buscador + pacientes recientes), sin barra superior. El estado del contexto
 * clínico activo se comparte vía ``ChatNavProvider`` entre la barra lateral y el chat del inicio.
 */
export function PlatformShell({
  session,
  resources,
  recentPatients,
  children,
}: Readonly<{
  session: SessionUser;
  resources: ResourceCatalogType;
  recentPatients: readonly RecentPatient[];
  children: React.ReactNode;
}>) {
  const availableResources = resources.map((resource) => resource.name);

  return (
    <ChatNavProvider>
      <div className="flex min-h-screen bg-[var(--bg)] text-[var(--tx)]">
        <AppSidebar
          session={session}
          availableResources={availableResources}
          recentPatients={recentPatients}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </ChatNavProvider>
  );
}
