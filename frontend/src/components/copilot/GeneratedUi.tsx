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
import {
  buildDynamicFormSubmission,
  type DynamicFormSpec,
  type DynamicWidget,
} from "@/core/agent/tools/dynamic-form";

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
  if (spec.kind === "dynamic_form") {
    return (
      <DynamicFormView
        spec={spec}
        onSubmit={(values) => onSendFollowup(buildDynamicFormSubmission(spec, values))}
      />
    );
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
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {spec.title && <div className="text-sm font-semibold text-[var(--tx)]">{spec.title}</div>}
      {spec.description && <p className="text-xs text-[var(--tx2)]">{spec.description}</p>}

      {spec.widgets.map((widget, index) => (
        <DynamicWidgetView
          key={widgetKey(widget, index)}
          widget={widget}
          values={values}
          setValue={setValue}
        />
      ))}

      <div>
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
