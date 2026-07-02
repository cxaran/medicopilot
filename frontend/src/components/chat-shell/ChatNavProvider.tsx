"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { ActiveClinicalContext } from "@/core/agent/active-context";
import type { ResourceFormSpec } from "@/core/agent/tools/ui-spec";
import { recentPatientFromLabel, type RecentPatient } from "@/core/chat-shell/recent-patients";

/**
 * Nota de CONTEXTO (no es un turno del agente). La emiten las acciones humanas (crear/editar un
 * recurso desde el expediente, acciones de fila en tabla/agenda): se añaden al hilo para que el
 * médico las vea y para que el agente las tenga EN CONTEXTO en su próximo turno, SIN gastar una
 * llamada al modelo. El `id` monótono permite consumir sólo las nuevas.
 *
 * ``target`` dirige la nota al hilo correcto (una acción hecha desde la agenda sobre el paciente B
 * no debe caer en el chat abierto del paciente A):
 *  - ``undefined`` (comodín): la consume el chat ACTIVO, sea cual sea — es el caso de las acciones
 *    inline del propio chat, que por construcción ocurren en el hilo correcto.
 *  - ``string``: sólo la consume el chat de ESE paciente (queda en cola hasta que se abra).
 *  - ``null``: sólo la consume el chat global del inicio.
 */
export type ContextNote = { id: number; text: string; target?: string | null };

/**
 * Solicitud de FORMULARIO en el chat: la emiten los botones "Nuevo"/"Editar" del expediente para
 * abrir el formulario OFICIAL del recurso DENTRO del chat del agente (mismo ``resource_form`` que usa
 * ``ui.open_resource_form``), en vez de inline en el panel. El chat la consume y la renderiza.
 *
 * ``target`` dirige el formulario al hilo correcto, con la MISMA semántica que ``ContextNote``:
 * ``undefined`` = lo consume el chat activo; ``string`` = sólo el chat de ese paciente; ``null`` =
 * sólo el chat global. El consumo es POR ID con retirada de la cola (``consumeChatForms``): sin
 * drenado, un formulario ya renderizado se reinyectaba en el SIGUIENTE chat abierto (el panel se
 * remonta por conversación y su marca de agua volvía a cero).
 */
export type ChatFormRequest = { id: number; spec: ResourceFormSpec; target?: string | null };

/**
 * Solicitud de REINICIO de un chat (menú de opciones del sidebar): vaciar el hilo del paciente
 * indicado (o del chat global con ``patientId`` nulo). La consume el ChatShell, que es quien
 * conoce la conversación persistida: limpia el transcript si es el chat activo y da de baja
 * lógica los mensajes en el backend. Borra historial de chat, nunca datos clínicos.
 */
export type ChatResetRequest = { id: number; patientId: string | null };

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
  /** Cola de notas de contexto pendientes (cada chat consume las suyas por ``target``). */
  contextNotes: readonly ContextNote[];
  /** Emite una nota de contexto (acción humana); NO dispara un turno del agente. ``target``
   *  dirige la nota (paciente | null=global | undefined=chat activo). */
  pushContextNote: (text: string, target?: string | null) => void;
  /** Retira de la cola las notas ya añadidas a un hilo (consumo por id, no por marca de agua:
   *  las notas dirigidas a OTRO chat permanecen en cola hasta que su chat se abra). */
  consumeContextNotes: (ids: readonly number[]) => void;
  /** Cola de formularios a abrir en el chat (cada chat consume los suyos por ``target``). */
  chatForms: readonly ChatFormRequest[];
  /** Abre el formulario oficial de un recurso DENTRO del chat del agente. ``target`` dirige el
   *  formulario (paciente | null=global | undefined=chat activo). */
  pushChatForm: (spec: ResourceFormSpec, target?: string | null) => void;
  /** Retira de la cola los formularios ya renderizados en un hilo (consumo por id; los dirigidos
   *  a OTRO chat permanecen en cola hasta que su chat se abra). */
  consumeChatForms: (ids: readonly number[]) => void;
  /** Contador que se incrementa al guardar un recurso; las listas del expediente lo observan para
   *  refrescarse (p. ej. tras crear/editar desde el formulario del chat). */
  recordVersion: number;
  bumpRecordVersion: () => void;
  /** Cola de reinicios de chat pendientes (los consume el ChatShell). */
  chatResets: readonly ChatResetRequest[];
  /** Pide reiniciar el chat del paciente (o el global con ``patientId`` nulo). */
  requestChatReset: (patientId: string | null) => void;
  /** Chats de paciente con actividad EN ESTA SESIÓN, de más a menos reciente. El sidebar los
   *  antepone a la lista servida para reflejar la actividad sin recargar; el orden durable lo da
   *  el servidor (conversaciones por ``-updated_at``) en la próxima carga. */
  recentChatBumps: readonly RecentPatient[];
  /** Marca actividad en el chat de un paciente (lo sube al frente de los recientes). */
  bumpRecentChat: (patientId: string, patientLabel: string) => void;
};

