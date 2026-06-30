"use client";

// Calculadora de escalas clínicas. Elige una escala registrada, captura sus insumos (boolean/enum/
// number según el contrato) y computa el puntaje server-side (determinista, sin estado). El
// resultado es APOYO A LA DECISIÓN que el médico confirma — NO es un diagnóstico. La validación
// final es del backend (422 nombrando campos); el cliente solo coerciona tipos y marca faltantes.

import { useMemo, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { computeScale } from "@/core/clinical-scales/scales-client";
import {
  buildComputePayload,
  hasNoErrors,
  initialInputValues,
  type ScaleComputeResult,
  type ScaleDefinition,
} from "@/core/clinical-scales/scales";

export function ScalesCalculator({ scales }: Readonly<{ scales: readonly ScaleDefinition[] }>) {
  const [selectedId, setSelectedId] = useState<string>(scales[0]?.id ?? "");
  const selected = useMemo(
    () => scales.find((scale) => scale.id === selectedId) ?? null,
    [scales, selectedId],
  );

  if (scales.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <Header />
        <p className="mt-4 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-6 text-sm text-[var(--warn)]">
          No hay escalas disponibles o no tienes permiso para usarlas (se requiere{" "}
          <code>clinical_scales:read</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
      <Header />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--tx)]">Escala</span>
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="rounded-[10px] border border-[var(--border2)] bg-[var(--panel2)] px-3 py-2 text-[var(--tx)]"
        >
          {scales.map((scale) => (
            <option key={scale.id} value={scale.id}>
              {scale.name}
            </option>
          ))}
        </select>
      </label>

      {selected && <ScaleForm key={selected.id} scale={selected} />}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-[var(--tx)]">Escalas clínicas</h1>
      <p className="text-sm text-[var(--tx2)]">
        Cómputo determinista de escalas validadas. El resultado es apoyo a la decisión que debes
        revisar y confirmar; no es un diagnóstico.
      </p>
    </div>
  );
}

function ScaleForm({ scale }: Readonly<{ scale: ScaleDefinition }>) {
  const [values, setValues] = useState<Record<string, string>>(() => initialInputValues(scale));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ScaleComputeResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  };

  async function submit() {
    const payload = buildComputePayload(scale, values);
    setErrors(payload.errors);
    setServerError(null);
    if (!hasNoErrors(payload)) {
      setResult(null);
      return;
    }
    setBusy(true);
    try {
      const computed = await computeScale(scale.id, payload.inputs);
      setResult(computed);
    } catch (error) {
      setResult(null);
      setServerError(
        error instanceof ApiRequestError
          ? error.message
          : "No se pudo computar la escala.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-5">
      <p className="text-sm text-[var(--tx2)]">{scale.description}</p>

      <div className="flex flex-col gap-3">
        {scale.inputs.map((input) => (
          <div key={input.key} className="flex flex-col gap-1">
            <label htmlFor={`scale-${input.key}`} className="text-sm font-medium text-[var(--tx)]">
              {input.label}
            </label>
            {input.description && (
              <span className="text-xs text-[var(--tx3)]">{input.description}</span>
            )}
            {input.type === "boolean" ? (
              <select
                id={`scale-${input.key}`}
                value={values[input.key]}
                onChange={(event) => set(input.key, event.target.value)}
                className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-2.5 py-1.5 text-sm text-[var(--tx)]"
              >
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            ) : input.type === "enum" ? (
              <select
                id={`scale-${input.key}`}
                value={values[input.key]}
                onChange={(event) => set(input.key, event.target.value)}
                className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-2.5 py-1.5 text-sm text-[var(--tx)]"
              >
                <option value="">— Selecciona —</option>
                {(input.allowed_values ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`scale-${input.key}`}
                type="number"
                inputMode="decimal"
                value={values[input.key]}
                min={input.min ?? undefined}
                max={input.max ?? undefined}
                onChange={(event) => set(input.key, event.target.value)}
                className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-2.5 py-1.5 text-sm text-[var(--tx)]"
              />
            )}
            {errors[input.key] && (
              <span role="alert" className="text-xs text-[var(--danger)]">
                {errors[input.key]}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-[10px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Calculando…" : "Calcular"}
        </button>
        <span className="text-xs text-[var(--tx3)]">Fuente: {scale.source}</span>
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {serverError}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[var(--accent-tx)]">{result.score}</span>
            <span className="text-sm font-semibold text-[var(--accent-tx)]">
              {result.interpretation_label}
            </span>
          </div>
          <p className="text-sm text-[var(--tx)]">{result.interpretation_detail}</p>
          {result.sources.length > 0 && (
            <p className="text-xs text-[var(--tx3)]">Fuentes: {result.sources.join(" · ")}</p>
          )}
          <p className="text-xs text-[var(--tx3)]">
            Apoyo a la decisión: revisa y confirma. No es un diagnóstico.
          </p>
        </div>
      )}
    </section>
  );
}
