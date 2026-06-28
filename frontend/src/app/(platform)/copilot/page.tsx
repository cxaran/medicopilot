import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { requireSession } from "@/core/auth/session";

/**
 * Copiloto (B7): primera UI del agente. Conecta al model-gateway (ticket ->
 * browser-session -> WebSocket) y renderiza un chat básico con los eventos del turn.
 * Aún NO ejecuta tools clínicas (eso es B8): un tool_call.ready se muestra como pendiente.
 */
export default async function CopilotPage() {
  await requireSession();
  return <CopilotPanel />;
}
