"use client";

import { useState } from "react";

import { RecetaDialog } from "@/components/recetas/RecetaDialog";

/**
 * Botón "Imprimir receta" que abre el diálogo de impresión (vista previa del PDF construido +
 * opciones) EN CONTEXTO. Se usa en la ficha del recurso ``prescriptions``. El PDF se genera con jsPDF
 * en el diálogo (``RecetaDialog`` → ``receta-pdf.ts``); no hay ruta HTML de impresión separada.
 */
export function RecetaPrintButton({
  prescriptionId,
  className,
}: Readonly<{ prescriptionId: string; className?: string }>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
        }
      >
        Imprimir receta
      </button>
      {open && <RecetaDialog prescriptionId={prescriptionId} onClose={() => setOpen(false)} />}
    </>
  );
}
