"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { InlineResourceForm } from "@/components/chat-shell/InlineResourceForm";
import { fetchResourceCapability } from "@/core/resources/embedded-list-client";
import { fillPlaceholder } from "@/core/resources/item-reference";
import { browserApi } from "@/core/api/browser-client";
import type { ResourceCapability, ResourceFormCapability } from "@/core/api/contracts";
import {
  buildFormSubmissionMessage,
  buttonActionToMessage,
  type ButtonsSpec,
  type ChartSpec,
  type ChartSeries,
  type ChartReferenceRange,
  type GanttTask,
  type FormSpec,
  type ResourceFormSpec,
  type SuggestedRepliesSpec,
  type UiSpec,
} from "@/core/agent/tools/ui-spec";
import { GOVERNANCE_LABEL } from "@/core/agent/tools/button-actions";
import {
  buildDynamicFormSubmission,
  type DynamicFormSpec,
  type DynamicWidget,
} from "@/core/agent/tools/dynamic-form";
import {
  applyDecision,
  buildCloseOutSubmission,
  summarize,
  type CloseOutDisposition,
  type CloseOutEntry,
  type DetectedActionsSpec,
} from "@/core/agent/tools/detected-actions";
import {
  applyTaskDecision,
  buildTaskPlanSubmission,
  defaultDecision,
  summarizeTasks,
  type TaskDecision,
  type TaskDisposition,
  type TaskPlanEntry,
  type TaskPlanSpec,
} from "@/core/agent/tools/task-plan";
import {
  applyChecklistStatus,
  buildCloseChecklistSubmission,
  isReadyToClose,
  summarizeChecklist,
  type ChecklistEntry,
  type ChecklistStatus,
  type CloseChecklistSpec,
} from "@/core/agent/tools/close-checklist";
import {
  buildPromotionSubmission,
  type TemplatePromotionSpec,
} from "@/core/agent/tools/template-promotion";
import {
  buildRecordUpdateSubmission,
  type RecordUpdateSpec,
} from "@/core/agent/tools/record-update";
import { openRecordToContext, type OpenRecordSpec } from "@/core/agent/tools/open-record";
import {
  buildWizardSubmission,
  type WizardSpec,
  type WizardStepState,
} from "@/core/agent/tools/wizard";
import type { ActiveClinicalContext } from "@/core/agent/active-context";

// Render seguro de UI generada por el modelo (B9, Parte B): specs declarativas mapeadas a
// componentes React con los primitivos R2. NUNCA HTML/JS crudo del modelo.
export function GeneratedUi({
  spec,
  onSendFollowup,
  onOpenRecord,
}: Readonly<{
  spec: UiSpec;
  onSendFollowup: (text: string) => void;
  // Apertura GOBERNADA del expediente (MP-CTRL-0138): el host cambia el contexto activo (que monta el
  // panel del paciente). Opcional: sin handler (uso independiente) la tarjeta open_record no actúa.
  onOpenRecord?: (context: ActiveClinicalContext) => void;
}>) {
  if (spec.kind === "form") {
    return <FormView spec={spec} onSubmit={(values) => onSendFollowup(buildFormSubmissionMessage(spec, values))} />;
  }
  if (spec.kind === "resource_form") {
    return <ResourceFormView spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "chart") {
    return <ChartView spec={spec} />;
  }
  if (spec.kind === "suggested_replies") {
    return <SuggestedRepliesView spec={spec} onPick={onSendFollowup} />;
  }
  if (spec.kind === "dynamic_form") {
    return (
      <DynamicFormView
        spec={spec}
        onSubmit={(values) => onSendFollowup(buildDynamicFormSubmission(spec, values))}
      />
    );
  }
  if (spec.kind === "detected_actions") {
    return <DetectedActionsPanel spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "task_plan") {
    return <TaskPlanPanel spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "close_checklist") {
    return <CloseChecklistPanel spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "template_promotion_proposal") {
    return <TemplatePromotionPanel spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "record_update") {
    return <RecordUpdatePanel spec={spec} onSendFollowup={onSendFollowup} />;
  }
  if (spec.kind === "open_record") {
    return <OpenRecordCard spec={spec} onOpenRecord={onOpenRecord} />;
  }
  if (spec.kind === "wizard") {
    return <WizardView spec={spec} onSendFollowup={onSendFollowup} />;
  }
  return <ButtonsView spec={spec} onAction={(action) => onSendFollowup(buttonActionToMessage(action))} />;
}

function FormView({
  spec,
  onSubmit,
}: Readonly<{ spec: FormSpec; onSubmit: (values: Record<string, string>) => void }>) {
  // Prellenado: arranca con los valores iniciales que el modelo haya puesto en cada campo (p. ej.
  // el nombre al crear un paciente con datos ya dados), en vez de un formulario vacío.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of spec.fields) {
      if (field.value !== undefined) initial[field.name] = field.value;
    }
    return initial;
  });
  const setValue = (name: string, value: string): void =>
    setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="flex flex-col gap-3 rounded-[16px] border border-[var(--accent-bd)] bg-[var(--panel)] p-4 shadow-[var(--soft2)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-dim)] text-[var(--accent-tx)]" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="2.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight text-[var(--tx)]">
          {spec.title ?? "Formulario"}
        </span>
      </div>
      {spec.description && <p className="text-xs text-[var(--tx2)]">{spec.description}</p>}

      {spec.fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
          <span>
            {field.label}
            {field.required ? (
              <span className="text-[var(--danger)]"> *</span>
            ) : (
              <span className="font-normal text-[var(--tx3)]"> (opcional)</span>
            )}
          </span>
          {field.type === "select" ? (
            <Select
              value={values[field.name] ?? ""}
              required={field.required}
              onChange={(event) => setValue(field.name, event.target.value)}
            >
              <option value="">Selecciona…</option>
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : field.type === "textarea" ? (
            <textarea
              className="w-full rounded-[11px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2.5 text-sm text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)] focus:shadow-[var(--glow)]"
              rows={3}
              value={values[field.name] ?? ""}
              required={field.required}
              placeholder={field.placeholder}
              onChange={(event) => setValue(field.name, event.target.value)}
            />
          ) : (
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={values[field.name] ?? ""}
              required={field.required}
              placeholder={field.placeholder}
              onChange={(event) => setValue(field.name, event.target.value)}
            />
          )}
        </label>
      ))}

      <div className="flex justify-end">
        <Button type="submit">{spec.submit_label}</Button>
      </div>
    </form>
  );
}

// FORMULARIO OFICIAL DE UN RECURSO montado en el chat (Camino A). El agente sólo nombra el recurso y
// el modo; aquí se trae el CONTRATO (fetchResourceCapability) y se monta el MISMO InlineResourceForm
// que el expediente: los campos, validaciones y allowlist salen del contrato y las RELACIONES (FK) se
// renderizan como BUSCADORES por nombre (ResourceFormFields), nunca como UUID. Al guardar escribe
// directo por la API del recurso (RBAC server-side) y devuelve el resultado al hilo como hecho
// consumado (el agente continúa el flujo sin re-crear). No invoca ninguna tool de escritura.
type ResourceFormState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      label: string;
      form: ResourceFormCapability;
      mutationUrl?: string;
      initialValues: Record<string, unknown>;
    }
  | { status: "done"; summary: string }
  | { status: "cancelled" };

