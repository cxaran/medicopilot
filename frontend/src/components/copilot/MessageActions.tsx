"use client";

import { useState, type ReactNode } from "react";

// Acciones por mensaje (diseño minimalista): botones-icono fantasma, discretos, que aparecen al
// pasar el cursor sobre el mensaje (o al enfocar con teclado). Sin librería de iconos: SVG en línea,
// coherentes con el resto del copiloto.
//
//  - Agente: copiar · compartir · recrear (regenerar la respuesta) · reiniciar desde aquí · eliminar.
//  - Usuario: copiar · editar (cargar el mensaje al composer para reenviarlo) · reiniciar desde
//    aquí · eliminar.
//
// Copiar y compartir son autónomos (Clipboard / Web Share API con respaldo a copiar). Recrear,
// editar, reiniciar-desde-aquí y eliminar los provee el panel (gestión del hilo en sitio; borrar
// historial de chat nunca toca datos clínicos).

type Variant = "agent" | "user";

const ICON = {
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  check: <path d="M5 12.5l4 4 10-10" />,
  share: (
    <>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </>
  ),
  regenerate: (
    <>
      <path d="M20 11a8 8 0 1 0-1.6 5.5" />
      <path d="M20 4v5h-5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M13.5 6.5l3 3" />
    </>
  ),
  resetFrom: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
} as const;

function Glyph({ paths }: Readonly<{ paths: ReactNode }>) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

const BTN_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--tx3)] transition " +
  "hover:bg-[var(--panel2)] hover:text-[var(--tx)] disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-transparent disabled:hover:text-[var(--tx3)]";

export function MessageActions({
  text,
  variant,
  onRegenerate,
  onEdit,
  onDelete,
  onResetFrom,
  disabled = false,
}: Readonly<{
  text: string;
  variant: Variant;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onResetFrom?: () => void;
  disabled?: boolean;
}>) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles: no se interrumpe el flujo.
    }
  };

  const share = async (): Promise<void> => {
    // Web Share API (móvil/desktop compatibles); si no existe, respaldo a copiar.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelado por el usuario o no permitido: respaldo silencioso a copiar.
      }
    }
    await copy();
  };

  return (
    <div
      className={`mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 ${
        variant === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <button
        type="button"
        onClick={() => void copy()}
        title={copied ? "Copiado" : "Copiar"}
        aria-label={copied ? "Copiado" : "Copiar mensaje"}
        className={BTN_CLASS}
      >
        <Glyph paths={copied ? ICON.check : ICON.copy} />
      </button>

      {variant === "agent" && (
        <>
          <button
            type="button"
            onClick={() => void share()}
            title="Compartir"
            aria-label="Compartir mensaje"
            className={BTN_CLASS}
          >
            <Glyph paths={ICON.share} />
          </button>
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={disabled}
              title="Recrear"
              aria-label="Recrear respuesta"
              className={BTN_CLASS}
            >
              <Glyph paths={ICON.regenerate} />
            </button>
          )}
        </>
      )}

      {variant === "user" && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          title="Editar"
          aria-label="Editar mensaje"
          className={BTN_CLASS}
        >
          <Glyph paths={ICON.edit} />
        </button>
      )}

      {onResetFrom && (
        <button
          type="button"
          onClick={onResetFrom}
          disabled={disabled}
          title="Reiniciar desde aquí"
          aria-label="Reiniciar la conversación desde este mensaje"
          className={BTN_CLASS}
        >
          <Glyph paths={ICON.resetFrom} />
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          title="Eliminar"
          aria-label="Eliminar mensaje"
          className={BTN_CLASS}
        >
          <Glyph paths={ICON.trash} />
        </button>
      )}
    </div>
  );
}
