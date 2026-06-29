import { ChatShell } from "@/components/chat-shell/ChatShell";
import { requireSession } from "@/core/auth/session";
import { getDashboardData } from "@/core/chat-shell/dashboard-data";

/**
 * Inicio CHAT-FIRST (MP-CTRL-0122; barra lateral unificada en 0128): el home es el agente global con
 * su dashboard de resumen y el chat. La navegación (agente global + buscador + pacientes recientes)
 * vive ahora en la barra lateral única del shell; el contexto activo se comparte con ella vía
 * ChatNavProvider, así que aquí sólo se compone el área principal.
 */
export default async function HomePage() {
  await requireSession();

  // Dashboard del inicio (agente global): compone lecturas existentes del contrato (citas de hoy,
  // consultas recientes, pendientes de seguimiento). Degrada a vacío si el rol no tiene permiso.
  const dashboard = await getDashboardData();

  return <ChatShell dashboard={dashboard} />;
}
