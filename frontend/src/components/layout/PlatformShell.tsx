import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { ChatNavProvider } from "@/components/chat-shell/ChatNavProvider";
import type { ResourceCatalog as ResourceCatalogType } from "@/core/api/contracts";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";
import type { SessionUser } from "@/core/auth/types";

/**
 * Cromo del shell autenticado. La barra lateral única (``AppSidebar``, MP-CTRL-0128) fusiona la
 * navegación por ruta con la navegación chat-first. El modelo de layout (alto completo, cabecera
 * fija de 62px y cajón en móvil) lo aporta ``ResponsiveShell``, fiel a MediCopilot.dc.html. El
 * contexto clínico activo se comparte vía ``ChatNavProvider`` entre la barra lateral y el chat.
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
      <ResponsiveShell
        session={session}
        availableResources={availableResources}
        recentPatients={recentPatients}
      >
        {children}
      </ResponsiveShell>
    </ChatNavProvider>
  );
}
