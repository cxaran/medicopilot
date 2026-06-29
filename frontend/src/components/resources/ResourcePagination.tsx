import Link from "next/link";

import type { ResourceListPage } from "@/core/resources/list-types";

const LINK_CLASS =
  "rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--tx2)] transition hover:bg-[var(--panel2)] hover:text-[var(--tx)]";
const DISABLED_CLASS =
  "rounded-[10px] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--tx3)] opacity-60";

export function ResourcePagination({
  prevHref,
  nextHref,
  pagination,
}: Readonly<{
  prevHref?: string;
  nextHref?: string;
  pagination: ResourceListPage["pagination"];
}>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-[var(--tx3)]">Total: {pagination.total} registros</p>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={LINK_CLASS} rel="prev">
            Anterior
          </Link>
        ) : (
          <span className={DISABLED_CLASS} aria-disabled="true">
            Anterior
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={LINK_CLASS} rel="next">
            Siguiente
          </Link>
        ) : (
          <span className={DISABLED_CLASS} aria-disabled="true">
            Siguiente
          </span>
        )}
      </div>
    </div>
  );
}