function ResourceFormView({
  spec,
  onSendFollowup,
}: Readonly<{ spec: ResourceFormSpec; onSendFollowup: (text: string) => void }>) {
  const [state, setState] = useState<ResourceFormState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setState({ status: "loading" });
      try {
        const capability: ResourceCapability = await fetchResourceCapability(spec.resource);
        if (cancelled) return;

        if (spec.mode === "create") {
          const form = capability.forms?.create;
          if (!form) {
            setState({ status: "error", message: "Este recurso no permite crear desde aquí." });
            return;
          }
          setState({ status: "ready", label: capability.label, form, initialValues: spec.values ?? {} });
          return;
        }

        // update: el detalle es la fuente de verdad de los valores; los datos nuevos del agente
        // (values) lo sobreescriben. La URL de mutación se resuelve con el id del contrato.
        const reference = capability.item_reference;
        const detailCap = capability.detail;
        const updateCap = capability.forms?.update;
        if (!reference || !detailCap || !updateCap || !spec.resource_id) {
          setState({ status: "error", message: "Este recurso no permite editar desde aquí." });
          return;
        }
        const detailUrl = fillPlaceholder(detailCap.url_template, reference.placeholder, spec.resource_id);
        const detail = await browserApi<Record<string, unknown>>(detailUrl);
        if (cancelled) return;
        const mutationUrl = fillPlaceholder(updateCap.url_template, reference.placeholder, spec.resource_id);
        setState({
          status: "ready",
          label: capability.label,
          form: updateCap,
          mutationUrl,
          initialValues: { ...detail, ...(spec.values ?? {}) },
        });
      } catch {
        if (!cancelled) setState({ status: "error", message: "No se pudo cargar el formulario." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec]);

  if (state.status === "loading") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-4 text-[13px] text-[var(--tx3)]">
        Cargando formulario…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-[14px] border border-[var(--danger)] bg-[var(--panel)] p-4 text-[13px] text-[var(--danger)]">
        {state.message}
      </div>
    );
  }
  if (state.status === "cancelled") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-3 text-[12.5px] text-[var(--tx3)]">
        Formulario cerrado.
      </div>
    );
  }
  if (state.status === "done") {
    return (
      <div className="rounded-[14px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] p-3 text-[12.5px] text-[var(--accent-tx)]">
        ✓ {state.summary}
      </div>
    );
  }

  return (
    <InlineResourceForm
      mode={spec.mode}
      form={state.form}
      mutationUrl={state.mutationUrl}
      // El nombre mostrado es SIEMPRE el del recurso del contrato (p. ej. "Paciente"), no el `title`
      // que mande el agente (suele venir como frase de acción "Crear nuevo paciente" y se vería como
      // "Nuevo: Crear nuevo paciente" / "Creó Crear nuevo paciente").
      resourceLabel={state.label}
      initialValues={state.initialValues}
      onCancel={() => setState({ status: "cancelled" })}
      onDone={(summary) => {
        // Hecho consumado: ya se escribió por API. Se reporta al hilo para que el agente continúe el
        // flujo (p. ej. abrir la consulta tras crear el paciente) SIN volver a crear el registro.
        setState({ status: "done", summary });
        onSendFollowup(`✅ ${summary}`);
      }}
    />
  );
}

// Gráficas en tarjeta (fiel a ``chartPanel`` de MediCopilot.dc.html). Soporta BARRAS (comparar
// categorías) y LÍNEAS (tendencias en el tiempo: vitales/labs/peso). Multi-serie para líneas
// comparativas (p. ej. sistólica/diastólica). Rango de referencia clínico: sombrea la banda normal
// y RESALTA en rojo los puntos fuera de ella. --danger se reserva para el fuera-de-rango, así que
// no entra en la paleta de series.
const CHART_BAR_AREA = 132; // alto del área de barras (px)
const SERIES_COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--accent-bd)"] as const;
// Paleta amplia para SECTORES de pie/doughnut (necesita más matices distintos que las series).
const SLICE_COLORS = [
  "var(--accent)", "var(--ok)", "var(--warn)", "var(--accent-bd)",
  "#0ea5e9", "#a855f7", "#ec4899", "#64748b",
] as const;
// Colores del estado de una tarea del gantt.
const GANTT_STATUS_COLOR: Record<NonNullable<GanttTask["status"]>, string> = {
  done: "var(--ok)",
  active: "var(--accent)",
  planned: "var(--tx3)",
};

/** Normaliza el spec a lista de series (retrocompat: ``data`` de serie única → una serie). */
function chartSeriesOf(spec: ChartSpec): ChartSeries[] {
  if (spec.series && spec.series.length > 0) {
    return spec.series;
  }
  return spec.data && spec.data.length > 0 ? [{ data: spec.data }] : [];
}

function isOutOfRange(value: number, range: ChartReferenceRange | undefined): boolean {
  if (!range) return false;
  if (range.low !== undefined && value < range.low) return true;
  if (range.high !== undefined && value > range.high) return true;
  return false;
}

/** Número de eje compacto (entero o 1 decimal). */
function fmtAxis(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Etiqueta legible de la banda de referencia a partir de low/high (si no vino una explícita). */
function refRangeLabel(range: ChartReferenceRange, unit?: string): string {
  const u = unit ? ` ${unit}` : "";
  if (range.label) return range.label;
  if (range.low !== undefined && range.high !== undefined) return `Rango normal ${range.low}–${range.high}${u}`;
  if (range.high !== undefined) return `Normal ≤ ${range.high}${u}`;
  if (range.low !== undefined) return `Normal ≥ ${range.low}${u}`;
  return "Rango normal";
}

function ChartView({ spec }: Readonly<{ spec: ChartSpec }>) {
  const isGantt = spec.chart_type === "gantt";
  const isPie = spec.chart_type === "pie" || spec.chart_type === "doughnut";
  const isTrend = spec.chart_type === "line" || spec.chart_type === "area";
  const series = isGantt ? [] : chartSeriesOf(spec);

  if (isGantt) {
    if (!spec.tasks || spec.tasks.length === 0) {
      return null;
    }
  } else if (series.length === 0) {
    return null;
  }

  const showSeriesLegend = isTrend && series.length > 1 && series.some((s) => s.name);
  const showRefNote = spec.reference_range && (isTrend || spec.chart_type === "bar");

  return (
    <div className="w-full rounded-[16px] border border-[var(--border2)] bg-[var(--panel)] p-4 shadow-[var(--soft)]">
      {(spec.title || spec.unit) && (
        <div className="mb-3 flex items-baseline gap-2">
          {spec.title && (
            <div className="text-[14px] font-semibold tracking-tight text-[var(--tx)]">{spec.title}</div>
          )}
          {spec.unit && !isGantt && <span className="text-[11px] text-[var(--tx3)]">({spec.unit})</span>}
        </div>
      )}
      {showSeriesLegend && (
        <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s, index) => (
            <span
              key={`${s.name ?? "serie"}-${index}`}
              className="flex items-center gap-1.5 text-[11px] text-[var(--tx2)]"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
              />
              {s.name ?? `Serie ${index + 1}`}
            </span>
          ))}
        </div>
      )}
      {showRefNote && spec.reference_range && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--tx3)]">
          <span className="h-2.5 w-4 rounded-[3px]" style={{ background: "var(--ok)", opacity: 0.18 }} />
          {refRangeLabel(spec.reference_range, spec.unit)}
        </div>
      )}
      {isGantt ? (
        <GanttView tasks={spec.tasks ?? []} title={spec.title} />
      ) : isPie ? (
        <PieChartView data={series[0].data} unit={spec.unit} doughnut={spec.chart_type === "doughnut"} title={spec.title} />
      ) : isTrend ? (
        <LineChartView series={series} range={spec.reference_range} area={spec.chart_type === "area"} title={spec.title} />
      ) : (
        <BarChartView data={series[0].data} range={spec.reference_range} unit={spec.unit} title={spec.title} />
      )}
    </div>
  );
}

