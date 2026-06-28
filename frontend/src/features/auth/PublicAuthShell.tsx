import Link from "next/link";

import { Card } from "@/components/ui/Card";

/** Marco visual común a las páginas públicas de auth (tarjeta centrada, tokens). */
export function PublicAuthShell({
  title,
  description,
  children,
  footer,
}: Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10 text-[var(--tx)]">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--accent)] text-base font-bold text-[var(--on-accent)]">
            M
          </span>
          <div>
            <p className="text-sm text-[var(--tx3)]">MediCopilot</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--tx)]">{title}</h1>
            {description ? <p className="mt-1 text-sm text-[var(--tx2)]">{description}</p> : null}
          </div>
        </div>
        {children}
        {footer ? <div className="mt-6 text-sm text-[var(--tx2)]">{footer}</div> : null}
      </Card>
    </main>
  );
}

export function AuthLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--accent-tx)] underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

/**
 * Mensaje de estado en bloque (error/ok) con tokens de tema. Reutilizable por los
 * formularios públicos para no duplicar estilos; soporta light y dark.
 */
export function AuthAlert({
  tone,
  role = "status",
  children,
}: Readonly<{ tone: "danger" | "ok"; role?: "alert" | "status"; children: React.ReactNode }>) {
  const toneClass =
    tone === "danger"
      ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
      : "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_13%,transparent)] text-[var(--ok)]";
  return (
    <div role={role} className={`rounded-[11px] border px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </div>
  );
}

/** Label estándar de los formularios públicos. */
export function AuthLabel({
  htmlFor,
  children,
}: Readonly<{ htmlFor: string; children: React.ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--tx2)]">
      {children}
    </label>
  );
}
