"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logout } from "@/core/auth/account-mutation-client";

/**
 * Controles de identidad del shell autenticado: acceso a "Mi cuenta" y cierre de
 * sesión. El logout llama al backend (borra la cookie httponly) y redirige a login;
 * cualquier error igualmente termina en login para no dejar al usuario atrapado.
 */
export function AccountMenu() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } catch {
      // El logout es idempotente desde la perspectiva del usuario: ante cualquier
      // error igual se le envía a login.
    }
    router.replace("/login");
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/account"
        className="text-sm font-medium text-[var(--tx2)] underline-offset-2 hover:text-[var(--tx)] hover:underline"
      >
        Mi cuenta
      </Link>
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        className="rounded-[10px] border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Cerrando..." : "Cerrar sesión"}
      </button>
    </div>
  );
}
