import type { ReactNode } from "react";
import Link from "next/link";

import type {
  ItemReference,
  ResourceActionCapability,
  ResourceListCapability,
  ResourceRelationCapability,
} from "@/core/api/contracts";
import type { ResourceListPage } from "@/core/resources/list-types";
import type { ResourceListQuery } from "@/core/resources/list-query";
import { visibleActionsForRow } from "@/core/resources/resource-action";

import { ResourceRowActions } from "./ResourceRowActions";
import { formatCell } from "./format-cell";

function rowId(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === "string" && value !== "" ? value : null;
}

function SortableHeader({
  label,
  href,
  direction,
}: Readonly<{
  label: string;
  href: string;
  direction: "asc" | "desc" | null;
}>) {
  const indicator = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕";
  const described =
    direction === "asc" ? "ascendente" : direction === "desc" ? "descendente" : "sin orden";

  return (
    <Link
      href={href}
      aria-label={`Ordenar por ${label} (actual: ${described})`}
      className="inline-flex items-center gap-1 text-[var(--tx2)] transition hover:text-[var(--tx)]"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-xs text-[var(--tx3)]">
        {indicator}
      </span>
    </Link>
  );
}

export function ResourceTable({
  label,
  list,
  page,
  explicitSort,
  buildSortHref,
  resourceName,
  relations = [],
  actions = [],
  itemReference = null,
  editEnabled = false,
  detailEnabled = false,
  onEditInline,
  renderRowLead,
}: Readonly<{
  label: string;
  list: ResourceListCapability;
  page: ResourceListPage;
  explicitSort: ResourceListQuery["sort"];
  buildSortHref: (fieldName: string) => string;
  resourceName: string;
  relations?: ResourceRelationCapability[];
  actions?: ResourceActionCapability[];
  itemReference?: ItemReference | null;
  editEnabled?: boolean;
  detailEnabled?: boolean;
  // Opt-in: si se pasa, "Editar" abre el formulario INLINE (callback con id+fila) en vez de navegar
  // a /resources/.../edit. Las páginas /resources NO lo pasan → conservan la navegación de siempre.
  onEditInline?: (id: string, row: Record<string, unknown>) => void;
  // Acción ESPECIAL por fila, renderizada al inicio de la celda de acciones (p. ej. el botón de chat
  // del paciente). Opt-in: sólo lo pasa la tabla de pacientes; los demás recursos no se ven afectados.
  renderRowLead?: (id: string, row: Record<string, unknown>) => ReactNode;
}>) {
  const columns = list.fields.filter((field) => field.visible_in_list);
  const { items } = page;
  const idField = itemReference?.field ?? "id";
  const actionPlaceholder = itemReference?.placeholder ?? "id";
  const hasActions =
    detailEnabled || editEnabled || relations.length > 0 || actions.length > 0 || Boolean(renderRowLead);
  const totalColumns = columns.length + (hasActions ? 1 : 0);

  function itemHref(id: string, ...segments: string[]): string {
    const tail = segments.map((segment) => encodeURIComponent(segment)).join("/");
    return `/resources/${encodeURIComponent(resourceName)}/${encodeURIComponent(id)}/${tail}`;
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-[var(--tx)]">{label}</h2>
      </header>

      <div className="overflow-x-auto rounded-[12px] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--soft)]">
        <table className="min-w-full divide-y divide-[var(--border)] text-sm">
          <thead className="bg-[var(--panel2)]">
            <tr>
              {columns.map((column) => {
                const active =
                  explicitSort && explicitSort.field === column.name
                    ? explicitSort.direction
                    : null;
                return (
                  <th
                    key={column.name}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx2)]"
                  >
                    {column.sortable ? (
                      <SortableHeader
                        label={column.label}
                        href={buildSortHref(column.name)}
                        direction={active}
                      />
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              {hasActions ? (
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx2)]">
                  Acciones
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={totalColumns || 1}
                  className="px-4 py-8 text-center text-[var(--tx3)]"
                >
                  No hay registros.
                </td>
              </tr>
            ) : (
              items.map((row, rowIndex) => {
                const id = rowId(row, idField);
                // visible_when se evalúa client-side por fila: las acciones cuya
                // condición de estado no se cumple no se proyectan (guía de UI; el
                // backend revalida). enabled_when lo resuelve ResourceRowActions.
                const rowActions = visibleActionsForRow(actions, row);
                return (
                  <tr key={rowIndex} className="transition hover:bg-[var(--panel2)]">
                    {columns.map((column) => (
                      <td key={column.name} className="px-4 py-3 text-[var(--tx)]">
                        {formatCell(row[column.name], column.type)}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          {id && renderRowLead ? renderRowLead(id, row) : null}
                          {id && detailEnabled ? (
                            <Link
                              href={`/resources/${encodeURIComponent(resourceName)}/${encodeURIComponent(id)}`}
                              className="text-sm font-medium text-[var(--accent-tx)] underline-offset-2 hover:underline"
                            >
                              Ver
                            </Link>
                          ) : null}
                          {id && editEnabled ? (
                            onEditInline ? (
                              <button
                                type="button"
                                onClick={() => onEditInline(id, row)}
                                className="text-sm font-medium text-[var(--accent-tx)] underline-offset-2 hover:underline"
                              >
                                Editar
                              </button>
                            ) : (
                              <Link
                                href={itemHref(id, "edit")}
                                className="text-sm font-medium text-[var(--accent-tx)] underline-offset-2 hover:underline"
                              >
                                Editar
                              </Link>
                            )
                          ) : null}
                          {id
                            ? relations.map((relation) => (
                                <Link
                                  key={relation.name}
                                  href={itemHref(id, relation.name)}
                                  className="text-sm font-medium text-[var(--accent-tx)] underline-offset-2 hover:underline"
                                >
                                  {relation.label}
                                </Link>
                              ))
                            : null}
                          {id && rowActions.length > 0 ? (
                            <ResourceRowActions
                              placeholder={actionPlaceholder}
                              id={id}
                              actions={rowActions}
                              item={row}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
