"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "mp-theme";

type Theme = "light" | "dark";

// Store externo minimo sobre el atributo data-theme del <html>. Permite leer el
// tema con useSyncExternalStore (compatible con SSR/hidratacion, sin setState en
// effect) y notificar al alternarlo.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function setTheme(next: Theme): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Si localStorage no esta disponible, el cambio aplica solo para esta sesion.
  }
  listeners.forEach((listener) => listener());
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/**
 * Alterna el tema (data-theme en <html>) entre light y dark y persiste la
 * eleccion en localStorage. La preferencia se aplica antes del paint mediante el
 * script inline del root layout (sin parpadeo); aqui se refleja el icono.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title="Cambiar tema"
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)] text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)]"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
