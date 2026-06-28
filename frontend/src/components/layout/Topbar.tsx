import { AccountMenu } from "@/components/layout/AccountMenu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { SessionUser } from "@/core/auth/types";

// Barra superior del shell: identidad del usuario, toggle de tema y AccountMenu.
export function Topbar({ session }: Readonly<{ session: SessionUser }>) {
  return (
    <header className="flex h-[62px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--tx)]">Panel</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right text-sm sm:block">
          <p className="font-medium text-[var(--tx)]">{session.name}</p>
          <p className="text-[var(--tx3)]">{session.email}</p>
        </div>
        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
