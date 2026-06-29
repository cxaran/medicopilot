"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ResourceTable } from "@/components/resources/ResourceTable";
import type { ResourceCapability } from "@/core/api/contracts";
import {
  buildFilterableControls,
  buildSortHref,
  parseListQuery,
  type FilterableControls,
  type ResourceListQuery,
} from "@/core/resources/list-query";
import type { ResourceListPage } from "@/core/resources/list-types";
import {
  fetchResourceCapability,
  fetchResourceListPage,
} from "@/core/resources/embedded-list-client";

/**
 * Lista de un recurso del CONTRATO acotada al paciente activo, embebida en el record panel
 * (MP-CTRL-0125). Reusa el componente genérico ResourceTable (columnas, orden, acciones de fila,
 * Ver/Editar) tal cual; sólo lo envuelve en el chrome re-skineado del panel. El scope se aplica con
 * el MISMO mecanismo de filtros del contrato (operador EQ de patient_id, descubierto de la
 * capability). La interacción profunda (orden/filtros/paginación) y el CRUD (crear/editar) se
 * delegan a la ruta /resources existente vía enlaces, de modo que el P1/aprobaciones y los forms
 * capability-driven se conservan intactos. Aquí no se escribe nada.
 */

const PREVIEW_LIMIT = 5;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unsupported" }
  | {
      status: "ready";
      capability: ResourceCapability;
      controls: FilterableControls;
      query: ResourceListQuery;
      page: ResourceListPage;
      scopeParam: string;
    };

function eqParamFor(controls: FilterableControls, fieldKey: string): string | undefined {
  const field = controls.ordered.find((entry) => entry.key === fieldKey);
  return field?.operators.find((operator) => operator.key === "eq")?.parameterName;
}

export function PatientResourceList({
  resourceName,
  patientId,
}: Readonly<{ resourceName: string; patientId: string }>) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ status: "loading" });
      try {
        const capability = await fetchResourceCapability(resourceName);
        if (cancelled) return;
        if (capability.view !== "table" || !capability.list) {
          setState({ status: "unsupported" });
          return;
        }
        const controls = buildFilterableControls(capability.list);
        const scopeParam = eqParamFor(controls, "patient_id");
        if (!scopeParam) {
          setState({ status: "unsupported" });
          return;
        }
        const query = parseListQuery(
          { [scopeParam]: patientId, limit: String(PREVIEW_LIMIT) },
          capability.list,
          controls,
        );
        const page = await fetchResourceListPage(capability.api_path, query, controls);
        if (cancelled) return;
        setState({ status: "ready", capability, controls, query, page, scopeParam });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceName, patientId]);

  const moduleHref = `/resources/${encodeURIComponent(resourceName)}`;

  if (state.status === "loading") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--tx3)]">
        Cargando…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--tx2)]">
        No se pudo cargar este apartado.{" "}
        <Link href={moduleHref} className="font-medium text-[var(--accent-tx)] hover:underline">
          Abrir módulo
        </Link>
      </div>
    );
  }
  if (state.status === "unsupported") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--tx2)]">
        Este apartado no se puede acotar al paciente desde aquí.{" "}
        <Link href={moduleHref} className="font-medium text-[var(--accent-tx)] hover:underline">
          Abrir módulo
        </Link>
      </div>
    );
  }

  const { capability, controls, query, page, scopeParam } = state;
  const scopedModuleHref = `${moduleHref}?${scopeParam}=${encodeURIComponent(patientId)}`;
  const editEnabled = Boolean(
    capability.item_reference && capability.detail && capability.forms?.update,
  );
  const detailEnabled = Boolean(capability.item_reference && capability.detail);

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--soft)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold text-[var(--tx)]">{capability.label}</span>
        <div className="flex items-center gap-2">
          {capability.forms?.create && (
            <Link
              href={`${moduleHref}/new`}
              className="rounded-[10px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--accent-tx)] transition hover:bg-[var(--panel2)]"
            >
              Nuevo
            </Link>
          )}
          <Link
            href={scopedModuleHref}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--tx2)] transition hover:text-[var(--accent-tx)]"
          >
            Ver todo
          </Link>
        </div>
      </div>
      {/* ResourceTable genérico REUSADO: columnas/orden/acciones del contrato. El orden y el detalle
          enlazan a la ruta /resources (servidor) preservando el scope del paciente. */}
      <ResourceTable
        label=""
        list={capability.list!}
        page={page}
        explicitSort={query.sort}
        buildSortHref={(fieldName) => buildSortHref(moduleHref, query, controls, fieldName)}
        resourceName={resourceName}
        relations={capability.relations ?? []}
        actions={capability.actions ?? []}
        itemReference={capability.item_reference ?? null}
        editEnabled={editEnabled}
        detailEnabled={detailEnabled}
      />
    </div>
  );
}
