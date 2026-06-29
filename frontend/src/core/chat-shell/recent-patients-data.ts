import { getResourceCapability } from "@/core/resources/capabilities-client";
import { buildFilterableControls, parseListQuery } from "@/core/resources/list-query";
import { getResourceListPage } from "@/core/resources/resource-list-client";
import { toRecentPatients, type RecentPatient } from "@/core/chat-shell/recent-patients";

const RECENT_LIMIT = 8;

/**
 * Pacientes recientes para la barra lateral unificada (MP-CTRL-0128). Salen del CONTRATO de recursos
 * (misma lista que la tabla genérica de pacientes), no se hardcodean; si el rol no puede leer
 * pacientes o no hay, devuelve vacío y la barra muestra sólo el agente global + el buscador. Antes
 * vivía en la página de inicio; se eleva al layout porque ahora la barra lateral está en todas las
 * rutas.
 */
export async function getRecentPatients(): Promise<RecentPatient[]> {
  const capability = await getResourceCapability("patients");
  if (!capability || capability.view !== "table" || !capability.list) {
    return [];
  }
  const controls = buildFilterableControls(capability.list);
  const query = parseListQuery({}, capability.list, controls);
  const page = await getResourceListPage(capability, query);
  if (!page) {
    return [];
  }
  return toRecentPatients(page.items).slice(0, RECENT_LIMIT);
}
