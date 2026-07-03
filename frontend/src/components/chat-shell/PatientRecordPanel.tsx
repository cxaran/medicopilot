"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PatientDetailCard } from "@/components/chat-shell/PatientDetailCard";
import { PatientResourceList } from "@/components/chat-shell/PatientResourceList";
import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import { avatarColor } from "@/components/ui/avatar-color";
import { useSession } from "@/core/auth/SessionProvider";
import { browserApi } from "@/core/api/browser-client";
import {
  DEFAULT_RECORD_TAB,
  RECORD_TABS,
  recordTabDef,
  type RecordTabId,
} from "@/core/chat-shell/record-tabs";

const headerActionClass =
  "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--soft)] transition";

/** Sólo dígitos (formato que espera wa.me: código de país + número, sin símbolos). */
function waDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Expediente del paciente (record panel) del shell chat-first — MP-CTRL-0125. Re-skin del diseño
 * (pestañas Historia / Consultas / Signos / Recetas / Archivos / Citas). CADA pestaña renderiza la
 * UI genérica del CONTRATO (ResourceTable) acotada al paciente activo; no se hardcodean tablas,
 * columnas, formularios ni acciones. El CRUD y las escrituras (P1) se mantienen en las rutas
 * /resources existentes (enlaces "Nuevo"/"Ver todo"/Editar). Las pestañas Signos y Recetas usan
 * recursos que el contrato filtra por consulta (no por paciente): se explica y se enlaza al módulo
 * en vez de listar sin acotar (no se fugan datos de otros pacientes).
 */
