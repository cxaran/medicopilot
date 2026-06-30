// Vista de los reportes agregados (server component, sólo lectura). Renderiza los 4 reportes con
// los componentes de presentación y un formulario GET para cambiar la ventana de fechas (sin JS de
// cliente: el submit recarga la página con ?from=&to=). La lógica pura vive en core/reports/reports.ts.

import {
  activityMax,
  barPercent,
  formatPercent,
  type ReportsData,
} from "@/core/reports/reports";

function Card({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-5">
      <h2 className="text-sm font-semibold text-[var(--tx)]">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: Readonly<{ text: string }>) {
  return <p className="text-sm text-[var(--tx3)]">{text}</p>;
}

export function ReportsView({ data }: Readonly<{ data: ReportsData }>) {
  const max = activityMax(data.activity);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--tx)]">Reportes</h1>
          <p className="text-sm text-[var(--tx2)]">
            Agregados de actividad, asistencia y calidad (sólo lectura). No incluye datos
            identificables del paciente.
          </p>
        </div>
        {/* Ventana de fechas: GET form, sin estado de cliente. */}
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
            Desde
            <input
              type="date"
              name="from"
              defaultValue={data.rangeFrom}
              className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-2 py-1.5 text-[var(--tx)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--tx2)]">
            Hasta
            <input
              type="date"
              name="to"
              defaultValue={data.rangeTo}
              className="rounded-[8px] border border-[var(--border2)] bg-[var(--panel2)] px-2 py-1.5 text-[var(--tx)]"
            />
          </label>
          <button
            type="submit"
            className="rounded-[8px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--on-accent)] transition hover:opacity-90"
          >
            Aplicar
          </button>
        </form>
      </div>

      {!data.available ? (
        <div className="rounded-[14px] border border-[var(--border2)] bg-[var(--panel)] p-6">
          <p className="text-sm text-[var(--warn)]">
            No tienes permiso para ver los reportes (se requiere <code>reports:read</code>). Pide a
            un administrador que lo habilite en tu rol.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Asistencia */}
          <Card title="Asistencia a citas">
            {data.attendance && data.attendance.total > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Asistió" value={data.attendance.attended} pct={formatPercent(data.attendance.attended_rate)} tone="var(--ok)" />
                  <Stat label="No asistió" value={data.attendance.no_show} pct={formatPercent(data.attendance.no_show_rate)} tone="var(--danger)" />
                  <Stat label="Cancelada" value={data.attendance.cancelled} pct={formatPercent(data.attendance.cancelled_rate)} tone="var(--warn)" />
                </div>
                <p className="text-xs text-[var(--tx3)]">Total de citas con resultado: {data.attendance.total}.</p>
              </div>
            ) : (
              <Empty text="Sin citas con resultado en la ventana." />
            )}
          </Card>

          {/* Notas sin firmar */}
          <Card title="Consultas sin firmar (por médico)">
            {data.unsignedNotes.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {data.unsignedNotes.map((item) => (
                  <li key={item.doctor_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-[var(--tx)]">{item.doctor_name}</span>
                    <span className="shrink-0 rounded-full bg-[var(--panel2)] px-2 py-0.5 text-xs font-semibold text-[var(--tx2)]">
                      {item.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No hay consultas en borrador sin firmar." />
            )}
          </Card>

          {/* Actividad por mes */}
          <Card title="Actividad por mes">
            {data.activity.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {data.activity.map((point) => (
                  <div key={point.period} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--tx2)]">
                      <span>{point.period}</span>
                      <span>
                        {point.consultations} consultas · {point.appointments} citas
                      </span>
                    </div>
                    <Bar value={point.consultations} max={max} tone="var(--accent)" />
                    <Bar value={point.appointments} max={max} tone="var(--info)" />
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Sin actividad en la ventana." />
            )}
          </Card>

          {/* Top diagnósticos */}
          <Card title="Diagnósticos más frecuentes">
            {data.topDiagnoses.length > 0 ? (
              <ol className="flex flex-col gap-1.5">
                {data.topDiagnoses.map((item, index) => (
                  <li key={`${item.code_or_text}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-[var(--tx)]">
                      <span className="mr-2 text-[var(--tx3)]">{index + 1}.</span>
                      {item.code_or_text}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--panel2)] px-2 py-0.5 text-xs font-semibold text-[var(--tx2)]">
                      {item.count}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty text="Sin diagnósticos registrados en la ventana." />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  pct,
  tone,
}: Readonly<{ label: string; value: number; pct: string; tone: string }>) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--border2)] bg-[var(--panel2)] p-3">
      <span className="text-lg font-semibold" style={{ color: tone }}>
        {value}
      </span>
      <span className="text-xs text-[var(--tx2)]">{label}</span>
      <span className="text-xs text-[var(--tx3)]">{pct}</span>
    </div>
  );
}

function Bar({ value, max, tone }: Readonly<{ value: number; max: number; tone: string }>) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border2)]">
      <div
        className="h-full rounded-full"
        style={{ width: `${barPercent(value, max)}%`, backgroundColor: tone }}
      />
    </div>
  );
}
