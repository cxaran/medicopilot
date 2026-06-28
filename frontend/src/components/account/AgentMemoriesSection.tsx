"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ResourceActionConfirmDialog } from "@/components/resources/ResourceActionConfirmDialog";
import { ApiRequestError } from "@/core/api/api-error";
import type { AgentMemoryKind, AgentMemoryRead } from "@/core/api/contracts";
import {
  createAgentMemory,
  deleteAgentMemory,
  listAgentMemories,
  updateAgentMemory,
} from "@/core/agent-memories/agent-memories-client";
import {
  KIND_OPTIONS,
  deleteMemoryConfirmation,
  kindDisplayName,
} from "@/core/agent-memories/agent-memories-view";

const textareaClass =
  "w-full rounded-[11px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2.5 text-sm text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)] focus:shadow-[var(--glow)] disabled:cursor-not-allowed disabled:opacity-60";

/** Convierte un UUID opcional escrito en el form a ``string | null`` para el payload. */
function optionalUuid(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function AgentMemoriesSection() {
  const [memories, setMemories] = useState<AgentMemoryRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<AgentMemoryRead | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);

  const [confirm, setConfirm] = useState<AgentMemoryRead | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return listAgentMemories()
      .then((list) => {
        setMemories(list);
        setLoadError(null);
      })
      .catch(() => {
        setLoadError("No se pudieron cargar tus memorias del agente.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const content = String(data.get("content") ?? "").trim();
    const kind = String(data.get("kind") ?? "nota") as AgentMemoryKind;

    try {
      await createAgentMemory({
        title,
        content,
        kind,
        patient_id: optionalUuid(data.get("patient_id")),
        consultation_id: optionalUuid(data.get("consultation_id")),
      });
      form.reset();
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setFormError("Revisa los datos: el título y el contenido son obligatorios.");
      } else {
        setFormError("No se pudo guardar la memoria. Inténtalo nuevamente.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || editPending) return;
    setEditPending(true);
    setEditError(null);

    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const content = String(data.get("content") ?? "").trim();
    const kind = String(data.get("kind") ?? "nota") as AgentMemoryKind;

    try {
      await updateAgentMemory(editing.id, {
        title,
        content,
        kind,
        patient_id: optionalUuid(data.get("patient_id")),
        consultation_id: optionalUuid(data.get("consultation_id")),
      });
      setEditing(null);
      await reload();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 422) {
        setEditError("Revisa los datos: el título y el contenido son obligatorios.");
      } else {
        setEditError("No se pudo actualizar la memoria. Inténtalo nuevamente.");
      }
    } finally {
      setEditPending(false);
    }
  }

  async function onConfirmDelete() {
    if (!confirm || confirmPending) return;
    setConfirmPending(true);
    setConfirmError(null);
    try {
      await deleteAgentMemory(confirm.id);
      setConfirm(null);
      await reload();
    } catch {
      setConfirmError("No se pudo eliminar la memoria. Inténtalo nuevamente.");
    } finally {
      setConfirmPending(false);
    }
  }

  return (
    <section
      aria-label="Memorias del agente"
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Memorias del agente</h2>
        <p className="mt-1 text-sm text-slate-500">
          Notas, preferencias y hechos clínicos que tu copiloto recuerda. Solo tú puedes
          verlas y editarlas; se guardan cifradas.
        </p>
      </div>

      {/* Alta de memoria */}
      <form
        onSubmit={onCreate}
        aria-label="Agregar memoria del agente"
        className="space-y-3 rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-5"
      >
        <p className="text-sm font-semibold text-[var(--tx)]">Agregar memoria</p>
        {formError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Título</span>
            <Input name="title" required maxLength={200} placeholder="Alergia a penicilina" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Tipo</span>
            <Select name="kind" defaultValue="nota" required>
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--tx)]">Contenido</span>
          <textarea
            name="content"
            required
            rows={3}
            placeholder="El paciente prefiere recordatorios por la mañana."
            className={textareaClass}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Paciente relacionado (opcional)</span>
            <Input name="patient_id" placeholder="UUID del paciente" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[var(--tx)]">Consulta relacionada (opcional)</span>
            <Input name="consultation_id" placeholder="UUID de la consulta" />
          </label>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Guardando..." : "Guardar memoria"}
        </Button>
      </form>

      {/* Lista de memorias */}
      <div className="space-y-2" aria-label="Memorias guardadas">
        {loading ? (
          <p className="text-sm text-[var(--tx2)]">Cargando...</p>
        ) : loadError ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : memories.length === 0 ? (
          <p className="text-sm text-[var(--tx2)]">Aún no tienes memorias guardadas.</p>
        ) : (
          memories.map((memory) =>
            editing?.id === memory.id ? (
              <Card key={memory.id} className="space-y-3">
                <form onSubmit={onEditSubmit} aria-label="Editar memoria" className="space-y-3">
                  {editError ? (
                    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {editError}
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-[var(--tx)]">Título</span>
                      <Input name="title" required maxLength={200} defaultValue={memory.title} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-[var(--tx)]">Tipo</span>
                      <Select name="kind" defaultValue={memory.kind} required>
                        {KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-[var(--tx)]">Contenido</span>
                    <textarea
                      name="content"
                      required
                      rows={3}
                      defaultValue={memory.content}
                      className={textareaClass}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-[var(--tx)]">Paciente relacionado (opcional)</span>
                      <Input name="patient_id" defaultValue={memory.patient_id ?? ""} placeholder="UUID del paciente" />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium text-[var(--tx)]">Consulta relacionada (opcional)</span>
                      <Input
                        name="consultation_id"
                        defaultValue={memory.consultation_id ?? ""}
                        placeholder="UUID de la consulta"
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" disabled={editPending}>
                      {editPending ? "Guardando..." : "Guardar cambios"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!editPending) {
                          setEditing(null);
                          setEditError(null);
                        }
                      }}
                      disabled={editPending}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </Card>
            ) : (
              <Card key={memory.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--tx)]">{memory.title}</span>
                    <Badge tone="accent">{kindDisplayName(memory.kind)}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[var(--tx2)]">{memory.content}</p>
                  {memory.patient_id ? (
                    <p className="text-xs text-[var(--tx2)]">Paciente: {memory.patient_id}</p>
                  ) : null}
                  {memory.consultation_id ? (
                    <p className="text-xs text-[var(--tx2)]">Consulta: {memory.consultation_id}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditError(null);
                      setEditing(memory);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmError(null);
                      setConfirm(memory);
                    }}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </Card>
            ),
          )
        )}
      </div>

      {confirm ? (
        <ResourceActionConfirmDialog
          confirmation={deleteMemoryConfirmation(confirm)}
          pending={confirmPending}
          error={confirmError}
          onConfirm={() => void onConfirmDelete()}
          onCancel={() => {
            if (!confirmPending) {
              setConfirm(null);
              setConfirmError(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}
