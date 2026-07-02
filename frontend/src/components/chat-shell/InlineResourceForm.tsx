"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ResourceFormFields } from "@/components/resources/ResourceFormFields";
import { RequiredHint } from "@/components/resources/FieldRequirement";
import { ApiRequestError } from "@/core/api/api-error";
import type { ResourceFormCapability, ResourceFormFieldCapability } from "@/core/api/contracts";
import {
  buildCreatePayload,
  buildMultipartPayload,
  buildUpdatePayload,
} from "@/core/resources/resource-form";
import { createResource, updateResource } from "@/core/resources/resource-mutation-client";

/**
 * Formulario de recurso INLINE en el chat/expediente (seam de "formularios humanos en el chat"). A
 * diferencia de las páginas /resources, al guardar NO navega ni llama al agente: escribe directo por
 * la API del recurso (RBAC server-side, auditado) y devuelve un RESUMEN al caller, que emite una nota
 * de contexto al hilo (el agente la verá en su próximo turno, sin gastar una llamada al modelo).
 *
 * Cubre crear (capacidad ``create``, JSON o multipart con archivo) y editar (``update`` JSON). El
 * esquema, validaciones de formato y allowlist de campos vienen del CONTRATO; el backend revalida.
 */
type FieldErrors = Record<string, string[]>;

function appendError(errors: FieldErrors, field: string, message: string): void {
  errors[field] = [...(errors[field] ?? []), message];
}

function mapFormErrors(
  error: ApiRequestError,
  allowedFields: Set<string>,
): { general: string | null; fields: FieldErrors } {
  if (error.status === 422 && error.body.errors) {
    const fields: FieldErrors = {};
    const general: string[] = [];
    for (const item of error.body.errors) {
      if (item.field && allowedFields.has(item.field)) {
        appendError(fields, item.field, item.message);
      } else {
        general.push(item.message);
      }
    }
    return { general: general.length > 0 ? general.join(" ") : null, fields };
  }
  if (error.status === 409) {
    return { general: "No se pudo guardar porque ya existe un dato equivalente.", fields: {} };
  }
  return { general: "No se pudo guardar. Inténtalo nuevamente.", fields: {} };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Resumen corto (label: valor) de hasta 3 campos no vacíos, para la nota de contexto. */
function summarizeValues(fields: readonly ResourceFormFieldCapability[], data: FormData): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (parts.length >= 3) break;
    const raw = data.get(field.name);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) parts.push(`${field.label}: ${value}`);
  }
  return parts.join(" · ");
}

export function InlineResourceForm({
  resourceLabel,
  mode,
  form,
  mutationUrl,
  initialValues = {},
  onCancel,
  onDone,
}: Readonly<{
  resourceLabel: string;
  mode: "create" | "update";
  form: ResourceFormCapability;
  /** Requerido en modo "update": URL de mutación ya resuelta (placeholder sustituido). */
  mutationUrl?: string;
  initialValues?: Record<string, unknown>;
  onCancel: () => void;
  /** Éxito: el caller emite la nota de contexto y refresca la lista. No navega. */
  onDone: (summary: string) => void;
}>) {
  const [pending, setPending] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const fileField = mode === "create" && form.transport === "multipart" ? form.file_field ?? null : null;
  const allowedFields = new Set(form.fields.map((field) => field.name));
  if (fileField) allowedFields.add(fileField.name);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setGeneralError(null);
    setFieldErrors({});

    try {
      const formData = new FormData(event.currentTarget);
      const summary = summarizeValues(form.fields, formData);

      if (mode === "update") {
        if (!mutationUrl) throw new Error("Falta la URL de actualización.");
        await updateResource(mutationUrl, form.method, buildUpdatePayload(form.fields, formData));
      } else if (fileField) {
        const file = formData.get(fileField.name);
        const hasFile = file instanceof File && file.size > 0;
        if (!hasFile && fileField.required) {
          setFieldErrors({ [fileField.name]: ["Selecciona un archivo."] });
          setPending(false);
          return;
        }
        if (hasFile && file.size > fileField.max_size_bytes) {
          setFieldErrors({
            [fileField.name]: [`El archivo supera el máximo (${formatBytes(fileField.max_size_bytes)}).`],
          });
          setPending(false);
          return;
        }
        await createResource(form, buildMultipartPayload(form.fields, formData, fileField));
      } else {
        await createResource(form, buildCreatePayload(form.fields, formData));
      }

      const verb = mode === "create" ? "Creó" : "Editó";
      onDone(summary ? `${verb} ${resourceLabel} — ${summary}` : `${verb} ${resourceLabel}`);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const parsed = mapFormErrors(error, allowedFields);
        setGeneralError(parsed.general);
        setFieldErrors(parsed.fields);
      } else {
        setGeneralError("No se pudo guardar. Inténtalo nuevamente.");
      }
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={`${mode === "create" ? "Crear" : "Editar"} ${resourceLabel}`}
      className="flex flex-col gap-4 rounded-[14px] border border-[var(--accent-bd)] bg-[var(--panel)] p-4 shadow-[var(--soft2)]"
    >
      <div className="text-[13.5px] font-semibold text-[var(--tx)]">
        {mode === "create" ? "Nuevo" : "Editar"}: {resourceLabel}
      </div>

      {generalError && (
        <div
          role="alert"
          className="rounded-[10px] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-[12.5px] text-[var(--danger)]"
        >
          {generalError}
        </div>
      )}

      {fileField && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`inline-${fileField.name}`} className="text-xs font-medium text-[var(--tx2)]">
            {fileField.label}
            <RequiredHint required={fileField.required} />
          </label>
          <input
            id={`inline-${fileField.name}`}
            name={fileField.name}
            type="file"
            required={fileField.required}
            accept={fileField.accepted_mime_types.join(",") || undefined}
            className="block w-full text-sm text-[var(--tx)] file:mr-3 file:rounded-[8px] file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--on-accent)]"
          />
          <p className="text-[11px] text-[var(--tx3)]">Tamaño máximo {formatBytes(fileField.max_size_bytes)}.</p>
          {fieldErrors[fileField.name]?.length ? (
            <p className="text-[11px] text-[var(--danger)]">{fieldErrors[fileField.name].join(" ")}</p>
          ) : null}
        </div>
      )}

      <ResourceFormFields fields={form.fields} fieldErrors={fieldErrors} initialValues={initialValues} />

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-[10px] border border-[var(--border)] px-3 py-2 text-[12.5px] font-medium text-[var(--tx2)] transition hover:bg-[var(--panel2)] disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
