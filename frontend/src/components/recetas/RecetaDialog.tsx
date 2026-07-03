"use client";

import { useEffect, useRef, useState } from "react";

import { loadRecetaView } from "@/core/recetas/receta-data-client";
import type { RecetaView } from "@/core/recetas/receta-print";
import {
  recetaPdfBlob,
  recetaPdfPreviewUrl,
  type RecetaPdfConfig,
  type RecetaPdfPageSize,
} from "@/core/recetas/receta-pdf";

/**
 * Diálogo de impresión de una RECETA, con el mismo patrón que el diálogo de exportar de la tabla:
 * opciones a la izquierda y VISTA PREVIA EN VIVO del PDF a la derecha. El PDF se CONSTRUYE con jsPDF
 * (``receta-pdf.ts``) a partir de la vista compuesta del contrato (``loadRecetaView``) y se regenera
 * con debounce en un <iframe> (bloburl). "Descargar" baja ese mismo PDF; "Imprimir" abre el diálogo
 * del navegador sobre el PDF de la vista previa. SÓLO LECTURA: no emite, finaliza ni firma nada.
 */

const PAGE_SIZE_OPTIONS: ReadonlyArray<readonly [RecetaPdfPageSize, string]> = [
  ["letter", "Carta (216 × 279 mm)"],
  ["a4", "A4 (210 × 297 mm)"],
  ["legal", "Oficio (216 × 356 mm)"],
];

const SECTION_TITLE = "text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--tx3)]";
const LABEL_CLASS = "mb-1 block text-[11.5px] font-medium text-[var(--tx3)]";
const INPUT_CLASS =
  "w-full rounded-[9px] border border-[var(--border2)] bg-[var(--bg2)] px-2.5 py-1.5 text-[13px] text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)]";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RecetaDialog({
  prescriptionId,
  onClose,
}: Readonly<{ prescriptionId: string; onClose: () => void }>) {
  const [view, setView] = useState<RecetaView | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [pageSize, setPageSize] = useState<RecetaPdfPageSize>("letter");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const pdfUrlRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);

  const config: RecetaPdfConfig = { pageSize, orientation };

  // Carga de la vista de la receta (lecturas del contrato).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadRecetaView(prescriptionId);
        if (cancelled) return;
        if (!loaded) setLoadError(true);
        else setView(loaded);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prescriptionId]);

  // Vista previa: regenera el PDF con debounce y publica el bloburl en el iframe.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const url = await recetaPdfPreviewUrl(view, { pageSize, orientation });
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = url;
          setPreviewLoaded(false);
          setPdfUrl(url);
        } catch {
          if (!cancelled) setPdfUrl(null);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, pageSize, orientation]);

  // Revocar el bloburl al desmontar.
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  // Escape cierra.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filename = `receta-${view?.folio ?? prescriptionId}.pdf`;

  const download = async (): Promise<void> => {
    if (!view || busy) return;
    setBusy(true);
    try {
      downloadBlob(await recetaPdfBlob(view, config), filename);
    } finally {
      setBusy(false);
    }
  };

  // Imprime el PDF de la vista previa (bloburl same-origin → contentWindow.print).
  const print = (): void => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    } else if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener");
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[100] bg-[rgba(20,17,16,0.4)]"
        onPointerDown={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Imprimir receta"
        className="fixed left-1/2 top-1/2 z-[101] flex max-h-[90vh] w-[min(1000px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--elev)] shadow-[var(--shadow)]"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[15px] font-semibold text-[var(--tx)]">Imprimir receta</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-[8px] p-1.5 text-[var(--tx3)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {loadError ? (
          <div className="p-6 text-sm text-[var(--tx2)]">No se pudo cargar la receta.</div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
            {/* Opciones */}
            <div className="min-h-0 space-y-4 overflow-y-auto p-4 md:border-r md:border-[var(--border)]">
              <section className="space-y-2.5">
                <p className={SECTION_TITLE}>Opciones de PDF</p>
                <div>
                  <label htmlFor="receta-pagesize" className={LABEL_CLASS}>
                    Tamaño de página
                  </label>
                  <select
                    id="receta-pagesize"
                    value={pageSize}
                    onChange={(event) => setPageSize(event.target.value as RecetaPdfPageSize)}
                    className={INPUT_CLASS}
                  >
                    {PAGE_SIZE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="receta-orientation" className={LABEL_CLASS}>
                    Orientación
                  </label>
                  <select
                    id="receta-orientation"
                    value={orientation}
                    onChange={(event) =>
                      setOrientation(event.target.value as "portrait" | "landscape")
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="portrait">Vertical</option>
                    <option value="landscape">Horizontal</option>
                  </select>
                </div>
              </section>

              <section className="rounded-[10px] border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-[12.5px] text-[var(--tx2)]">
                Documento de sólo lectura de una receta ya existente. Descárgalo como PDF o imprímelo
                eligiendo tu impresora en el diálogo del navegador.
              </section>
            </div>

            {/* Vista previa en vivo del PDF construido */}
            <div className="flex min-h-[280px] flex-col bg-[var(--bg2)]">
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <p className={SECTION_TITLE}>Vista previa</p>
                {!view || !pdfUrl ? (
                  <p className="text-[11px] text-[var(--tx3)]">Generando…</p>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4 pt-2">
                {pdfUrl ? (
                  <iframe
                    ref={iframeRef}
                    title="Vista previa de la receta"
                    src={pdfUrl}
                    onLoad={() => setPreviewLoaded(true)}
                    className="h-full min-h-[440px] w-full rounded-[10px] border border-[var(--border)] bg-white"
                  />
                ) : (
                  <p className="text-[13px] text-[var(--tx3)]">Generando vista previa…</p>
                )}
              </div>
            </div>
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--tx2)] transition hover:bg-[var(--panel2)]"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={!view || busy}
            className="rounded-[10px] border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--tx)] transition hover:bg-[var(--panel2)] disabled:opacity-50"
          >
            Descargar PDF
          </button>
          <button
            type="button"
            onClick={print}
            disabled={!pdfUrl || !previewLoaded}
            className="rounded-[10px] bg-[var(--accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--on-accent)] shadow-[var(--soft)] transition hover:brightness-105 disabled:opacity-50"
          >
            Imprimir
          </button>
        </footer>
      </div>
    </>
  );
}
