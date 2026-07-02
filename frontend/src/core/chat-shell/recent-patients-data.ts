import { getResourceCapability } from "@/core/resources/capabilities-client";
import { buildFilterableControls, parseListQuery } from "@/core/resources/list-query";
import { getResourceListPage } from "@/core/resources/resource-list-client";
import type { ResourceRow } from "@/core/resources/list-types";
import {
  rankRecentPatients,
  toChatActivityRanking,
  toRecentPatients,
  type RecentPatient,
} from "@/core/chat-shell/recent-patients";

const RECENT_LIMIT = 8;
// Pacientes a considerar para el ranking (el backend acota a su max_limit). Más ancho que los 8
// visibles para que un paciente con chat reciente entre aunque no esté al frente de la lista base.
const PATIENTS_POOL_LIMIT = 100;
// Conversaciones a leer para el ranking de actividad (orden -updated_at del contrato).
const CONVERSATIONS_LIMIT = 100;

/** Filas de un recurso del contrato con parámetros sintéticos; [] si no hay permiso o falla. */
async function fetchContractRows(
  resource: string,
  synthetic: Record<string, string>,
): Promise<readonly ResourceRow[]> {
  try {
    const capability = await getResourceCapability(resource);
    if (!capability || capability.view !== "table" || !capability.list) {
      return [];
    }
    const controls = buildFilterableControls(capability.list);
    const query = parseListQuery(synthetic, capability.list, controls);
    const page = await getResourceListPage(capability, query);
    return page?.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Pacientes recientes para la barra lateral unificada (MP-CTRL-0128). Salen del CONTRATO de recursos
 * (misma lista que la tabla genérica de pacientes), no se hardcodean; si el rol no puede leer
 * pacientes o no hay, devuelve vacío y la barra muestra sólo el agente global + el buscador.
 *
 * ORDEN: por la última actividad del CHAT de cada paciente (conversaciones del contrato, orden
 * ``-updated_at``; el backend marca ``updated_at`` al agregar mensajes). Los pacientes sin chat van
 * después, en el orden de la lista base. Si el rol no puede leer conversaciones, degrada al orden
 * de la lista de pacientes (comportamiento previo).
 */
export async function getRecentPatients(): Promise<RecentPatient[]> {
  const capability = await getResourceCapability("patients");
  if (!capability || capability.view !== "table" || !capability.list) {
    return [];
  }
  const controls = buildFilterableControls(capability.list);
  const query = parseListQuery(
    { limit: String(PATIENTS_POOL_LIMIT) },
    capability.list,
    controls,
  );
  const page = await getResourceListPage(capability, query);
  if (!page) {
    return [];
  }
  const conversationRows = await fetchContractRows("conversations", {
    sort: "-updated_at",
    limit: String(CONVERSATIONS_LIMIT),
  });
  const ranking = toChatActivityRanking(conversationRows);
  return rankRecentPatients(toRecentPatients(page.items), ranking).slice(0, RECENT_LIMIT);
}
