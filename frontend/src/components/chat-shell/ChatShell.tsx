"use client";

import { useState } from "react";

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { ActiveContextPicker } from "@/components/copilot/ActiveContextPicker";
import type { ActiveClinicalContext } from "@/core/agent/active-context";
import type { RecentPatient } from "@/core/chat-shell/recent-patients";

/**
 * Shell CHAT-FIRST (MP-CTRL-0122, rebanada 2 del rediseño). Materializa el modelo del diseño:
 * cada PACIENTE es un chat. El panel izquierdo es la lista de pacientes/chats (del CONTRATO de
 * recursos: las mismas filas de la tabla de pacientes) + el buscador (ActiveContextPicker, que ya
 * reusa la búsqueda de pacientes) + la entrada al AGENTE GLOBAL (sin paciente). El área principal
 * es el CHAT ACTIVO: reusa el CopilotPanel EXISTENTE tal cual (gateway/P1/tools/turns), sólo que
 * con su contexto clínico CONTROLADO por el shell.
 *
 * Mapa: elegir un paciente -> activeContext = ese paciente (su chat). «Agente global» -> sin
 * contexto (asistente general). El agente global puede redirigir al chat de un paciente porque la
 * selección (lista/buscador) fija el activeContext y el chat se reenfoca en ese paciente. No se
 * reescribe la lógica del chat: el shell sólo lo hospeda y le pasa el contexto.
 */
export function ChatShell({ recentPatients }: Readonly<{ recentPatients: readonly RecentPatient[] }>) {
  const [activeContext, setActiveContext] = useState<ActiveClinicalContext | null>(null);

  const openPatient = (patient: RecentPatient): void =>
    setActiveContext({
      patientId: patient.id,
      patientLabel: patient.label,
      consultationId: null,
      consultationLabel: null,
    });

  const activePatientId = activeContext?.patientId ?? null;

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

      {/* Chat activo: el CopilotPanel existente, con su contexto controlado por el shell. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <CopilotPanel
          activeContext={activeContext}
          onActiveContextChange={setActiveContext}
          hideContextPicker
        />
      </div>
    </div>
  );
}
