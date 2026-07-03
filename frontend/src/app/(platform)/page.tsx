import { ChatShell } from "@/components/chat-shell/ChatShell";
import {
  EnvironmentBadge,
  SetupChecklistBanner,
} from "@/components/system/SetupChecklistBanner";
import { requireSession } from "@/core/auth/session";
import { getDashboardData } from "@/core/chat-shell/dashboard-data";
import { getSetupChecklist } from "@/core/system-settings/checklist-data";
import { shouldShowBanner } from "@/core/system-settings/setup-checklist";

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

  // Checklist de puesta en marcha (derivado; null degrada sin banner) + chip de
  // entorno no productivo. Flotantes: no tocan el layout del shell.
  const checklist = await getSetupChecklist();

  return (
    <>
      <ChatShell dashboard={dashboard} />
      {checklist ? <EnvironmentBadge environment={checklist.environment} /> : null}
      {shouldShowBanner(checklist) && checklist ? (
        <SetupChecklistBanner checklist={checklist} />
      ) : null}
    </>
  );
}
