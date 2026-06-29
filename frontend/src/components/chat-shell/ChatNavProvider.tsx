"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { ActiveClinicalContext } from "@/core/agent/active-context";

/**
 * Estado CHAT-FIRST compartido por el shell (MP-CTRL-0128, rebanada 8 del rediseño). Al unificar la
 * navegación en UNA sola barra lateral, el contexto clínico activo (paciente o agente global) deja
 * de vivir dentro del ChatShell y se eleva aquí, para que la barra lateral (presente en TODAS las
 * rutas) y el chat del inicio compartan la misma selección. El proveedor se monta en el layout, así
 * que su estado sobrevive a la navegación cliente entre rutas (Next preserva el layout).
 */
type ChatNavValue = {
  activeContext: ActiveClinicalContext | null;
  setActiveContext: (context: ActiveClinicalContext | null) => void;
};

const ChatNavContext = createContext<ChatNavValue | null>(null);

export function ChatNavProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [activeContext, setActiveContext] = useState<ActiveClinicalContext | null>(null);
  const value = useMemo<ChatNavValue>(() => ({ activeContext, setActiveContext }), [activeContext]);
  return <ChatNavContext.Provider value={value}>{children}</ChatNavContext.Provider>;
}

export function useChatNav(): ChatNavValue {
  const context = useContext(ChatNavContext);
  if (!context) {
    throw new Error("useChatNav debe usarse dentro de ChatNavProvider");
  }
  return context;
}
