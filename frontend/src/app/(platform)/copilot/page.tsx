import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { requireSession } from "@/core/auth/session";

/**
 * Copiloto STANDALONE (ruta /copilot): el CopilotPanel completo con su cromo propio (encabezado,
 * aviso de borrador, catálogo de herramientas, uso/costo y selector de contexto). Ejecuta tools
 * clínicas: lecturas directas contra FastAPI y escrituras con aprobación P1. Es la segunda vía de
 * acceso al agente, redundante con el shell chat-first del inicio (que embebe el mismo panel por
 * conversación persistida); se conserva enlazada en la barra lateral como vista de diagnóstico.
 */
export default async function CopilotPage() {
  await requireSession();
  return <CopilotPanel />;
}
