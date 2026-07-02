"use client";

import { useState } from "react";

import { ExportDialog } from "./ExportDialog";

/** Botón de descarga de la toolbar: monta el diálogo de exportación bajo demanda. */
export function ExportButton({
  resourceName,
  defaultTitle,
}: Readonly<{ resourceName: string; defaultTitle: string }>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Exportar"
        title="Exportar (Excel / PDF)"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:border-[var(--accent-bd)] hover:text-[var(--accent-tx)]"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </button>
      {open ? (
        <ExportDialog
          resourceName={resourceName}
          defaultTitle={defaultTitle}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