// Gráfica de LÍNEAS en SVG (responsive por viewBox). Banda de referencia sombreada, gridlines con
// etiquetas del eje Y, una polilínea por serie y puntos (rojos si caen fuera del rango). Eje X con
// un subconjunto de fechas cuando hay muchos puntos.
function LineChartView({
  series,
  range,
  area,
  title,
}: Readonly<{ series: ChartSeries[]; range?: ChartReferenceRange; area?: boolean; title?: string }>) {
  const W = 560;
  const H = 220;
  const [mL, mR, mT, mB] = [42, 14, 14, 28];
  const n = Math.max(...series.map((s) => s.data.length));

  const values = series.flatMap((s) => s.data.map((d) => d.value));
  if (range?.low !== undefined) values.push(range.low);
  if (range?.high !== undefined) values.push(range.high);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const padY = (yMax - yMin) * 0.08;
  yMin -= padY;
  yMax += padY;

  const [px0, px1, py0, py1] = [mL, W - mR, mT, H - mB];
  const xFor = (i: number) => (n <= 1 ? (px0 + px1) / 2 : px0 + (i / (n - 1)) * (px1 - px0));
  const yFor = (v: number) => py1 - ((v - yMin) / (yMax - yMin)) * (py1 - py0);

  const gridVals = [yMax, (yMax + yMin) / 2, yMin];
  const axisLabels = series.reduce((a, b) => (b.data.length >= a.data.length ? b : a)).data;
  const step = Math.max(1, Math.ceil(n / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title ?? "Gráfico de tendencia"}>
      {range && (range.low !== undefined || range.high !== undefined) && (
        <rect
          x={px0}
          width={px1 - px0}
          y={yFor(range.high ?? yMax)}
          height={Math.max(0, yFor(range.low ?? yMin) - yFor(range.high ?? yMax))}
          fill="var(--ok)"
          opacity={0.12}
        />
      )}
      {gridVals.map((v, index) => (
        <g key={`grid-${index}`}>
          <line x1={px0} x2={px1} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" strokeWidth={1} />
          <text x={px0 - 6} y={yFor(v) + 3} textAnchor="end" fontSize={10} fill="var(--tx3)">
            {fmtAxis(v)}
          </text>
        </g>
      ))}
      {series.map((s, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        const points = s.data.map((d, i) => `${xFor(i)},${yFor(d.value)}`).join(" ");
        // Área: polígono cerrado hasta la base del área de trazado, con relleno tenue.
        const areaPoints =
          s.data.length > 0
            ? `${xFor(0)},${py1} ${points} ${xFor(s.data.length - 1)},${py1}`
            : "";
        return (
          <g key={`serie-${si}`}>
            {area && areaPoints && (
              <polygon points={areaPoints} fill={color} opacity={0.14} stroke="none" />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.data.map((d, i) => {
              const out = isOutOfRange(d.value, range);
              return (
                <circle
                  key={`p-${si}-${i}`}
                  cx={xFor(i)}
                  cy={yFor(d.value)}
                  r={out ? 4 : 3}
                  fill={out ? "var(--danger)" : color}
                  stroke="var(--panel)"
                  strokeWidth={1}
                >
                  <title>{`${d.label}: ${d.value}`}</title>
                </circle>
              );
            })}
          </g>
        );
      })}
      {axisLabels.map((d, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={`x-${i}`} x={xFor(i)} y={H - 9} textAnchor="middle" fontSize={10} fill="var(--tx3)">
            {d.label.length > 8 ? `${d.label.slice(0, 8)}…` : d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

// Gráfica de BARRAS (serie única). Vertical hasta 12 categorías; para más cae a horizontales
// legibles. Con rango de referencia, las barras fuera de rango se pintan en rojo (--danger).
function BarChartView({
  data,
  range,
  unit,
  title,
}: Readonly<{ data: ChartSeries["data"]; range?: ChartReferenceRange; unit?: string; title?: string }>) {
  const max = Math.max(1, ...data.map((datum) => Math.abs(datum.value)));
  const vertical = data.length <= 12;
  const suffix = unit ? ` ${unit}` : "";
  const barColor = (value: number, dir: "v" | "h") =>
    isOutOfRange(value, range)
      ? "var(--danger)"
      : `linear-gradient(${dir === "v" ? "180deg" : "90deg"}, var(--accent), var(--accent-tx))`;

  return vertical ? (
    <div
      className="flex items-end gap-2 border-t border-[var(--border)] pt-3.5"
      style={{ height: CHART_BAR_AREA + 44 }}
      role="img"
      aria-label={title ?? "Gráfico de barras"}
    >
      {data.map((datum, index) => (
        <div key={`${datum.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-bold tabular-nums text-[var(--tx2)]" title={`${datum.value}${suffix}`}>
            {datum.value}
          </span>
          <div
            className="w-full max-w-[34px] rounded-t-[7px]"
            style={{
              height: `${Math.max(6, (Math.abs(datum.value) / max) * CHART_BAR_AREA)}px`,
              background: barColor(datum.value, "v"),
            }}
          />
          <span className="max-w-full truncate text-[11px] text-[var(--tx3)]" title={datum.label}>
            {datum.label}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-2" role="img" aria-label={title ?? "Gráfico de barras"}>
      {data.map((datum, index) => (
        <div key={`${datum.label}-${index}`} className="flex items-center gap-2">
          <span className="w-[110px] shrink-0 truncate text-[11.5px] text-[var(--tx2)]" title={datum.label}>
            {datum.label}
          </span>
          <div className="h-3.5 min-w-[2px] flex-1">
            <div
              className="h-full rounded-[4px]"
              style={{
                width: `${Math.max(2, (Math.abs(datum.value) / max) * 100)}%`,
                background: barColor(datum.value, "h"),
              }}
            />
          </div>
          <span className="w-[42px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-[var(--tx)]" title={`${datum.value}${suffix}`}>
            {datum.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Coordenada polar (0° arriba) para los sectores del pie/doughnut.
function polarPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const angle = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Gráfica de PROPORCIONES (pie/doughnut) de una sola serie. Sectores con % y leyenda a un lado.
function PieChartView({
  data,
  unit,
  doughnut,
  title,
}: Readonly<{ data: ChartSeries["data"]; unit?: string; doughnut?: boolean; title?: string }>) {
  const slices = data.map((d) => ({ label: d.label, value: Math.abs(d.value) }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return null;
  }
  const [cx, cy, r] = [80, 80, 74];
  const suffix = unit ? ` ${unit}` : "";
  let acc = 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 160 160" className="h-[160px] w-[160px] shrink-0" role="img" aria-label={title ?? "Gráfico de proporciones"}>
        {slices.map((s, index) => {
          const startDeg = (acc / total) * 360;
          acc += s.value;
          const endDeg = (acc / total) * 360;
          const color = SLICE_COLORS[index % SLICE_COLORS.length];
          // Un único sector que abarca el total: círculo completo (el arco degeneraría).
          if (slices.length === 1) {
            return <circle key={`${s.label}-${index}`} cx={cx} cy={cy} r={r} fill={color} />;
          }
          const p1 = polarPoint(cx, cy, r, startDeg);
          const p2 = polarPoint(cx, cy, r, endDeg);
          const large = endDeg - startDeg > 180 ? 1 : 0;
          const path = `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
          return <path key={`${s.label}-${index}`} d={path} fill={color} stroke="var(--panel)" strokeWidth={1.5} />;
        })}
        {doughnut && <circle cx={cx} cy={cy} r={r * 0.56} fill="var(--panel)" />}
      </svg>
      <div className="flex min-w-[130px] flex-1 flex-col gap-1.5">
        {slices.map((s, index) => (
          <div key={`leg-${s.label}-${index}`} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} />
            <span className="flex-1 truncate text-[var(--tx2)]" title={s.label}>{s.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[var(--tx)]" title={`${s.value}${suffix}`}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fecha ISO -> "MM-DD" para las marcas del eje temporal del gantt.
function ganttTick(ms: number): string {
  return new Date(ms).toISOString().slice(5, 10);
}

// LÍNEA DE TIEMPO (gantt): una fila por tarea, barra posicionada por fechas start/end sobre un eje
// temporal común. El color codifica el estado (done/active/planned). Layout con divs (responsive).
function GanttView({ tasks, title }: Readonly<{ tasks: GanttTask[]; title?: string }>) {
  const spans = tasks.map((t) => ({ ...t, s: Date.parse(t.start), e: Date.parse(t.end) }));
  const min = Math.min(...spans.map((t) => t.s));
  const maxRaw = Math.max(...spans.map((t) => t.e));
  const max = maxRaw > min ? maxRaw : min + 86_400_000; // ≥ 1 día para evitar división por cero
  const span = max - min;
  const hasStatus = tasks.some((t) => t.status);

  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={title ?? "Línea de tiempo"}>
      {/* marcas del eje temporal */}
      <div className="flex items-center gap-2 pb-1">
        <span className="w-[120px] shrink-0" />
        <div className="flex flex-1 justify-between text-[10px] text-[var(--tx3)]">
          <span>{ganttTick(min)}</span>
          <span>{ganttTick(min + span / 2)}</span>
          <span>{ganttTick(max)}</span>
        </div>
      </div>
      {spans.map((t, index) => {
        const left = ((t.s - min) / span) * 100;
        const width = Math.max(2, ((t.e - t.s) / span) * 100);
        const color = t.status ? GANTT_STATUS_COLOR[t.status] : "var(--accent)";
        return (
          <div key={`${t.label}-${index}`} className="flex items-center gap-2">
            <span className="w-[120px] shrink-0 truncate text-[11.5px] text-[var(--tx2)]" title={t.label}>
              {t.label}
            </span>
            <div className="relative h-4 flex-1 rounded-[4px] bg-[var(--bg2)]">
              <div
                className="absolute top-0 h-full rounded-[4px]"
                style={{ left: `${left}%`, width: `${width}%`, background: color }}
                title={`${t.start} → ${t.end}${t.status ? ` (${t.status})` : ""}`}
              />
            </div>
          </div>
        );
      })}
      {hasStatus && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-[128px] text-[10.5px] text-[var(--tx3)]">
          {(["done", "active", "planned"] as const).map((st) => (
            <span key={st} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: GANTT_STATUS_COLOR[st] }} />
              {st === "done" ? "Completado" : st === "active" ? "En curso" : "Planeado"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// RESPUESTAS SUGERIDAS (quick replies): chips con las posibles siguientes respuestas del médico.
// Al hacer clic, el texto se envía AUTOMÁTICAMENTE como mensaje del médico (onPick → turno normal);
// el host marca la interfaz como usada y la contrae. Sólo texto plano: nada se ejecuta ni guarda.
function SuggestedRepliesView({
  spec,
  onPick,
}: Readonly<{ spec: SuggestedRepliesSpec; onPick: (text: string) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      {spec.title && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tx3)]">
          {spec.title}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {spec.replies.map((reply) => (
          <button
            key={reply}
            type="button"
            onClick={() => onPick(reply)}
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-1.5 text-[13px] text-[var(--tx)] shadow-[var(--soft)] transition hover:border-[var(--accent-bd)] hover:bg-[var(--accent-dim)] hover:text-[var(--accent-tx)]"
          >
            {reply}
          </button>
        ))}
      </div>
    </div>
  );
}

// Render de UI DINÁMICA en lista blanca (MP-CTRL-0117). La spec ya viene VALIDADA por
// validateDynamicForm (solo tipos/props de la lista blanca, sin HTML/script/URL); aquí cada tipo
// se mapea a un primitivo React. Un tipo desconocido (defensa en profundidad) no se pinta. Los
// valores recolectados continúan la conversación; nada se ejecuta ni guarda sin aprobación.
const DECISION_CHOICES: { value: string; label: string }[] = [
  { value: "aceptar", label: "Aceptar" },
  { value: "editar", label: "Editar" },
  { value: "rechazar", label: "Rechazar" },
];

function DynamicFormView({
  spec,
  onSubmit,
}: Readonly<{ spec: DynamicFormSpec; onSubmit: (values: Record<string, string>) => void }>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const setValue = (name: string, value: string): void =>
    setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="flex flex-col gap-3 rounded-[16px] border border-[var(--accent-bd)] bg-[var(--panel)] p-4 shadow-[var(--soft2)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-dim)] text-[var(--accent-tx)]" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="2.5" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight text-[var(--tx)]">
          {spec.title ?? "Formulario"}
        </span>
      </div>
      {spec.description && <p className="text-xs text-[var(--tx2)]">{spec.description}</p>}

      {spec.widgets.map((widget, index) => (
        <DynamicWidgetView
          key={widgetKey(widget, index)}
          widget={widget}
          values={values}
          setValue={setValue}
        />
      ))}

      <div className="flex justify-end">
        <Button type="submit">{spec.submit_label}</Button>
      </div>
    </form>
  );
}

function widgetKey(widget: DynamicWidget, index: number): string {
  return "name" in widget && widget.name ? widget.name : `${widget.type}-${index}`;
}

function DynamicWidgetView({
  widget,
  values,
  setValue,
}: Readonly<{
  widget: DynamicWidget;
  values: Record<string, string>;
  setValue: (name: string, value: string) => void;
}>) {
  if (widget.type === "heading") {
    return <div className="text-sm font-semibold text-[var(--tx)]">{widget.text}</div>;
  }

  if (widget.type === "info_card") {
    const toneClass =
      widget.tone === "warn"
        ? "border-[var(--danger)] text-[var(--tx)]"
        : widget.tone === "muted"
          ? "border-[var(--border2)] text-[var(--tx2)]"
          : "border-[var(--accent-bd)] text-[var(--tx)]";
    return (
      <div className={`rounded-[10px] border bg-[var(--bg2)] px-3 py-2 text-xs ${toneClass}`}>
        {widget.text}
      </div>
    );
  }

  if (widget.type === "section") {
    return (
      <fieldset className="flex flex-col gap-3 rounded-[10px] border border-[var(--border2)] p-3">
        {widget.title && (
          <legend className="px-1 text-xs font-semibold text-[var(--tx2)]">{widget.title}</legend>
        )}
        {widget.children.map((child, index) => (
          <DynamicWidgetView
            key={widgetKey(child, index)}
            widget={child}
            values={values}
            setValue={setValue}
          />
        ))}
      </fieldset>
    );
  }

  if (widget.type === "decision_list") {
    return (
      <div className="flex flex-col gap-2">
        {widget.label && <span className="text-xs font-semibold text-[var(--tx2)]">{widget.label}</span>}
        {widget.items.map((item) => {
          const key = `${widget.name}.${item.value}`;
          return (
            <div key={key} className="flex flex-col gap-1 rounded-[10px] border border-[var(--border2)] p-2">
              <span className="text-xs text-[var(--tx)]">{item.text}</span>
              <Select value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value)}>
                <option value="">Decidir…</option>
                {DECISION_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
    );
  }

  // Widgets de ENTRADA con etiqueta.
  const labeled = widget as Extract<DynamicWidget, { name: string }> & { label?: string; help?: string };
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
      <span>
        {labeled.label ?? labeled.name}
        {"required" in widget && widget.required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      <DynamicInput widget={widget} value={values[labeled.name] ?? ""} setValue={setValue} />
      {labeled.help && <span className="text-[var(--tx2)]">{labeled.help}</span>}
    </label>
  );
}

function DynamicInput({
  widget,
  value,
  setValue,
}: Readonly<{
  widget: DynamicWidget;
  value: string;
  setValue: (name: string, value: string) => void;
}>) {
  if (widget.type === "select") {
    return (
      <Select value={value} required={widget.required} onChange={(event) => setValue(widget.name, event.target.value)}>
        <option value="">Selecciona…</option>
        {widget.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  if (widget.type === "radio") {
    return (
      <div className="flex flex-col gap-1">
        {widget.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs text-[var(--tx)]">
            <input
              type="radio"
              name={widget.name}
              checked={value === option.value}
              onChange={() => setValue(widget.name, option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (widget.type === "multiselect") {
    const selected = value ? value.split(",") : [];
    const toggle = (optValue: string): void => {
      const next = selected.includes(optValue)
        ? selected.filter((entry) => entry !== optValue)
        : [...selected, optValue];
      setValue(widget.name, next.join(","));
    };
    return (
      <div className="flex flex-col gap-1">
        {widget.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs text-[var(--tx)]">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (widget.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onChange={(event) => setValue(widget.name, event.target.checked ? "true" : "false")}
      />
    );
  }

  if (widget.type === "textarea") {
    return (
      <textarea
        className="w-full rounded-[11px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2.5 text-sm text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)] focus:shadow-[var(--glow)]"
        rows={3}
        value={value}
        required={widget.required}
        placeholder={widget.placeholder}
        onChange={(event) => setValue(widget.name, event.target.value)}
      />
    );
  }

  // Resto de entradas con valor de texto: text | number | date. Defensa en profundidad: un tipo
  // sin entrada (heading/info_card/section) no se pinta aquí.
  if (widget.type !== "text" && widget.type !== "number" && widget.type !== "date") {
    return null;
  }
  return (
    <Input
      type={widget.type === "number" ? "number" : widget.type === "date" ? "date" : "text"}
      value={value}
      required={widget.required}
      placeholder={"placeholder" in widget ? widget.placeholder : undefined}
      onChange={(event) => setValue(widget.name, event.target.value)}
    />
  );
}

// Panel de CIERRE post-transcripción (MP-CTRL-0120). Lista las acciones detectadas con su origen y
// diff, deja al médico aceptar/editar/rechazar cada una (las bloqueadas quedan fijas con su motivo),
// muestra el resumen de cierre y, al confirmar, envía un seguimiento para que el agente proceda
// ACCIÓN POR ACCIÓN por la aprobación P1. No escribe nada por sí mismo.
type CloseOutDecision = "save_draft" | "pending" | "discarded";

const DISPOSITION_LABEL: Record<CloseOutDisposition, string> = {
  save_draft: "Guardar como borrador",
  pending: "Pendiente de confirmación",
  discarded: "Descartar",
  blocked: "Bloqueada",
};

const DECISION_OPTIONS: { value: CloseOutDecision; label: string }[] = [
  { value: "save_draft", label: "Aceptar (guardar borrador)" },
  { value: "pending", label: "Dejar pendiente" },
  { value: "discarded", label: "Rechazar" },
];

interface EntryOverride {
  decision: CloseOutDecision;
  edited?: Record<string, string>;
  editing?: boolean;
}

function DetectedActionsPanel({
  spec,
  onSendFollowup,
}: Readonly<{ spec: DetectedActionsSpec; onSendFollowup: (text: string) => void }>) {
  const [overrides, setOverrides] = useState<Record<string, EntryOverride>>({});

  const resolved: CloseOutEntry[] = spec.plan.entries.map((entry) => {
    if (entry.disposition === "blocked") return entry; // bloqueadas no cambian
    const override = overrides[entry.id];
    if (!override) return entry;
    return applyDecision(entry, override.decision, override.edited);
  });
  const summary = summarize(resolved);

  const setDecision = (id: string, decision: CloseOutDecision): void =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], decision } }));

  const toggleEditing = (id: string): void =>
    setOverrides((prev) => {
      const current = prev[id] ?? { decision: "save_draft" as CloseOutDecision };
      return { ...prev, [id]: { ...current, editing: !current.editing } };
    });

  const setField = (entry: CloseOutEntry, field: string, value: string): void =>
    setOverrides((prev) => {
      const current = prev[entry.id] ?? { decision: "save_draft" as CloseOutDecision };
      const base: Record<string, string> = current.edited ?? stringifyValues(entry.values);
      return {
        ...prev,
        [entry.id]: { ...current, decision: "save_draft", edited: { ...base, [field]: value } },
      };
    });

  const clinical = resolved.filter((entry) => entry.category === "clinical");
  const administrative = resolved.filter((entry) => entry.category === "administrative");

  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      <div className="rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--tx2)]">
        Cierre: {summary.save_draft} a guardar · {summary.pending} pendientes · {summary.discarded}{" "}
        descartadas · {summary.blocked} bloqueadas
      </div>

      <ActionGroup
        title="Clínicas"
        entries={clinical}
        overrides={overrides}
        onDecision={setDecision}
        onToggleEditing={toggleEditing}
        onField={setField}
      />
      <ActionGroup
        title="Administrativas"
        entries={administrative}
        overrides={overrides}
        onDecision={setDecision}
        onToggleEditing={toggleEditing}
        onField={setField}
      />

      <div>
        <Button
          type="button"
          onClick={() => onSendFollowup(buildCloseOutSubmission(spec.confirm_prompt, resolved))}
        >
          {spec.confirm_label}
        </Button>
      </div>
    </div>
  );
}

function stringifyValues(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(values)) {
    out[field] = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  }
  return out;
}

function ActionGroup({
  title,
  entries,
  overrides,
  onDecision,
  onToggleEditing,
  onField,
}: Readonly<{
  title: string;
  entries: CloseOutEntry[];
  overrides: Record<string, EntryOverride>;
  onDecision: (id: string, decision: CloseOutDecision) => void;
  onToggleEditing: (id: string) => void;
  onField: (entry: CloseOutEntry, field: string, value: string) => void;
}>) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-[var(--tx2)]">{title}</span>
      {entries.map((entry) => (
        <ActionCard
          key={entry.id}
          entry={entry}
          override={overrides[entry.id]}
          onDecision={onDecision}
          onToggleEditing={onToggleEditing}
          onField={onField}
        />
      ))}
    </div>
  );
}

function ActionCard({
  entry,
  override,
  onDecision,
  onToggleEditing,
  onField,
}: Readonly<{
  entry: CloseOutEntry;
  override: EntryOverride | undefined;
  onDecision: (id: string, decision: CloseOutDecision) => void;
  onToggleEditing: (id: string) => void;
  onField: (entry: CloseOutEntry, field: string, value: string) => void;
}>) {
  const blocked = entry.disposition === "blocked";
  const editing = override?.editing ?? false;
  const decision: CloseOutDecision = blocked
    ? "discarded"
    : override?.decision ?? (entry.disposition === "save_draft" ? "save_draft" : entry.disposition === "discarded" ? "discarded" : "pending");

  return (
    <div
      className={`flex flex-col gap-1 rounded-[10px] border p-2 ${
        blocked ? "border-[var(--danger)]" : "border-[var(--border2)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--tx)]">{entry.label}</span>
        <span className="text-[10px] text-[var(--tx2)]">{entry.target_resource}</span>
      </div>

      {entry.source_fragment && (
        <p className="text-[11px] italic text-[var(--tx2)]">«{entry.source_fragment}»</p>
      )}

      {blocked ? (
        <div className="text-[11px] text-[var(--danger)]">
          {DISPOSITION_LABEL.blocked}: {entry.reason}
        </div>
      ) : (
        <>
          <div className="text-[11px] text-[var(--tx2)]">
            {entry.diff.length === 0
              ? "Sin cambios respecto al expediente."
              : entry.diff
                  .map((d) =>
                    d.change === "added"
                      ? `+ ${d.field}: ${renderValue(d.after)}`
                      : `~ ${d.field}: ${renderValue(d.before)} → ${renderValue(d.after)}`,
                  )
                  .join("  ·  ")}
          </div>
          {entry.dropped_fields.length > 0 && (
            <div className="text-[11px] text-[var(--tx2)]">
              Campos ignorados (fuera del esquema): {entry.dropped_fields.join(", ")}
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-1 rounded-[8px] border border-[var(--border2)] p-2">
              {Object.entries(entry.values).map(([field, value]) => (
                <label key={field} className="flex flex-col gap-0.5 text-[11px] text-[var(--tx2)]">
                  <span>{field}</span>
                  <Input
                    value={
                      override?.edited?.[field] ??
                      (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value))
                    }
                    onChange={(event) => onField(entry, field, event.target.value)}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select
              value={decision}
              onChange={(event) => onDecision(entry.id, event.target.value as CloseOutDecision)}
            >
              {DECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="text-[11px] text-[var(--accent)] underline"
              onClick={() => onToggleEditing(entry.id)}
            >
              {editing ? "Cerrar edición" : "Editar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// PLAN DE TAREAS revisable (MP-CTRL-0129). Lista las tareas detectadas con su confianza y los
// campos que faltan/se ignoran, deja al médico aceptar/posponer/rechazar cada una (las bloqueadas
// quedan fijas con su motivo), muestra el resumen y, al confirmar, envía un seguimiento para que el
// agente cree las aceptadas TAREA POR TAREA por la aprobación P1. No escribe nada por sí mismo.
type TaskPlanDecision = TaskDecision;

const TASK_DISPOSITION_LABEL: Record<TaskDisposition, string> = {
  ready: "Lista para guardar",
  suggested: "Sugerida (a confirmar)",
  discarded: "Descartada",
  blocked: "Bloqueada",
};

const TASK_DECISION_OPTIONS: { value: TaskPlanDecision; label: string }[] = [
  { value: "accept", label: "Aceptar (crear borrador)" },
  { value: "later", label: "Dejar pendiente" },
  { value: "reject", label: "Rechazar" },
];

interface TaskEntryOverride {
  decision: TaskPlanDecision;
  edited?: Record<string, string>;
  editing?: boolean;
}

function TaskPlanPanel({
  spec,
  onSendFollowup,
}: Readonly<{ spec: TaskPlanSpec; onSendFollowup: (text: string) => void }>) {
  const [overrides, setOverrides] = useState<Record<string, TaskEntryOverride>>({});

  const resolved: TaskPlanEntry[] = spec.plan.entries.map((entry) => {
    if (entry.disposition === "blocked") return entry; // bloqueadas no cambian
    const override = overrides[entry.id];
    if (!override) return entry;
    return applyTaskDecision(entry, override.decision, override.edited);
  });
  const summary = summarizeTasks(resolved);

  const setDecision = (id: string, decision: TaskPlanDecision): void =>
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], decision } }));

  const toggleEditing = (id: string, fallback: TaskPlanDecision): void =>
    setOverrides((prev) => {
      const current = prev[id] ?? { decision: fallback };
      return { ...prev, [id]: { ...current, editing: !current.editing } };
    });

  const setField = (entry: TaskPlanEntry, field: string, value: string): void =>
    setOverrides((prev) => {
      const current = prev[entry.id] ?? { decision: "accept" as TaskPlanDecision };
      const base: Record<string, string> = current.edited ?? stringifyValues(entry.values);
      // Editar implica aceptar: si no, los valores editados no se crearían.
      return {
        ...prev,
        [entry.id]: { ...current, decision: "accept", edited: { ...base, [field]: value } },
      };
    });

  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      <div className="rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--tx2)]">
        Plan: {summary.ready} a crear · {summary.suggested} pendientes · {summary.discarded}{" "}
        descartadas · {summary.blocked} bloqueadas
      </div>

      <div className="flex flex-col gap-2">
        {spec.plan.entries.map((entry) => (
          <TaskCard
            key={entry.id}
            entry={entry}
            override={overrides[entry.id]}
            onDecision={setDecision}
            onToggleEditing={toggleEditing}
            onField={setField}
          />
        ))}
      </div>

      <div>
        <Button
          type="button"
          onClick={() => onSendFollowup(buildTaskPlanSubmission(spec.confirm_prompt, resolved))}
        >
          {spec.confirm_label}
        </Button>
      </div>
    </div>
  );
}

function TaskCard({
  entry,
  override,
  onDecision,
  onToggleEditing,
  onField,
}: Readonly<{
  entry: TaskPlanEntry;
  override: TaskEntryOverride | undefined;
  onDecision: (id: string, decision: TaskPlanDecision) => void;
  onToggleEditing: (id: string, fallback: TaskPlanDecision) => void;
  onField: (entry: TaskPlanEntry, field: string, value: string) => void;
}>) {
  const blocked = entry.disposition === "blocked";
  const fallback = defaultDecision(entry.disposition);
  const editing = override?.editing ?? false;
  const decision: TaskPlanDecision = blocked ? "reject" : override?.decision ?? fallback;

  return (
    <div
      className={`flex flex-col gap-1 rounded-[10px] border p-2 ${
        blocked ? "border-[var(--danger)]" : "border-[var(--border2)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--tx)]">{entry.label}</span>
        <span className="text-[10px] text-[var(--tx2)]">
          {entry.confidence !== null ? `confianza ${Math.round(entry.confidence * 100)}% · ` : ""}
          {TASK_DISPOSITION_LABEL[entry.disposition]}
        </span>
      </div>

      {entry.source_fragment && (
        <p className="text-[11px] italic text-[var(--tx2)]">«{entry.source_fragment}»</p>
      )}

      {blocked ? (
        <div className="text-[11px] text-[var(--danger)]">
          {TASK_DISPOSITION_LABEL.blocked}: {entry.reason}
        </div>
      ) : (
        <>
          <div className="text-[11px] text-[var(--tx2)]">
            {Object.keys(entry.values).length === 0
              ? "Sin datos propuestos."
              : Object.entries(entry.values)
                  .map(([field, value]) => `${field}: ${renderValue(value)}`)
                  .join("  ·  ")}
          </div>
          {entry.missing_required.length > 0 && (
            <div className="text-[11px] text-[var(--danger)]">
              Faltan campos requeridos: {entry.missing_required.join(", ")}
            </div>
          )}
          {entry.dropped_fields.length > 0 && (
            <div className="text-[11px] text-[var(--tx2)]">
              Campos ignorados (fuera del esquema): {entry.dropped_fields.join(", ")}
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-1 rounded-[8px] border border-[var(--border2)] p-2">
              {Object.entries(entry.values).map(([field, value]) => (
                <label key={field} className="flex flex-col gap-0.5 text-[11px] text-[var(--tx2)]">
                  <span>{field}</span>
                  <Input
                    value={
                      override?.edited?.[field] ??
                      (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value))
                    }
                    onChange={(event) => onField(entry, field, event.target.value)}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select
              value={decision}
              onChange={(event) => onDecision(entry.id, event.target.value as TaskPlanDecision)}
            >
              {TASK_DECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="text-[11px] text-[var(--accent)] underline"
              onClick={() => onToggleEditing(entry.id, fallback)}
            >
              {editing ? "Cerrar edición" : "Editar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// CHECKLIST DE CIERRE de consulta (MP-CTRL-0131). Cierra el flujo post-consulta: el médico revisa los
// ítems de cierre (puede marcarlos hecho / no aplica / pendiente; los bloqueados quedan fijos con su
// motivo), ve el resumen consolidado (guardado/pendiente/descartado de las acciones) y si no quedan
// requeridos pendientes puede confirmar. Al confirmar se envía un seguimiento que recuerda firmar la
// nota y cerrar la consulta por el camino P1 habitual; NADA se cierra ni se firma por sí mismo.
type ChecklistDecision = Exclude<ChecklistStatus, "blocked">;

const CHECKLIST_STATUS_LABEL: Record<ChecklistStatus, string> = {
  done: "Hecho",
  pending: "Pendiente",
  not_applicable: "No aplica",
  blocked: "Bloqueado",
};

const CHECKLIST_DECISION_OPTIONS: { value: ChecklistDecision; label: string }[] = [
  { value: "done", label: "Hecho" },
  { value: "pending", label: "Pendiente" },
  { value: "not_applicable", label: "No aplica" },
];

const REQUIREMENT_LABEL: Record<ChecklistEntry["requirement"], string> = {
  required: "Requerido",
  recommended: "Recomendado",
  optional: "Opcional",
};

function CloseChecklistPanel({
  spec,
  onSendFollowup,
}: Readonly<{ spec: CloseChecklistSpec; onSendFollowup: (text: string) => void }>) {
  const [overrides, setOverrides] = useState<Record<string, ChecklistDecision>>({});

  const resolved: ChecklistEntry[] = spec.checklist.entries.map((entry) => {
    if (entry.status === "blocked") return entry; // bloqueados no cambian
    const override = overrides[entry.id];
    return override ? applyChecklistStatus(entry, override) : entry;
  });
  const summary = summarizeChecklist(resolved);
  const ready = isReadyToClose(resolved);
  const actions = spec.checklist.actions_summary;

  const setStatus = (id: string, status: ChecklistDecision): void =>
    setOverrides((prev) => ({ ...prev, [id]: status }));

  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      {actions && (
        <div className="rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--tx2)]">
          Acciones: {actions.saved} guardadas · {actions.pending} pendientes · {actions.discarded}{" "}
          descartadas · {actions.blocked} bloqueadas
        </div>
      )}

      <div
        className={`rounded-[10px] border px-3 py-2 text-xs ${
          ready
            ? "border-[var(--border2)] text-[var(--tx2)]"
            : "border-[var(--danger)] text-[var(--danger)]"
        }`}
      >
        Cierre: {summary.done} hecho · {summary.pending} pendiente · {summary.not_applicable} no aplica
        {summary.blocked > 0 ? ` · ${summary.blocked} bloqueado` : ""}
        {ready
          ? " — sin requeridos pendientes."
          : ` — ${summary.required_pending} requerido(s) por resolver.`}
      </div>

      <div className="flex flex-col gap-2">
        {resolved.map((entry) => {
          const blocked = entry.status === "blocked";
          return (
            <div
              key={entry.id}
              className={`flex flex-col gap-1 rounded-[10px] border p-2 ${
                blocked ? "border-[var(--danger)]" : "border-[var(--border2)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--tx)]">{entry.label}</span>
                <span className="text-[10px] text-[var(--tx2)]">
                  {REQUIREMENT_LABEL[entry.requirement]}
                </span>
              </div>
              {entry.detail && <p className="text-[11px] text-[var(--tx2)]">{entry.detail}</p>}
              {entry.source_fragment && (
                <p className="text-[11px] italic text-[var(--tx2)]">«{entry.source_fragment}»</p>
              )}
              {blocked ? (
                <div className="text-[11px] text-[var(--danger)]">
                  {CHECKLIST_STATUS_LABEL.blocked}: {entry.reason}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={entry.status}
                    onChange={(event) => setStatus(entry.id, event.target.value as ChecklistDecision)}
                  >
                    {CHECKLIST_DECISION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <Button
          type="button"
          onClick={() =>
            onSendFollowup(
              buildCloseChecklistSubmission(spec.confirm_prompt, {
                ...spec.checklist,
                entries: resolved,
                summary,
                ready_to_close: ready,
              }),
            )
          }
        >
          {spec.confirm_label}
        </Button>
      </div>
    </div>
  );
}

// PROPUESTA de promoción dinámica→plantilla (MP-CTRL-0132). Panel SÓLO LECTURA: muestra si la UI
// dinámica califica para ser una plantilla registrada, los criterios cumplidos, la forma sugerida del
// recurso (campos → tipos, cuáles regulados) y la justificación. NO registra nada — es una
// recomendación para el equipo de desarrollo; el botón sólo envía el resumen al chat (sin mutar).
const SUGGESTED_TYPE_LABEL: Record<string, string> = {
  string: "texto",
  text: "texto largo",
  number: "número",
  date: "fecha",
  boolean: "sí/no",
  enum: "opción",
  enum_multi: "opción múltiple",
};

function TemplatePromotionPanel({
  spec,
  onSendFollowup,
}: Readonly<{ spec: TemplatePromotionSpec; onSendFollowup: (text: string) => void }>) {
  const { proposal } = spec;
  const shape = proposal.suggested_template_shape;

  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      <div
        className={`rounded-[10px] border px-3 py-2 text-xs ${
          proposal.qualifies
            ? "border-[var(--accent-bd)] bg-[var(--accent-dim)] text-[var(--accent-tx)]"
            : "border-[var(--border2)] bg-[var(--bg2)] text-[var(--tx2)]"
        }`}
      >
        {proposal.qualifies
          ? "Candidata a plantilla registrada — es una recomendación, no se registra sola."
          : "No se recomienda promover por ahora (parece una UI puntual)."}
      </div>

      {proposal.matched_criteria.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-[var(--tx2)]">Criterios cumplidos</span>
          {proposal.matched_criteria.map((c) => (
            <div key={c.key} className="rounded-[8px] border border-[var(--border2)] px-2 py-1 text-[11px] text-[var(--tx)]">
              <span className="font-medium">{c.label}</span>
              <span className="text-[var(--tx2)]"> — {c.detail}</span>
            </div>
          ))}
        </div>
      )}

      {proposal.supporting_criteria.length > 0 && (
        <div className="text-[11px] text-[var(--tx2)]">
          Apoyo: {proposal.supporting_criteria.map((c) => c.label).join(", ")}.
        </div>
      )}

      {!proposal.qualifies && proposal.reasons && (
        <ul className="flex flex-col gap-1">
          {proposal.reasons.map((reason, index) => (
            <li key={index} className="text-[11px] text-[var(--tx2)]">
              · {reason}
            </li>
          ))}
        </ul>
      )}

      {shape && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--border2)] p-2">
          <span className="text-xs font-semibold text-[var(--tx2)]">
            Forma sugerida: recurso «{shape.suggested_resource_name}»
            {shape.name_collision && (
              <span className="text-[var(--danger)]"> (nombre en uso — renombrar)</span>
            )}
          </span>
          {shape.fields.map((field) => (
            <div key={field.name} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--tx)]">
                {field.label}
                {field.required && <span className="text-[var(--danger)]"> *</span>}
                {field.regulated && (
                  <span className="text-[var(--warn)]"> · regulado</span>
                )}
              </span>
              <span className="text-[var(--tx2)]">
                {SUGGESTED_TYPE_LABEL[field.suggested_type] ?? field.suggested_type}
              </span>
            </div>
          ))}
          {shape.notes.map((note, index) => (
            <p key={index} className="text-[11px] italic text-[var(--tx2)]">
              {note}
            </p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-[var(--tx2)]">{proposal.rationale}</p>

      <div>
        <Button
          type="button"
          onClick={() => onSendFollowup(buildPromotionSubmission(spec.follow_up_prompt, proposal))}
        >
          {spec.follow_up_label}
        </Button>
      </div>
    </div>
  );
}

// Botones gobernados (MP-CTRL-0130): cada botón ya viene RESUELTO por button-actions (governance +
// motivo + args saneados). Los bloqueados se pintan DESHABILITADOS con su motivo (no pueden disparar
// nada); los accionables/lectura conservan el clic, que continúa la conversación (las escrituras del
// modelo siguen pasando por la aprobación P1). Defensa en profundidad: aquí no se reconstruye ninguna
// acción ni se ejecuta una tool directamente.
function ButtonsView({
  spec,
  onAction,
}: Readonly<{ spec: ButtonsSpec; onAction: (action: ButtonsSpec["buttons"][number]["action"]) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}
      <div className="flex flex-wrap gap-2">
        {spec.buttons.map((button, index) => {
          const blocked = button.governance === "blocked";
          if (blocked) {
            return (
              <span
                key={`${button.label}-${index}`}
                title={button.reason ?? GOVERNANCE_LABEL.blocked}
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[12px] border border-[var(--border2)] bg-[var(--bg2)] px-3.5 py-2 text-[13.5px] font-medium text-[var(--tx3)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M5.6 5.6l12.8 12.8" />
                </svg>
                {button.label}
              </span>
            );
          }
          // Acción de ENLACE de contacto (WhatsApp/tel/correo): se abre en otra pestaña (no continúa
          // la conversación). La URL ya viene validada por el seam (lista blanca). Estilo de acento
          // para que el CTA (p. ej. "Enviar por WhatsApp") destaque.
          if (button.action.type === "link") {
            return (
              <a
                key={`${button.label}-${index}`}
                href={button.action.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[12px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--accent-tx)] transition hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
              >
                {button.label}
              </a>
            );
          }
          // Acción de sólo lectura (mensaje/lectura): botón sutil contorneado; acción de escritura
          // (gobernada por P1): botón de acento. Mismo lenguaje de gobierno del diseño.
          const readOnly = button.governance === "read_only";
          return (
            <button
              key={`${button.label}-${index}`}
              type="button"
              onClick={() => onAction(button.action)}
              title={button.reason ?? undefined}
              className={
                readOnly
                  ? "inline-flex items-center gap-1.5 rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2 text-[13.5px] font-medium text-[var(--tx)] shadow-[var(--soft)] transition hover:bg-[var(--panel2)]"
                  : "inline-flex items-center gap-1.5 rounded-[12px] border border-[var(--accent-bd)] bg-[var(--accent-dim)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--accent-tx)] transition hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
              }
            >
              {button.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// COMPARACIÓN antes/después de una ACTUALIZACIÓN (MP-CTRL-0137). Muestra, para un registro existente, el
// diff campo-a-campo (actual → nuevo) que el agente propone; si está bloqueada (sin permiso de edición /
// recurso desconocido) se pinta fija con su motivo. Al confirmar, envía un seguimiento para que el agente
// aplique la edición con la tool de actualización del recurso por la aprobación P1. No escribe nada.
function RecordUpdatePanel({
  spec,
  onSendFollowup,
}: Readonly<{ spec: RecordUpdateSpec; onSendFollowup: (text: string) => void }>) {
  const blocked = spec.disposition === "blocked";
  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--tx)]">{spec.label}</span>
        <span className="text-[10px] text-[var(--tx2)]">
          {spec.target_resource} · {spec.resource_id}
        </span>
      </div>

      {spec.source_fragment && (
        <p className="text-[11px] italic text-[var(--tx2)]">«{spec.source_fragment}»</p>
      )}

      {blocked ? (
        <div className="rounded-[10px] border border-[var(--danger)] px-3 py-2 text-[11px] text-[var(--danger)]">
          Bloqueada: {spec.reason}
        </div>
      ) : spec.diff.length === 0 ? (
        <div className="rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2 text-[11px] text-[var(--tx2)]">
          Sin cambios respecto al registro actual.
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-[10px] border border-[var(--border2)] p-2">
          {spec.diff.map((d) => (
            <div
              key={d.field}
              className="flex flex-col gap-0.5 border-b border-[var(--border2)] pb-1 last:border-b-0 last:pb-0 text-[11px]"
            >
              <span className="font-medium text-[var(--tx)]">{d.field}</span>
              <span className="text-[var(--tx2)]">
                {renderValue(d.before)} <span className="text-[var(--accent)]">→</span>{" "}
                <span className="text-[var(--tx)]">{renderValue(d.after)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!blocked && spec.dropped_fields.length > 0 && (
        <div className="text-[11px] text-[var(--tx2)]">
          Campos ignorados (fuera del esquema de edición): {spec.dropped_fields.join(", ")}
        </div>
      )}

      {!blocked && (
        <div>
          <Button type="button" onClick={() => onSendFollowup(buildRecordUpdateSubmission(spec))}>
            {spec.confirm_label}
          </Button>
        </div>
      )}
    </div>
  );
}

// ACCIÓN GOBERNADA "ABRIR EXPEDIENTE" (MP-CTRL-0138). Tarjeta con un botón que, al hacer clic el médico,
// cambia el contexto activo del shell (que monta el panel del paciente). Si está bloqueada (sin permiso
// de ver pacientes) se pinta fija con su motivo. Si no hay handler de apertura (uso independiente sin
// shell) el botón queda deshabilitado: nada navega automáticamente desde la salida del modelo.
function OpenRecordCard({
  spec,
  onOpenRecord,
}: Readonly<{ spec: OpenRecordSpec; onOpenRecord?: (context: ActiveClinicalContext) => void }>) {
  const blocked = spec.disposition === "blocked";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">🗂️</span>
        <span className="text-xs font-medium text-[var(--tx)]">{spec.patient_label}</span>
      </div>

      {blocked ? (
        <div className="rounded-[10px] border border-[var(--danger)] px-3 py-2 text-[11px] text-[var(--danger)]">
          Bloqueada: {spec.reason}
        </div>
      ) : (
        <div>
          <Button
            type="button"
            disabled={!onOpenRecord}
            onClick={() => onOpenRecord?.(openRecordToContext(spec))}
          >
            {spec.label}
          </Button>
        </div>
      )}
    </div>
  );
}

// ASISTENTE MULTI-PASO GUIADO (MP-CTRL-0139). Lista los pasos EN ORDEN con su estado (hecho / actual /
// pendiente / a la espera de dependencias / bloqueado por RBAC), resalta el paso actual, marca los
// requeridos que faltan y los campos ignorados. Al confirmar, envía un seguimiento para que el agente
// avance SÓLO con el paso actual por la aprobación P1 (uno a la vez, sin saltarse el orden). No escribe.
const WIZARD_STATE_LABEL: Record<WizardStepState, string> = {
  done: "Hecho",
  current: "Paso actual",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

function WizardView({
  spec,
  onSendFollowup,
}: Readonly<{ spec: WizardSpec; onSendFollowup: (text: string) => void }>) {
  const { plan } = spec;
  return (
    <div className="flex flex-col gap-3">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}

      <div className="rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2 text-xs text-[var(--tx2)]">
        Progreso: {plan.summary.done}/{plan.summary.total} hechos · {plan.summary.pending} pendientes
        {plan.summary.blocked > 0 ? ` · ${plan.summary.blocked} bloqueados` : ""}
      </div>

      <ol className="flex flex-col gap-2">
        {plan.steps.map((step, index) => {
          const isCurrent = step.state === "current";
          const isBlocked = step.state === "blocked";
          const waiting = step.state !== "done" && !isBlocked && step.blocked_by.length > 0;
          return (
            <li
              key={step.id}
              className={`flex flex-col gap-1 rounded-[10px] border p-2 ${
                isBlocked
                  ? "border-[var(--danger)]"
                  : isCurrent
                    ? "border-[var(--accent-bd)] bg-[var(--accent-dim)]"
                    : "border-[var(--border2)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--tx)]">
                  {index + 1}. {step.title}
                </span>
                <span className="text-[10px] text-[var(--tx2)]">
                  {step.template_id ? `plantilla ${step.template_id}` : step.target_resource} ·{" "}
                  {WIZARD_STATE_LABEL[step.state]}
                </span>
              </div>

              {step.source_fragment && (
                <p className="text-[11px] italic text-[var(--tx2)]">«{step.source_fragment}»</p>
              )}

              {isBlocked ? (
                <div className="text-[11px] text-[var(--danger)]">
                  {WIZARD_STATE_LABEL.blocked}: {step.reason}
                </div>
              ) : (
                <>
                  {Object.keys(step.values).length > 0 && (
                    <div className="text-[11px] text-[var(--tx2)]">
                      {Object.entries(step.values)
                        .map(([field, value]) => `${field}: ${renderValue(value)}`)
                        .join("  ·  ")}
                    </div>
                  )}
                  {waiting && (
                    <div className="text-[11px] text-[var(--tx2)]">
                      A la espera de: {step.blocked_by.join(", ")}
                    </div>
                  )}
                  {step.missing_required.length > 0 && (
                    <div className="text-[11px] text-[var(--danger)]">
                      Faltan campos requeridos: {step.missing_required.join(", ")}
                    </div>
                  )}
                  {step.dropped_fields.length > 0 && (
                    <div className="text-[11px] text-[var(--tx2)]">
                      Campos ignorados (fuera del esquema): {step.dropped_fields.join(", ")}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>

      <div>
        <Button
          type="button"
          disabled={plan.current_step_id === null}
          onClick={() => onSendFollowup(buildWizardSubmission(spec.confirm_prompt, plan))}
        >
          {spec.confirm_label}
        </Button>
      </div>
    </div>
  );
}
