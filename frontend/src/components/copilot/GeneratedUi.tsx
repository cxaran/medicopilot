"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  buildFormSubmissionMessage,
  buttonActionToMessage,
  type ButtonsSpec,
  type ChartSpec,
  type FormSpec,
  type UiSpec,
} from "@/core/agent/tools/ui-spec";

// Render seguro de UI generada por el modelo (B9, Parte B): specs declarativas mapeadas a
// componentes React con los primitivos R2. NUNCA HTML/JS crudo del modelo.
export function GeneratedUi({
  spec,
  onSendFollowup,
}: Readonly<{ spec: UiSpec; onSendFollowup: (text: string) => void }>) {
  if (spec.kind === "form") {
    return <FormView spec={spec} onSubmit={(values) => onSendFollowup(buildFormSubmissionMessage(spec, values))} />;
  }
  if (spec.kind === "chart") {
    return <ChartView spec={spec} />;
  }
  return <ButtonsView spec={spec} onAction={(action) => onSendFollowup(buttonActionToMessage(action))} />;
}

function FormView({
  spec,
  onSubmit,
}: Readonly<{ spec: FormSpec; onSubmit: (values: Record<string, string>) => void }>) {
  const [values, setValues] = useState<Record<string, string>>({});
  const setValue = (name: string, value: string): void =>
    setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}
      {spec.description && <p className="text-xs text-[var(--tx2)]">{spec.description}</p>}

      {spec.fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
          <span>
            {field.label}
            {field.required && <span className="text-[var(--danger)]"> *</span>}
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

      <div>
        <Button type="submit">{spec.submit_label}</Button>
      </div>
    </form>
  );
}

function ChartView({ spec }: Readonly<{ spec: ChartSpec }>) {
  const max = Math.max(1, ...spec.data.map((datum) => Math.abs(datum.value)));
  const rowHeight = 26;
  const labelWidth = 110;
  const barAreaWidth = 220;
  const valueWidth = 50;
  const width = labelWidth + barAreaWidth + valueWidth;
  const height = spec.data.length * rowHeight;

  return (
    <div className="flex flex-col gap-2">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={spec.title ?? "Gráfico de barras"}
      >
        {spec.data.map((datum, index) => {
          const y = index * rowHeight;
          const barWidth = Math.max(2, (Math.abs(datum.value) / max) * barAreaWidth);
          return (
            <g key={`${datum.label}-${index}`}>
              <text x={0} y={y + rowHeight * 0.65} fontSize={11} fill="var(--tx2)">
                {datum.label.length > 16 ? `${datum.label.slice(0, 16)}…` : datum.label}
              </text>
              <rect
                x={labelWidth}
                y={y + 4}
                width={barWidth}
                height={rowHeight - 10}
                rx={3}
                fill="var(--accent)"
              />
              <text x={labelWidth + barWidth + 6} y={y + rowHeight * 0.65} fontSize={11} fill="var(--tx)">
                {datum.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ButtonsView({
  spec,
  onAction,
}: Readonly<{ spec: ButtonsSpec; onAction: (action: ButtonsSpec["buttons"][number]["action"]) => void }>) {
  return (
    <div className="flex flex-col gap-2">
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}
      <div className="flex flex-wrap gap-2">
        {spec.buttons.map((button, index) => (
          <Button key={`${button.label}-${index}`} type="button" onClick={() => onAction(button.action)}>
            {button.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