export function PatientRecordPanel({
  patientId,
  patientLabel,
}: Readonly<{ patientId: string; patientLabel: string }>) {
  const { hasPermission } = useSession();
  const { pushChatForm, chatForms } = useChatNav();
  const [activeTab, setActiveTab] = useState<RecordTabId>(DEFAULT_RECORD_TAB);
  const [expanded, setExpanded] = useState(true);

  // Al abrir un formulario en el chat (Nuevo/Editar), CONTRAER el expediente para enfocar el chat con
  // el agente. Patrón "ajustar estado en render" (sin efecto): se compara el id del último formulario
  // encolado con el ya visto; ``seenFormId`` arranca en el último presente al montar (el panel se
  // remonta por paciente), así abrir un paciente NO lo contrae por formularios previos.
  const latestFormId = chatForms.length > 0 ? chatForms[chatForms.length - 1].id : 0;
  const [seenFormId, setSeenFormId] = useState(latestFormId);
  if (latestFormId > seenFormId) {
    setSeenFormId(latestFormId);
    setExpanded(false);
  }
  const [phone, setPhone] = useState<string | null>(null);
  const tab = recordTabDef(activeTab);
  const canEditPatient = hasPermission("patients:update");
  const canReconcileMeds = hasPermission("medication_reconciliation:read");
  // Inicial(es) para el avatar del expediente (mismo lenguaje visual que la barra lateral).
  const patientInitial = patientLabel
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  // Teléfono del paciente para los accesos WhatsApp/Llamar. Lectura del contrato (RBAC server-side):
  // si el rol no puede leerlo o no hay teléfono, los botones simplemente no aparecen (degradación
  // limpia). No bloquea el panel ni se reintenta.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const patient = await browserApi<{ phone?: string | null }>(
          `/api/v1/patients/${encodeURIComponent(patientId)}`,
        );
        if (!cancelled) setPhone(patient.phone?.trim() ? patient.phone.trim() : null);
      } catch {
        // Sin permiso o sin dato: no se muestran los accesos de contacto.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <section className="flex flex-col rounded-[16px] border border-[var(--border)] bg-[var(--bg2)]">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[16px] font-bold text-white"
          style={{ background: avatarColor(patientId) }}
        >
          {patientInitial}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[19px] font-semibold tracking-tight text-[var(--tx)]">
            {patientLabel}
          </h2>
          <p className="text-[12.5px] text-[var(--tx2)]">Expediente clínico</p>
        </div>
        {phone && (
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={`https://wa.me/${waDigits(phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Enviar WhatsApp · ${phone}`}
              aria-label="Enviar WhatsApp al paciente"
              className={`${headerActionClass} text-[#25d366] hover:bg-[rgba(37,211,102,0.12)]`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.52 0-3.01-.41-4.31-1.18l-.31-.18-3.2.84.85-3.12-.2-.32a8.21 8.21 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.23 3.7 8.23 8.24 0 4.54-3.69 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
              </svg>
            </a>
            <a
              href={`tel:${phone}`}
              title={`Llamar · ${phone}`}
              aria-label="Llamar al paciente"
              className={`${headerActionClass} text-[var(--accent-tx)] hover:bg-[var(--accent-dim)]`}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.1-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.5-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z" />
              </svg>
            </a>
          </div>
        )}
        {canEditPatient && (
          <button
            type="button"
            onClick={() =>
              pushChatForm(
                {
                  kind: "resource_form",
                  resource: "patients",
                  mode: "update",
                  resource_id: patientId,
                },
                patientId,
              )
            }
            title="Editar datos del paciente (abre el formulario en el chat)"
            className="flex shrink-0 items-center gap-1.5 rounded-[11px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12.5px] font-medium text-[var(--tx2)] shadow-[var(--soft)] transition hover:text-[var(--accent-tx)]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
            </svg>
            Editar paciente
          </button>
        )}
        {canReconcileMeds && (
          <Link
            href={`/patients/${encodeURIComponent(patientId)}/medication-reconciliation`}
            title="Conciliación de medicación (prescrito vs reportado)"
            className="flex shrink-0 items-center gap-1.5 rounded-[11px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12.5px] font-medium text-[var(--tx2)] shadow-[var(--soft)] transition hover:text-[var(--accent-tx)]"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="8" width="9" height="13" rx="2" />
              <path d="M7.5 8V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v13M12 12.5h4M14 10.5v4" />
            </svg>
            Medicación
          </Link>
        )}
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          title={expanded ? "Ocultar expediente" : "Mostrar expediente"}
          aria-label={expanded ? "Ocultar expediente" : "Mostrar expediente"}
          className="flex shrink-0 items-center justify-center rounded-[11px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[var(--tx2)] transition hover:text-[var(--accent-tx)]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            style={{ transition: "transform .25s", transform: expanded ? "none" : "rotate(-90deg)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </header>

      {expanded && (
        <>
          {/* Barra de pestañas (re-skin del diseño). */}
          <div className="mc-scroll-x mt-3 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-[var(--border)] px-3">
            {RECORD_TABS.map((definition) => {
              const active = definition.id === activeTab;
              return (
                <button
                  key={definition.id}
                  type="button"
                  onClick={() => setActiveTab(definition.id)}
                  aria-current={active ? "true" : undefined}
                  className={`-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] transition ${
                    active
                      ? "border-[var(--accent)] font-semibold text-[var(--tx)]"
                      : "border-transparent font-medium text-[var(--tx2)] hover:text-[var(--tx)]"
                  }`}
                >
                  {definition.label}
                </button>
              );
            })}
          </div>

          {/* Contenido de la pestaña en UNA sola superficie blanca (el ``section`` es el marco). Los
              recursos van aplanados —sin card propia ni divisor— separados sólo por el espacio y el
              título de cada apartado (el nuevo título ya da a entender el corte), para no anidar
              cards y recuperar espacio. La tabla de cada lista conserva su borde (marco de la tabla). */}
          <div className="flex flex-col gap-5 rounded-b-[16px] bg-[var(--panel)] p-4">
            {tab.resources.map((resource) =>
              resource.scope === "detail" ? (
                <PatientDetailCard key={resource.resourceName} patientId={patientId} />
              ) : (
                <PatientResourceList
                  key={resource.resourceName}
                  resourceName={resource.resourceName}
                  patientId={patientId}
                />
              ),
            )}
          </div>
        </>
      )}
    </section>
  );
}

