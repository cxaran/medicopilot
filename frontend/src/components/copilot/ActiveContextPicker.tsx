"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ResourceRow } from "@/core/resources/list-types";
import {
  relationItemId,
  relationItemLabel,
  relationItemSecondary,
  resolveRelationTarget,
  type RelationTarget,
} from "@/core/resources/relation-picker";
import {
  fetchRelationMeta,
  searchRelationItems,
  type RelationSearchMeta,
} from "@/core/resources/relation-search-client";
import type { ActiveClinicalContext } from "@/core/agent/active-context";

/**
 * Selector de CONTEXTO CLÍNICO ACTIVO del copiloto (paciente + consulta opcional). Reusa la
 * infraestructura del selector de relación F5 (relation-search-client + relation-picker:
 * patient_id -> patients, consultation_id -> consultations) en vez de pegar UUIDs a mano. A
 * diferencia del campo de formulario (que escribe en un input oculto), aquí es CONTROLADO: al
 * elegir/limpiar invoca ``onChange`` con el contexto activo. Sólo fija el ámbito; no carga PHI
 * del expediente por su cuenta.
 */
export function ActiveContextPicker({
  context,
  onChange,
}: Readonly<{
  context: ActiveClinicalContext | null;
  onChange: (context: ActiveClinicalContext | null) => void;
}>) {
  const patientTarget = resolveRelationTarget("patient_id");
  const consultationTarget = resolveRelationTarget("consultation_id");

  function choosePatient(item: ResourceRow, target: RelationTarget) {
    const id = relationItemId(item);
    if (!id) {
      return;
    }
    onChange({
      patientId: id,
      patientLabel: relationItemLabel(item, target),
      consultationId: null,
      consultationLabel: null,
    });
  }

  function chooseConsultation(item: ResourceRow, target: RelationTarget) {
    if (!context) {
      return;
    }
    const id = relationItemId(item);
    if (!id) {
      return;
    }
    onChange({
      ...context,
      consultationId: id,
      consultationLabel: relationItemLabel(item, target),
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--border2)] bg-[var(--panel2)] px-3.5 py-2.5 text-xs text-[var(--tx2)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide">Contexto del paciente</span>
        {context && (
          <Button type="button" onClick={() => onChange(null)} className="shrink-0">
            Quitar
          </Button>
        )}
      </div>

      {!context ? (
        patientTarget ? (
          <RelationSearchBox
            target={patientTarget}
            placeholder="Buscar paciente por nombre…"
            label="Paciente"
            onChoose={choosePatient}
          />
        ) : (
          <p>No hay un selector de pacientes disponible.</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p>
            Paciente activo: <span className="font-semibold">{context.patientLabel}</span>
          </p>
          {context.consultationId ? (
            <p>
              Consulta: <span className="font-semibold">{context.consultationLabel}</span>{" "}
              <button
                type="button"
                onClick={() =>
                  onChange({ ...context, consultationId: null, consultationLabel: null })
                }
                className="underline hover:text-[var(--tx)]"
              >
                quitar consulta
              </button>
            </p>
          ) : consultationTarget ? (
            <RelationSearchBox
              target={consultationTarget}
              placeholder="Buscar consulta (opcional)…"
              label="Consulta"
              onChoose={chooseConsultation}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Caja de búsqueda de un recurso destino (reusa relation-search-client). Búsqueda con debounce;
 * al elegir un resultado invoca ``onChoose``. Si la metadata no carga, queda deshabilitada.
 */
function RelationSearchBox({
  target,
  placeholder,
  label,
  onChoose,
}: Readonly<{
  target: RelationTarget;
  placeholder: string;
  label: string;
  onChoose: (item: ResourceRow, target: RelationTarget) => void;
}>) {
  const [meta, setMeta] = useState<RelationSearchMeta | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRelationMeta(target.resource)
      .then((value) => {
        if (active) setMeta(value);
      })
      .catch(() => {
        if (active) setMeta(null);
      });
    return () => {
      active = false;
    };
  }, [target.resource]);

  useEffect(() => {
    if (!meta) {
      return;
    }
    const term = query.trim();
    let active = true;
    const handle = setTimeout(() => {
      if (term.length < Math.max(meta.searchMinLength, 1)) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      searchRelationItems(meta.apiPath, term)
        .then((items) => {
          if (active) {
            setResults(items);
            setSearched(true);
          }
        })
        .catch(() => {
          if (active) {
            setResults([]);
            setSearched(true);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, meta]);

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={`Buscar ${label.toLowerCase()}`}
        disabled={!meta}
      />
      {loading ? (
        <p>Buscando…</p>
      ) : results.length > 0 ? (
        <ul className="max-h-48 overflow-auto rounded-[10px] border border-[var(--border2)]">
          {results.map((item) => {
            const id = relationItemId(item);
            if (!id) {
              return null;
            }
            const secondary = relationItemSecondary(item, target);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onChoose(item, target)}
                  className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-[var(--panel)]"
                >
                  <span className="font-medium text-[var(--tx)]">
                    {relationItemLabel(item, target)}
                  </span>
                  {secondary ? <span className="text-[var(--tx2)]">{secondary}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : searched ? (
        <p>Sin resultados.</p>
      ) : null}
    </div>
  );
}
