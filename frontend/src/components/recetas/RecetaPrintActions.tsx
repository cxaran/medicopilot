"use client";

/**
 * Barra de acciones (sólo pantalla) de la receta imprimible — MP-CTRL-0126. "Imprimir" abre el
 * diálogo nativo del navegador (window.print()); "Volver" regresa a la pantalla anterior. NO emite,
 * finaliza ni firma nada: la receta ya existe y esto sólo la imprime. La barra se oculta en la
 * impresión (clase ``receta-no-print``).
 */
export function RecetaPrintActions() {
  return (
    <div className="receta-no-print flex items-center gap-2">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2 text-[13px] font-medium text-[var(--tx2)] transition hover:text-[var(--tx)]"
      >
        Volver
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-[10px] border border-[var(--accent-bd)] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition hover:opacity-90"
      >
        Imprimir
      </button>
    </div>
  );
}
