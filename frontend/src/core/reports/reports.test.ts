import test from "node:test";
import assert from "node:assert/strict";

import {
  activityMax,
  barPercent,
  defaultReportRange,
  formatPercent,
  isIsoDate,
} from "./reports.ts";

// Lógica PURA de presentación de reportes. La obtención (server-only) y el render se validan aparte.

test("defaultReportRange: ventana de 6 meses que termina hoy (UTC, determinista)", () => {
  const range = defaultReportRange(new Date(Date.UTC(2026, 5, 29))); // 2026-06-29
  assert.equal(range.from, "2026-01-01"); // 5 meses atrás, primer día
  assert.equal(range.to, "2026-06-29");
});

test("defaultReportRange: cruza el año hacia atrás", () => {
  const range = defaultReportRange(new Date(Date.UTC(2026, 1, 15))); // 2026-02-15
  assert.equal(range.from, "2025-09-01");
  assert.equal(range.to, "2026-02-15");
});

test("isIsoDate: valida YYYY-MM-DD", () => {
  assert.equal(isIsoDate("2026-06-29"), true);
  assert.equal(isIsoDate("2026-6-9"), false);
  assert.equal(isIsoDate("ayer"), false);
  assert.equal(isIsoDate(undefined), false);
  assert.equal(isIsoDate(null), false);
});

test("formatPercent: un decimal, acotado 0..1", () => {
  assert.equal(formatPercent(0.4231), "42.3%");
  assert.equal(formatPercent(0), "0.0%");
  assert.equal(formatPercent(1), "100.0%");
  assert.equal(formatPercent(1.5), "100.0%"); // acotado
  assert.equal(formatPercent(-0.2), "0.0%"); // acotado
  assert.equal(formatPercent(Number.NaN), "0.0%"); // defensivo
});

test("activityMax y barPercent: escala de barras", () => {
  const points = [
    { period: "2026-01", consultations: 10, appointments: 4 },
    { period: "2026-02", consultations: 6, appointments: 20 },
  ];
  assert.equal(activityMax(points), 20);
  assert.equal(activityMax([]), 0);
  assert.equal(barPercent(10, 20), 50);
  assert.equal(barPercent(20, 20), 100);
  assert.equal(barPercent(5, 0), 0); // máximo 0 → 0 (sin división por cero)
});
