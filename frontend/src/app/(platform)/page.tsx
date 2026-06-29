import { ChatShell } from "@/components/chat-shell/ChatShell";
import { requireSession } from "@/core/auth/session";
import { getResourceCapability } from "@/core/resources/capabilities-client";
import { buildFilterableControls, parseListQuery } from "@/core/resources/list-query";
import { getResourceListPage } from "@/core/resources/resource-list-client";
import { toRecentPatients, type RecentPatient } from "@/core/chat-shell/recent-patients";

const RECENT_LIMIT = 8;

/**
 * Inicio CHAT-FIRST (MP-CTRL-0122): el home es el agente global + la lista de pacientes/chats.
 * Los pacientes salen del CONTRATO de recursos (misma lista que la tabla genérica de pacientes),
 * no se hardcodean; si el rol no puede leer pacientes o no hay, el shell muestra sólo el agente
 * global + el buscador. El chat reusa el CopilotPanel existente (lógica intacta).
 */
export default async function HomePage() {
  await requireSession();

  let recentPatients: RecentPatient[] = [];
  const capability = await getResourceCapability("patients");
  if (capability && capability.view === "table" && capability.list) {
    const controls = buildFilterableControls(capability.list);
    const query = parseListQuery({}, capability.list, controls);
    const page = await getResourceListPage(capability, query);
    if (page) {
      recentPatients = toRecentPatients(page.items).slice(0, RECENT_LIMIT);
    }
  }

  return <ChatShell recentPatients={recentPatients} />;
}
