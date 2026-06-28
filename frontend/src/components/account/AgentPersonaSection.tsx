"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiRequestError } from "@/core/api/api-error";
import type { AgentPersonaRead } from "@/core/api/contracts";
import { getAgentPersona, updateAgentPersona } from "@/core/agent-persona/agent-persona-client";
import { FIXED_CLINICAL_SAFETY } from "@/core/agent/persona";

const textareaClass =
  "w-full rounded-[11px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2.5 text-sm text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)] focus:shadow-[var(--glow)] disabled:cursor-not-allowed disabled:opacity-60";

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function AgentPersonaSection() {
  const [persona, setPersona] = useState<AgentPersonaRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getAgentPersona()
      .then((data) => {
        if (active) setPersona(data);
      })
      .catch(() => {
        if (active) setLoadError("No se pudo cargar tu persona del copiloto.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    setSaved(false);

    const data = new FormData(event.currentTarget);
    try {
      const updated = await updateAgentPersona({
        tone: optionalText(data.get("tone")),
        specialty_focus: optionalText(data.get("specialty_focus")),
        language_locale: optionalText(data.get("language_locale")),
        consultation_style: optionalText(data.get("consultation_style")),
      });
      setPersona(updated);
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setFormError("Revisa los datos de la persona (longitud máxima excedida).");
      } else {
        setFormError("No se pudo guardar la persona. Inténtalo nuevamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label="Persona del copiloto"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Persona del copiloto</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ajusta cómo te responde el copiloto. La capa de seguridad clínica es fija: define los
          límites del asistente y no puede modificarse ni desactivarse.
        </p>
      </div>

      {/* Capa de seguridad clínica: SOLO LECTURA (propiedad del código) */}
      <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--tx)]">
            Capa de seguridad clínica (fija, no editable)
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Solo lectura
          </span>
        </div>
        <pre
          aria-label="Capa de seguridad clínica"
          className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[var(--bg2)] p-3 text-xs text-[var(--tx2)]"
        >
          {FIXED_CLINICAL_SAFETY}
        </pre>
      </div>

      {/* Persona configurable: EDITABLE por el médico */}
      <form
        onSubmit={onSubmit}
        aria-label="Editar persona del copiloto"
        className="space-y-3 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5"
      >
        <p className="text-sm font-semibold text-[var(--tx)]">Persona (preferencias)</p>
        {formError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        {saved ? (
          <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Persona guardada.
          </div>
        ) : null}
        {loadError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--tx2)]">Cargando...</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-[var(--tx)]">Tono</span>
                <Input
                  name="tone"
                  maxLength={500}
                  defaultValue={persona?.tone ?? ""}
                  placeholder="Breve y cordial"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-[var(--tx)]">Enfoque de especialidad</span>
                <Input
                  name="specialty_focus"
                  maxLength={500}
                  defaultValue={persona?.specialty_focus ?? ""}
                  placeholder="Pediatría"
                />
              </label>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--tx)]">Idioma / locale</span>
              <Input
                name="language_locale"
                maxLength={100}
                defaultValue={persona?.language_locale ?? ""}
                placeholder="es-MX"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-[var(--tx)]">Estilo de consulta</span>
              <textarea
                name="consultation_style"
                rows={3}
                maxLength={1000}
                defaultValue={persona?.consultation_style ?? ""}
                placeholder="Resúmenes con encabezados; prioriza signos de alarma."
                className={textareaClass}
              />
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar persona"}
            </Button>
          </>
        )}
      </form>
    </section>
  );
}
