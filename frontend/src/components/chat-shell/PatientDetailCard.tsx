"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useChatNav } from "@/components/chat-shell/ChatNavProvider";
import { browserApi } from "@/core/api/browser-client";
import type { ResourceCapability } from "@/core/api/contracts";
import { fetchResourceCapability } from "@/core/resources/embedded-list-client";
import { fillPlaceholder } from "@/core/resources/item-reference";
import {
  displayFields,
  formatDisplayValue,
  isBlankDisplay,
} from "@/core/resources/resource-detail-view";

/**
 * Ficha de DATOS GENERALES del paciente en el record panel (pestaña "Datos generales"). Detalle de
 * SOLO LECTURA del recurso ``patients`` guiado por capability: los campos salen del contrato
 * (misma metadata que el formulario, vía ``displayFields``) y el RBAC lo aplica el backend (sin
 * permiso de detalle, degradación honesta con enlace al módulo). No duplica el motor de detalle:
 * reusa el modelo de presentación de /resources/{id}, sólo con el chrome/tokens del panel (la
 * página vieja usa clases slate fijas que desentonan con el tema). Se recarga con
 * ``recordVersion`` para reflejar el guardado del formulario "Editar paciente" del chat.
 */

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unsupported" }
  | { status: "ready"; capability: ResourceCapability; detail: Record<string, unknown> };

export function PatientDetailCard({ patientId }: Readonly<{ patientId: string }>) {
  const { recordVersion } = useChatNav();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ status: "loading" });
      try {
        const capability = await fetchResourceCapability("patients");
        if (cancelled) return;
        if (!capability.detail || !capability.item_reference) {
          setState({ status: "unsupported" });
          return;
        }
        const detailUrl = fillPlaceholder(
          capability.detail.url_template,
          capability.item_reference.placeholder,
          patientId,
        );
        const detail = await browserApi<Record<string, unknown>>(detailUrl, { method: "GET" });
        if (cancelled) return;
        setState({ status: "ready", capability, detail });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, recordVersion]);

  const fichaHref = `/resources/patients/${encodeURIComponent(patientId)}`;

  if (state.status === "loading") {
    return <div className="text-[13px] text-[var(--tx3)]">Cargando…</div>;
  }
  if (state.status === "error" || state.status === "unsupported") {
    return (
      <div className="text-[13px] text-[var(--tx2)]">
        No se pudieron cargar los datos del paciente.{" "}
        <Link href={fichaHref} className="font-medium text-[var(--accent-tx)] hover:underline">
          Abrir ficha
        </Link>
      </div>
    );
  }

  const { capability, detail } = state;
  // Sólo los campos CON dato: si no existe, no se muestra (no se deja el "—"). Se formatea una vez y
  // se descartan los vacíos (null/undefined/cadena vacía/guion), ahorrando espacio y ruido visual.
  const shown = displayFields(capability)
    .map((field) => ({ field, value: formatDisplayValue(field, detail[field.name]) }))
    .filter((entry) => !isBlankDisplay(entry.value));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-[var(--tx)]">Datos generales</span>
        <Link
          href={fichaHref}
          className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--tx2)] transition hover:text-[var(--accent-tx)]"
        >
          Ver ficha
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="text-[13px] text-[var(--tx3)]">Sin datos generales registrados.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {shown.map(({ field, value }) => (
            <div key={field.name} className="min-w-0">
              <dt className="text-[12px] font-medium text-[var(--tx3)]">{field.label}</dt>
              <dd className="mt-0.5 break-words text-[13.5px] text-[var(--tx)]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
