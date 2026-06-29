"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CopilotPanel, type ChatMessage } from "@/components/copilot/CopilotPanel";
import { DashboardHome } from "@/components/chat-shell/DashboardHome";
import { PatientRecordPanel } from "@/components/chat-shell/PatientRecordPanel";
import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import type { DashboardData } from "@/core/chat-shell/dashboard";
import {
  messagesToTranscript,
  selectUnpersisted,
  toMessagePayload,
} from "@/core/chat-shell/chat-persistence";
import {
  appendMessage,
  findOrCreateConversation,
  listMessages,
} from "@/core/conversations/conversations-client";

/**
 * Shell CHAT-FIRST (rebanada 2 del rediseño, MP-CTRL-0122) + PERSISTENCIA DEL HILO (rebanada 3,
 * MP-CTRL-0123) + BARRA LATERAL UNIFICADA (rebanada 8, MP-CTRL-0128). Cada PACIENTE es un chat y el
 * inicio es el agente global (sin paciente). La navegación (agente global + buscador + pacientes
 * recientes del CONTRATO) vive ahora en la barra lateral única del shell; este componente compone
 * sólo el ÁREA PRINCIPAL: el CHAT ACTIVO (reusa el CopilotPanel EXISTENTE —gateway/P1/tools/turns—)
 * con su contexto clínico CONTROLADO por ``ChatNavProvider``, compartido con la barra lateral.
 *
 * Persistencia (0123): al abrir un chat se BUSCA-O-CREA su conversación y se CARGA el historial para
 * sembrar el panel; a medida que ocurren turnos, el shell PERSISTE (append) los mensajes nuevos. El
 * panel se remonta por conversación (``key``) para re-sembrar el historial al cambiar de chat.
 * Persistir el transcript NO es una escritura clínica (no pasa por P1); las escrituras clínicas
 * (borradores) conservan su aprobación dentro del CopilotPanel. Si la persistencia falla, el chat
 * sigue funcionando sin historial (degradación limpia).
 */
export function ChatShell({
  dashboard,
}: Readonly<{
  // Resumen del inicio (agente global). Se renderiza sólo en el chat global; opcional para
  // mantener compatibilidad si el inicio no lo provee.
  dashboard?: DashboardData;
}>) {
  const { activeContext, setActiveContext } = useChatNav();

  // Apertura desde una tarjeta del dashboard: fija el chat de ese paciente (redirect global->paciente).
  const openPatientById = (patientId: string, patientLabel: string): void =>
    setActiveContext({
      patientId,
      patientLabel,
      consultationId: null,
      consultationLabel: null,
    });

  const activePatientId = activeContext?.patientId ?? null;
  // Clave del chat activo: el paciente o el agente global. Determina qué conversación se abre.
  const chatKey = activePatientId ?? "__global__";

  // Estado de la conversación abierta: id (null si la persistencia no está disponible), historial
  // con el que sembrar el panel y bandera de "ya intentado cargar" (para montar el panel una sola
  // vez por chat, con el historial correcto).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<readonly ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Ids de mensajes YA persistidos (sembrados + enviados). Evita reenviar al diffear el transcript.
  const persistedIdsRef = useRef<Set<string>>(new Set());
  // Cola para serializar los append y preservar el orden (el servidor asigna sequence_index = max+1).
  const appendQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Conversación vigente para los closures de persistencia (la fuente de verdad fuera de React).
  const conversationIdRef = useRef<string | null>(null);

  // Abre (busca-o-crea) la conversación del chat activo y carga su historial. Cancela si el chat
  // cambia antes de terminar (evita sembrar un historial ajeno).
  useEffect(() => {
    let cancelled = false;
    // Refs síncronos: cortan de inmediato la persistencia del chat anterior (el handler lee el ref;
    // con la conversación en null no reenvía nada mientras carga la nueva).
    conversationIdRef.current = null;
    persistedIdsRef.current = new Set();
    appendQueueRef.current = Promise.resolve();

    void (async () => {
      setLoaded(false);
      setConversationId(null);
      try {
        const conversation = await findOrCreateConversation(activePatientId);
        if (cancelled) return;
        const rows = await listMessages(conversation.id);
        if (cancelled) return;
        const seed = messagesToTranscript(rows) as ChatMessage[];
        persistedIdsRef.current = new Set(seed.map((message) => message.id));
        conversationIdRef.current = conversation.id;
        setConversationId(conversation.id);
        setInitialMessages(seed);
      } catch {
        if (cancelled) return;
        // Degradación: sin persistencia el chat funciona, sólo no recuerda el historial.
        conversationIdRef.current = null;
        persistedIdsRef.current = new Set();
        setConversationId(null);
        setInitialMessages([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePatientId]);

  // Persiste (append) los mensajes nuevos del transcript que aún no estén guardados, en orden y de
  // forma serializada. Marca cada id antes de enviar (dedup optimista) y lo desmarca si el envío
  // falla, para reintentarlo en el siguiente cambio. Estable para no recrear el panel.
  const handleMessagesChange = useCallback((messages: readonly ChatMessage[]): void => {
    const conversation = conversationIdRef.current;
    if (!conversation) return;
    const pending = selectUnpersisted(messages, persistedIdsRef.current);
    if (pending.length === 0) return;
    for (const message of pending) {
      persistedIdsRef.current.add(message.id);
      const payload = toMessagePayload(conversation, message);
      appendQueueRef.current = appendQueueRef.current.then(async () => {
        try {
          await appendMessage(payload);
        } catch {
          // Falló el guardado: desmarca para reintentar en el próximo cambio del transcript.
          persistedIdsRef.current.delete(message.id);
        }
      });
    }
  }, []);

  return (
    // Área principal del shell chat-first. La navegación está en la barra lateral única (0128); aquí
    // sólo el contenido del chat activo. En el inicio (agente global) la superficie de aterrizaje es
    // el dashboard de resumen; debajo, el chat global. En un paciente, su expediente + su chat.
    <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-5">
      {activeContext === null && dashboard && (
        <DashboardHome data={dashboard} onOpenPatient={openPatientById} />
      )}
      {/* Expediente del paciente activo: pestañas con la UI genérica del contrato, acotada al
          paciente. Reemplaza al dashboard cuando hay paciente; el chat sigue debajo. */}
      {activeContext !== null && (
        <PatientRecordPanel
          key={activeContext.patientId}
          patientId={activeContext.patientId}
          patientLabel={activeContext.patientLabel}
        />
      )}
      {/* Chat activo: el CopilotPanel existente, con contexto + historial controlados por el shell.
          Se remonta por conversación (key) para re-sembrar el historial al cambiar de chat. */}
      {loaded ? (
        <CopilotPanel
          key={conversationId ?? chatKey}
          activeContext={activeContext}
          onActiveContextChange={setActiveContext}
          hideContextPicker
          initialMessages={initialMessages}
          onMessagesChange={handleMessagesChange}
        />
      ) : (
        <p className="m-auto text-sm text-[var(--tx2)]" role="status" aria-live="polite">
          Cargando conversación…
        </p>
      )}
    </div>
  );
}
