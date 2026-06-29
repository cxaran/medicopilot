"use client";

import { useState } from "react";
import Link from "next/link";

import { PatientResourceList } from "@/components/chat-shell/PatientResourceList";
import {
  DEFAULT_RECORD_TAB,
  RECORD_TABS,
  recordTabDef,
  type RecordTabId,
} from "@/core/chat-shell/record-tabs";

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
  const [activeTab, setActiveTab] = useState<RecordTabId>(DEFAULT_RECORD_TAB);
  const tab = recordTabDef(activeTab);

  return (
    <section className="flex flex-col rounded-[16px] border border-[var(--border)] bg-[var(--bg2)]">
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-[var(--tx)]">{patientLabel}</h2>
          <p className="text-[12px] text-[var(--tx3)]">Expediente clínico</p>
        </div>
      </header>

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

      <div className="flex flex-col gap-3 p-4">
        {tab.resources.map((resource) =>
          resource.scope === "patient" ? (
            <PatientResourceList
              key={resource.resourceName}
              resourceName={resource.resourceName}
              patientId={patientId}
            />
          ) : (
            <ConsultationScopedNotice
              key={resource.resourceName}
              resourceName={resource.resourceName}
              tabLabel={tab.label}
              onGoConsultas={() => setActiveTab("consultas")}
            />
          ),
        )}
      </div>
    </section>
  );
}

/**
 * Aviso para recursos que el contrato acota por CONSULTA (signos vitales, recetas): no se listan sin
 * acotar para no fugar datos de otros pacientes; se dirige a las consultas del paciente o al módulo.
 */
function ConsultationScopedNotice({
  resourceName,
  tabLabel,
  onGoConsultas,
}: Readonly<{ resourceName: string; tabLabel: string; onGoConsultas: () => void }>) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--tx2)]">
      <p>
        {tabLabel} se registran <strong>por consulta</strong>. Abre una consulta del paciente para
        ver o capturar este apartado.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onGoConsultas}
          className="rounded-[10px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--accent-tx)] transition hover:bg-[var(--panel2)]"
        >
          Ir a Consultas
        </button>
        <Link
          href={`/resources/${encodeURIComponent(resourceName)}`}
          className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--tx2)] transition hover:text-[var(--accent-tx)]"
        >
          Abrir módulo
        </Link>
      </div>
    </div>
  );
}
