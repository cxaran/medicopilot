import { requireSession } from "@/core/auth/session";
import { ReportsView } from "@/components/reports/ReportsView";
import { defaultReportRange, isIsoDate } from "@/core/reports/reports";
import { getReportsData } from "@/core/reports/reports-data";

// Ruta dedicada de REPORTES (cobertura backend↔frontend: antes los /reports/* solo los tocaba el
// agente). Server component: parsea la ventana de fechas de los searchParams (o usa el rango por
// defecto de 6 meses), lee los 4 reportes agregados y delega el render a ReportsView. Sólo lectura;
// degrada con aviso si el rol no tiene reports:read.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  await requireSession();
  const params = await searchParams;

  const fallback = defaultReportRange(new Date());
  const fromParam = single(params.from);
  const toParam = single(params.to);
  const from = isIsoDate(fromParam) ? fromParam : fallback.from;
  const to = isIsoDate(toParam) ? toParam : fallback.to;

  const data = await getReportsData(from, to);
  return <ReportsView data={data} />;
}