const ChatNavContext = createContext<ChatNavValue | null>(null);

// Tope de la cola: el chat consume al vuelo; sólo acotamos por si nadie está montado para consumir.
const MAX_NOTES = 50;

export function ChatNavProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [activeContext, setActiveContext] = useState<ActiveClinicalContext | null>(null);
  const [contextNotes, setContextNotes] = useState<readonly ContextNote[]>([]);
  const noteIdRef = useRef(0);

  const pushContextNote = useCallback((text: string, target?: string | null) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    noteIdRef.current += 1;
    const note: ContextNote = { id: noteIdRef.current, text: trimmed, target };
    setContextNotes((prev) => [...prev, note].slice(-MAX_NOTES));
  }, []);

  const consumeContextNotes = useCallback((ids: readonly number[]) => {
    if (ids.length === 0) return;
    const consumed = new Set(ids);
    setContextNotes((prev) => prev.filter((note) => !consumed.has(note.id)));
  }, []);

  const [chatForms, setChatForms] = useState<readonly ChatFormRequest[]>([]);
  const formIdRef = useRef(0);
  const pushChatForm = useCallback((spec: ResourceFormSpec, target?: string | null) => {
    formIdRef.current += 1;
    const request: ChatFormRequest = { id: formIdRef.current, spec, target };
    setChatForms((prev) => [...prev, request].slice(-MAX_NOTES));
  }, []);

  const consumeChatForms = useCallback((ids: readonly number[]) => {
    if (ids.length === 0) return;
    const consumed = new Set(ids);
    setChatForms((prev) => prev.filter((form) => !consumed.has(form.id)));
  }, []);

  const [recordVersion, setRecordVersion] = useState(0);
  const bumpRecordVersion = useCallback(() => setRecordVersion((v) => v + 1), []);

  const [chatResets, setChatResets] = useState<readonly ChatResetRequest[]>([]);
  const resetIdRef = useRef(0);
  const requestChatReset = useCallback((patientId: string | null) => {
    resetIdRef.current += 1;
    const request: ChatResetRequest = { id: resetIdRef.current, patientId };
    setChatResets((prev) => [...prev, request].slice(-MAX_NOTES));
  }, []);

  const [recentChatBumps, setRecentChatBumps] = useState<readonly RecentPatient[]>([]);
  const bumpRecentChat = useCallback((patientId: string, patientLabel: string) => {
    if (!patientId) return;
    const patient = recentPatientFromLabel(patientId, patientLabel);
    setRecentChatBumps((prev) => {
      // Ya está al frente: no re-renderizar el árbol por actividad repetida del mismo chat.
      if (prev[0]?.id === patient.id) return prev;
      return [patient, ...prev.filter((entry) => entry.id !== patient.id)].slice(0, MAX_NOTES);
    });
  }, []);

  const value = useMemo<ChatNavValue>(
    () => ({
      activeContext,
      setActiveContext,
      contextNotes,
      pushContextNote,
      consumeContextNotes,
      chatForms,
      pushChatForm,
      consumeChatForms,
      recordVersion,
      bumpRecordVersion,
      chatResets,
      requestChatReset,
      recentChatBumps,
      bumpRecentChat,
    }),
    [
      activeContext,
      contextNotes,
      pushContextNote,
      consumeContextNotes,
      chatForms,
      pushChatForm,
      consumeChatForms,
      recordVersion,
      bumpRecordVersion,
      chatResets,
      requestChatReset,
      recentChatBumps,
      bumpRecentChat,
    ],
  );
  return <ChatNavContext.Provider value={value}>{children}</ChatNavContext.Provider>;
}

export function useChatNav(): ChatNavValue {
  const context = useContext(ChatNavContext);
  if (!context) {
    throw new Error("useChatNav debe usarse dentro de ChatNavProvider");
  }
  return context;
}

/** Variante que no lanza si no hay provider (p. ej. CopilotPanel montado de forma aislada). */
export function useChatNavOptional(): ChatNavValue | null {
  return useContext(ChatNavContext);
}
