import "server-only";

import { cookies } from "next/headers";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import type {
  ActivityPoint,
  AttendanceReport,
  ReportsData,
  TopDiagnosis,
  UnsignedNotesItem,
} from "@/core/reports/reports";

// Obtención server-only de los reportes agregados (GET /api/v1/reports/*). Cada lectura degrada a
// su valor vacío ante 403 (sin reports:read) u otro error: la página nunca se rompe. Si TODAS las
// lecturas dan 403 se marca ``available=false`` para mostrar el aviso de "sin acceso". Sólo lectura.

const TOP_DIAGNOSES_LIMIT = 10;

interface Fetched<T> {
  value: T;
  forbidden: boolean;
}

async function read<T>(path: string, cookie: string, fallback: T): Promise<Fetched<T>> {
  try {
    const value = await serverApi<T>(path, { cookie });
    return { value, forbidden: false };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return { value: fallback, forbidden: error.status === 403 };
    }
    return { value: fallback, forbidden: false };
  }
}

/** Lee los 4 reportes para la ventana [from, to] (fechas civiles YYYY-MM-DD ya validadas). */
export async function getReportsData(from: string, to: string): Promise<ReportsData> {
  const cookie = (await cookies()).toString();
  const window = `date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}`;

  const [activity, top, unsigned, attendance] = await Promise.all([
    read<ActivityPoint[]>(`/api/v1/reports/activity?${window}`, cookie, []),
    read<TopDiagnosis[]>(`/api/v1/reports/top-diagnoses?${window}&limit=${TOP_DIAGNOSES_LIMIT}`, cookie, []),
    read<UnsignedNotesItem[]>(`/api/v1/reports/unsigned-notes`, cookie, []),
    read<AttendanceReport | null>(`/api/v1/reports/attendance?${window}`, cookie, null),
  ]);

  const available = !(
    activity.forbidden &&
    top.forbidden &&
    unsigned.forbidden &&
    attendance.forbidden
  );

  return {
    available,
    rangeFrom: from,
    rangeTo: to,
    activity: activity.value ?? [],
    topDiagnoses: top.value ?? [],
    unsignedNotes: unsigned.value ?? [],
    attendance: attendance.value ?? null,
  };
}
