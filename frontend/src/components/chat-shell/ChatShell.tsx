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
  deleteMessage,
  findOrCreateConversation,
  listConversations,
  listMessages,
  resetConversation,
  updateMessagePayload,
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
  const { activeContext, setActiveContext, chatResets, bumpRecentChat } = useChatNav();

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
  // Nº de mensajes del chat activo. Permite la transición chat-first del diseño: en el agente global,
  // el dashboard de aterrizaje se muestra SÓLO con el chat vacío; al primer mensaje, el chat ocupa el
  // área (el dashboard se oculta). Se siembra desde el historial y se actualiza con cada cambio.
  const [transcriptLength, setTranscriptLength] = useState(0);

  // Ids de mensajes YA persistidos (sembrados + enviados). Evita reenviar al diffear el transcript.
  const persistedIdsRef = useRef<Set<string>>(new Set());
  // Cola para serializar los append y preservar el orden (el servidor asigna sequence_index = max+1).
  // Los borrados/reinicios se encolan AQUÍ MISMO: así un "reiniciar desde aquí" espera a que el
  // append en vuelo de ese mensaje termine (y su fila exista) antes de borrarla.
  const appendQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Conversación vigente para los closures de persistencia (la fuente de verdad fuera de React).
  const conversationIdRef = useRef<string | null>(null);
  // Fila del backend de cada mensaje del transcript (id local → {id, sequence_index}). Los
  // sembrados usan el uuid del backend como id local; los enviados se registran con la respuesta
  // del append. Permite borrar/reiniciar en el backend a partir del mensaje visible.
  const backendRowsRef = useRef<Map<string, { id: string; sequenceIndex: number }>>(new Map());
  // Paciente del chat activo para los closures de persistencia (bump de "recientes" al chatear).
  // Se actualiza en un efecto (no durante el render) para cumplir la regla de hooks; el desfase de
  // un render es inocuo (los mensajes llegan después del montaje del chat).
  const activePatientRef = useRef<{ id: string; label: string } | null>(null);
  useEffect(() => {
    activePatientRef.current = activeContext
      ? { id: activeContext.patientId, label: activeContext.patientLabel }
      : null;
  }, [activeContext]);

  // Abre (busca-o-crea) la conversación del chat activo y carga su historial. Cancela si el chat
  // cambia antes de terminar (evita sembrar un historial ajeno).
  useEffect(() => {
    let cancelled = false;
    // Refs síncronos: cortan de inmediato la persistencia del chat anterior (el handler lee el ref;
    // con la conversación en null no reenvía nada mientras carga la nueva).
    conversationIdRef.current = null;
    persistedIdsRef.current = new Set();
    backendRowsRef.current = new Map();
    appendQueueRef.current = Promise.resolve();

    void (async () => {
      setLoaded(false);
      setConversationId(null);
      setTranscriptLength(0);
      try {
        const conversation = await findOrCreateConversation(activePatientId);
        if (cancelled) return;
        const rows = await listMessages(conversation.id);
        if (cancelled) return;
        const seed = messagesToTranscript(rows) as ChatMessage[];
        persistedIdsRef.current = new Set(seed.map((message) => message.id));
        // Los sembrados usan el uuid del backend como id local: la fila es él mismo.
        backendRowsRef.current = new Map(
          rows.map((row) => [row.id, { id: row.id, sequenceIndex: row.sequence_index }]),
        );
        conversationIdRef.current = conversation.id;
        setConversationId(conversation.id);
        setInitialMessages(seed);
        setTranscriptLength(seed.length);
      } catch {
        if (cancelled) return;
        // Degradación: sin persistencia el chat funciona, sólo no recuerda el historial.
        conversationIdRef.current = null;
        persistedIdsRef.current = new Set();
        backendRowsRef.current = new Map();
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
    // Refleja el tamaño del transcript para la transición chat-first (oculta el dashboard al primer
    // mensaje). Independiente de la persistencia: se actualiza haya o no conversación guardada.
    setTranscriptLength(messages.length);
    const conversation = conversationIdRef.current;
    if (!conversation) return;
    const pending = selectUnpersisted(messages, persistedIdsRef.current);
    if (pending.length === 0) return;
    // Actividad real del chat (mensajes nuevos, no el sembrado): sube al paciente al frente de
    // "Pacientes recientes" en el sidebar sin esperar una recarga.
    const activePatient = activePatientRef.current;
    if (activePatient) {
      bumpRecentChat(activePatient.id, activePatient.label);
    }
    for (const message of pending) {
      persistedIdsRef.current.add(message.id);
      const payload = toMessagePayload(conversation, message);
      appendQueueRef.current = appendQueueRef.current.then(async () => {
        try {
          const row = await appendMessage(payload);
          // Registra la fila creada: habilita borrar/reiniciar este mensaje más adelante.
          backendRowsRef.current.set(message.id, {
            id: row.id,
            sequenceIndex: row.sequence_index,
          });
        } catch {
          // Falló el guardado: desmarca para reintentar en el próximo cambio del transcript.
          persistedIdsRef.current.delete(message.id);
        }
      });
    }
  }, [bumpRecentChat]);

  // BORRAR mensajes seleccionados: baja lógica de cada fila persistida (los aún no persistidos
  // sólo desaparecen del transcript). Encolado en la cola de persistencia para no adelantarse a un
  // append en vuelo. Best-effort (degradación limpia): si falla, el mensaje ya no está en el
  // transcript y no se reintenta.
  const handleMessagesRemoved = useCallback((messageIds: readonly string[]): void => {
    for (const messageId of messageIds) {
      persistedIdsRef.current.delete(messageId);
      appendQueueRef.current = appendQueueRef.current.then(async () => {
        const row = backendRowsRef.current.get(messageId);
        if (!row) return;
        backendRowsRef.current.delete(messageId);
        try {
          await deleteMessage(row.id);
        } catch {
          // El backend revalida RBAC/vigencia; sin permiso o sin red, el hilo local ya se limpió.
        }
      });
    }
  }, []);

  // ESTADO DURABLE de un mensaje YA persistido (hoy: una interfaz ui.* usada tras el cierre del
  // turno → su tarjeta debe restaurarse contraída). Se re-serializa el payload del mensaje y se
  // PARCHEA su fila. Encolado en la cola de persistencia: si el append del mensaje aún está en
  // vuelo, el PATCH corre después (la fila ya existe). Best-effort presentacional: si falla, el
  // estado durable queda como estaba (la sesión en vivo no se afecta).
  const handleMessageUpdated = useCallback((message: ChatMessage): void => {
    const conversation = conversationIdRef.current;
    if (!conversation) return;
    const payload = toMessagePayload(conversation, message);
    appendQueueRef.current = appendQueueRef.current.then(async () => {
      const row = backendRowsRef.current.get(message.id);
      // Sin fila: el append falló o sigue pendiente; el reintento del append (diff del transcript)
      // ya llevará el estado actualizado del mensaje.
      if (!row) return;
      try {
        await updateMessagePayload(row.id, payload.payload ?? null);
      } catch {
        // El backend revalida RBAC/vigencia; sin permiso o sin red no se pierde nada clínico.
      }
    });
  }, []);

  // REINICIAR desde un mensaje (inclusive): reset en LOTE del backend desde su sequence_index.
  // También lo usan Recrear/Editar del panel: al truncar el transcript localmente, sin esto los
  // mensajes recortados reaparecerían al recargar (seguían persistidos). Si el mensaje aún no se
  // persistió, todo lo posterior tampoco (los append van en orden): no hay nada que borrar.
  const handleTruncateFrom = useCallback((messageId: string): void => {
    const conversation = conversationIdRef.current;
    if (!conversation) return;
    appendQueueRef.current = appendQueueRef.current.then(async () => {
      const row = backendRowsRef.current.get(messageId);
      if (!row) return;
      try {
        await resetConversation(conversation, row.sequenceIndex);
        for (const [localId, meta] of backendRowsRef.current) {
          if (meta.sequenceIndex >= row.sequenceIndex) {
            backendRowsRef.current.delete(localId);
            persistedIdsRef.current.delete(localId);
          }
        }
      } catch {
        // Best-effort: el transcript local ya quedó truncado.
      }
    });
  }, []);

  // REINICIAR conversaciones (menú de opciones del sidebar, para Inicio y cada paciente). El
  // sidebar sólo declara la intención (ChatNavProvider); aquí se resuelve, porque este componente
  // es quien conoce la conversación persistida. Si el chat reiniciado es el ACTIVO, además de la
  // baja en el backend se vacía el transcript remontando el panel (``resetGeneration`` en la key);
  // si es otro chat, sólo el backend (al abrirlo se sembrará ya vacío).
  const [resetGeneration, setResetGeneration] = useState(0);
  const lastResetIdRef = useRef(0);
  useEffect(() => {
    const fresh = chatResets.filter((request) => request.id > lastResetIdRef.current);
    if (fresh.length === 0) return;
    lastResetIdRef.current = fresh[fresh.length - 1].id;
    for (const request of fresh) {
      if (request.patientId === activePatientId) {
        persistedIdsRef.current = new Set();
        backendRowsRef.current = new Map();
        setInitialMessages([]);
        setTranscriptLength(0);
        setResetGeneration((generation) => generation + 1);
        const conversation = conversationIdRef.current;
        if (!conversation) continue;
        appendQueueRef.current = appendQueueRef.current.then(async () => {
          try {
            await resetConversation(conversation);
          } catch {
            // El backend rechazó el reinicio (p. ej. sin ``conversations:reset``): el transcript
            // local ya quedó vacío, pero el historial persistido reaparecería al recargar. Un
            // fallo aquí NO es degradación limpia; se avisa en vez de fingir éxito.
            window.alert(
              "No se pudo reiniciar la conversación en el servidor; el historial reaparecerá " +
                "al recargar. Verifica que tu rol tenga el permiso 'conversations:reset'.",
            );
          }
        });
      } else {
        // Chat NO activo: baja directa en el backend sobre su conversación más reciente, con la
        // misma selección que usa findOrCreateConversation (sin crear nada si no existe).
        void (async () => {
          try {
            const rows = await listConversations(request.patientId);
            const target = request.patientId
              ? rows[0]
              : rows.find((conversation) => conversation.patient_id === null);
            if (target) await resetConversation(target.id);
          } catch {
            // Igual que en el chat activo: un rechazo del backend dejaría el historial intacto
            // (reaparecería al abrir ese chat); se avisa en vez de fingir éxito. Si no hay
            // conversación persistida, ``target`` es undefined y no se llega aquí.
            window.alert(
              "No se pudo reiniciar la conversación en el servidor. Verifica que tu rol tenga " +
                "el permiso 'conversations:reset'.",
            );
          }
        })();
      }
    }
  }, [chatResets, activePatientId]);

  return (
    // Área principal del shell chat-first. La navegación está en la barra lateral única (0128); aquí
    // sólo el contenido del chat activo. En el inicio (agente global) la superficie de aterrizaje es
    // el dashboard de resumen; debajo, el chat global. En un paciente, su expediente + su chat.
    <div className="flex min-h-full flex-col gap-5">
      {/* Aterrizaje chat-first: en el agente global, el dashboard se muestra SÓLO con el chat vacío;
          al primer mensaje el chat ocupa el área (fiel a la transición del diseño). */}
      {activeContext === null && dashboard && transcriptLength === 0 && (
        <DashboardHome data={dashboard} onOpenPatient={openPatientById} />
      )}
      {/* Expediente del paciente activo: pestañas con la UI genérica del contrato, acotada al
          paciente. Reemplaza al dashboard cuando hay paciente; el chat sigue debajo. */}
      {activeContext !== null && (
        <PatientRecordPanel
          key={`record-${activeContext.patientId}`}
          patientId={activeContext.patientId}
          patientLabel={activeContext.patientLabel}
        />
      )}
      {/* Chat activo: el CopilotPanel existente, con contexto + historial controlados por el shell.
          Se remonta por conversación (key) para re-sembrar el historial al cambiar de chat. */}
      {loaded ? (
        <CopilotPanel
          key={`chat-${conversationId ?? chatKey}-${resetGeneration}`}
          activeContext={activeContext}
          onActiveContextChange={setActiveContext}
          embedded
          initialMessages={initialMessages}
          onMessagesChange={handleMessagesChange}
          onMessagesRemoved={handleMessagesRemoved}
          onTruncateFrom={handleTruncateFrom}
          onMessageUpdated={handleMessageUpdated}
        />
      ) : (
        <p className="m-auto text-sm text-[var(--tx2)]" role="status" aria-live="polite">
          Cargando conversación…
        </p>
      )}
    </div>
  );
}
