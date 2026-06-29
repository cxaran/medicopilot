import { redirect } from "next/navigation";

import { PlatformShell } from "@/components/layout/PlatformShell";
import { SessionProvider } from "@/core/auth/SessionProvider";
import { getSession } from "@/core/auth/session";
import { getBootstrapStatus } from "@/core/bootstrap/bootstrap-server";
import { getResourceCatalog } from "@/core/resources/capabilities-client";
import { getRecentPatients } from "@/core/chat-shell/recent-patients-data";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) {
    const status = await getBootstrapStatus();
    redirect(status.setup_required ? "/setup" : "/login");
  }
  const resources = await getResourceCatalog();
  // Pacientes recientes para la barra lateral unificada (chat-first), presente en todas las rutas.
  const recentPatients = await getRecentPatients();

  return (
    <SessionProvider initialSession={session}>
      <PlatformShell session={session} resources={resources} recentPatients={recentPatients}>
        {children}
      </PlatformShell>
    </SessionProvider>
  );
}
