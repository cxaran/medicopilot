"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CopilotPanel, type ChatMessage } from "@/components/copilot/CopilotPanel";
import { ActiveContextPicker } from "@/components/copilot/ActiveContextPicker";
import { DashboardHome } from "@/components/chat-shell/DashboardHome";
import { PatientRecordPanel } from "@/components/chat-shell/PatientRecordPanel";
import type { ActiveClinicalContext } from "@/core/agent/active-context";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";
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
 * MP-CTRL-0123). Cada PACIENTE es un chat y el inicio es el agente global (sin paciente). El panel
 * izquierdo es la lista de pacientes/chats (del CONTRATO de recursos) + el buscador + la entrada al
 * agente global. El área principal es el CHAT ACTIVO: reusa el CopilotPanel EXISTENTE (gateway/P1/
 * tools/turns) con su contexto clínico CONTROLADO por el shell.
 *
 * Persistencia (0123): al abrir un chat se BUSCA-O-CREA su conversación y se CARGA el historial para
 * sembrar el panel; a medida que ocurren turnos, el shell PERSISTE (append) los mensajes nuevos. El
 * panel se remonta por conversación (``key``) para re-sembrar el historial al cambiar de chat.
 * Persistir el transcript NO es una escritura clínica (no pasa por P1); las escrituras clínicas
 * (borradores) conservan su aprobación dentro del CopilotPanel. Si la persistencia falla, el chat
 * sigue funcionando sin historial (degradación limpia).
 */
export function ChatShell({
  recentPatients,
  dashboard,
}: Readonly<{
  recentPatients: readonly RecentPatient[];
  // Resumen del inicio (agente global). Se renderiza sólo en el chat global; opcional para
  // mantener compatibilidad si el inicio no lo provee.
  dashboard?: DashboardData;
}>) {
  const [activeContext, setActiveContext] = useState<ActiveClinicalContext | null>(null);

  const openPatient = (patient: RecentPatient): void =>
    setActiveContext({
      patientId: patient.id,
      patientLabel: patient.label,
      consultationId: null,
      consultationLabel: null,
    });

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
    <div className="flex min-h-[calc(100vh-9rem)] gap-4">
      <aside className="flex w-[260px] shrink-0 flex-col gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--bg2)] p-3">
        {/* Entrada al agente GLOBAL (sin paciente). */}
        <button
          type="button"
          onClick={() => setActiveContext(null)}
          aria-current={activeContext === null ? "true" : undefined}
          className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm transition ${
            activeContext === null
              ? "bg-[var(--accent-dim)] font-semibold text-[var(--accent-tx)]"
              : "font-medium text-[var(--tx2)] hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-xs font-bold text-[var(--on-accent)]">
            IA
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">Agente global</span>
            <span className="block truncate text-xs text-[var(--tx3)]">Tareas sin paciente</span>
          </span>
        </button>

        {/* Buscador de cualquier paciente (reusa la búsqueda existente). */}
        <ActiveContextPicker context={activeContext} onChange={setActiveContext} />

        <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
          Pacientes recientes
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {recentPatients.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-[var(--tx3)]">
              No hay pacientes para mostrar todavía.
            </p>
          ) : (
            recentPatients.map((patient) => {
              const active = patient.id === activePatientId;
              return (
                <button
                  key={patient.id}
                  type="button"
                  onClick={() => openPatient(patient)}
                  aria-current={active ? "true" : undefined}
                  title={patient.label}
                  className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition ${
                    active
                      ? "bg-[var(--accent-dim)]"
                      : "hover:bg-[var(--panel2)]"
                  }`}
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent)] text-xs font-bold text-[var(--on-accent)]">
                    {patient.initial}
                  </span>
                  <span
                    className={`block min-w-0 flex-1 truncate text-sm ${
                      active ? "font-semibold text-[var(--accent-tx)]" : "text-[var(--tx)]"
                    }`}
                  >
                    {patient.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Columna principal. En el inicio (chat global) la superficie de aterrizaje es el dashboard
          de resumen; debajo, el chat global sigue accesible. En un paciente, sólo su chat. */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto">
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
    </div>
  );
}
