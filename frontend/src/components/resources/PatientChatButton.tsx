"use client";

import { useRouter } from "next/navigation";

import { useChatNav } from "@/components/chat-shell/ChatNavProvider";

/**
 * Acción ESPECIAL de la tabla de pacientes: ir al chat del agente para ese paciente. Fija el
 * contexto clínico activo (paciente) en el estado chat-first compartido y navega al inicio, donde
 * el chat del paciente se monta. Mismo mecanismo que la agenda y la barra lateral
 * (``setActiveContext`` + ``router.push("/")``); no carga PHI por su cuenta (sólo id + etiqueta que
 * el médico ya ve en la tabla).
 */
export function PatientChatButton({
  patientId,
  label,
}: Readonly<{ patientId: string; label: string }>) {
  const router = useRouter();
  const { setActiveContext } = useChatNav();

  const open = (): void => {
    setActiveContext({
      patientId,
      patientLabel: label,
      consultationId: null,
      consultationLabel: null,
    });
    router.push("/");
  };

  return (
    <button
      type="button"
      onClick={open}
      title={`Abrir el chat del agente para ${label}`}
      className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-2.5 py-1 text-sm font-semibold text-[var(--accent-tx)] transition hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" />
      </svg>
      Chat
    </button>
  );
}
