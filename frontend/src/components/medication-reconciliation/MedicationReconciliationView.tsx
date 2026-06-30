// Vista de la conciliación de medicación (server component, sólo lectura). Muestra las discrepancias
// MARCADAS para revisión y la medicación consolidada (prescrita + reportada). No muta nada: es apoyo
// a la decisión que el médico revisa. La lógica pura vive en core/medication-reconciliation.

import Link from "next/link";

import {
  medicationSource,
  sourceLabel,
  type MedicationReconciliation,
} from "@/core/medication-reconciliation/reconciliation";

export function MedicationReconciliationView({
  patientId,
  patientLabel,
  data,
  forbidden,
}: Readonly<{
  patientId: string;
  patientLabel?: string;
  data: MedicationReconciliation | null;
  forbidden: boolean;
}>) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--tx)]">
            Conciliación de medicación
          </h1>
          <p className="text-sm text-[var(--tx2)]">
            {patientLabel ? `Paciente: ${patientLabel}. ` : ""}Consolida lo prescrito y lo reportado
            y marca discrepancias para tu revisión. No modifica nada.
          </p>
        </div>
        <Link
          href={`/resources/patients/${encodeURIComponent(patientId)}`}
          className="rounded-[8px] border border-[var(--border2)] px-3 py-1.5 text-xs font-semibold text-[var(--tx2)] transition hover:bg-[var(--panel2)]"
        >
          Ver paciente
        </Link>
      </div>

      {forbidden ? (
        <Notice tone="warn">
          No tienes permiso para ver la conciliación de medicación (se requiere{" "}
          <code>medication_reconciliation:read</code>).
        </Notice>
      ) : !data ? (
        <Notice tone="warn">No se pudo cargar la conciliación de medicación.</Notice>
      ) : (
        <>
          {!data.resolver_available && (
            <Notice tone="info">
              La fuente de farmacología no está disponible: la de-duplicación por ingrediente/clase
              puede ser limitada y algunas discrepancias podrían no detectarse.
            </Notice>
          )}

          {/* Discrepancias marcadas */}
          <section className="flex flex-col gap-3 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-5">
            <h2 className="text-sm font-semibold text-[var(--tx)]">
              Discrepancias para revisión ({data.flag_count})
            </h2>
            {data.flags.length === 0 ? (
              <p className="text-sm text-[var(--tx3)]">No se marcaron discrepancias.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.flags.map((flag, index) => (
                  <li
                    key={`${flag.kind}-${index}`}
                    className="rounded-[10px] border border-[var(--warn)] bg-[var(--warn-dim,rgba(180,120,0,0.08))] p-3"
                  >
                    <p className="text-sm font-medium text-[var(--tx)]">{flag.message}</p>
                    {flag.ingredient_or_class && (
                      <p className="mt-0.5 text-xs text-[var(--tx3)]">
                        Ingrediente/clase: {flag.ingredient_or_class}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Medicación consolidada */}
          <section className="flex flex-col gap-3 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-5">
            <h2 className="text-sm font-semibold text-[var(--tx)]">
              Medicación consolidada ({data.consolidated.length})
            </h2>
            {data.consolidated.length === 0 ? (
              <p className="text-sm text-[var(--tx3)]">
                Sin medicación activa prescrita ni reportada.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border2)]">
                {data.consolidated.map((med) => (
                  <li key={med.key} className="flex flex-col gap-0.5 py-2.5">
                    <span className="text-sm font-medium text-[var(--tx)]">{med.display_name}</span>
                    <span className="text-xs text-[var(--tx2)]">
                      {sourceLabel(medicationSource(med))}
                      {med.ingredient_or_class ? ` · ${med.ingredient_or_class}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-[var(--tx3)]">
            Apoyo a la decisión: revisa y confirma. Esta vista no modifica el expediente.
          </p>
        </>
      )}
    </div>
  );
}

function Notice({
  tone,
  children,
}: Readonly<{ tone: "warn" | "info"; children: React.ReactNode }>) {
  const color = tone === "warn" ? "var(--warn)" : "var(--tx2)";
  return (
    <div className="rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-4">
      <p className="text-sm" style={{ color }}>
        {children}
      </p>
    </div>
  );
}
