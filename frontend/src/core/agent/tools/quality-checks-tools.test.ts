import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog } from "../tool-catalog.ts";

// NUEVO CLUSTER — Verificaciones de calidad/seguridad clínica (fase 1). Lectura (no gateada en
// cliente; FastAPI exige quality_checks:read): run_quality_checks hace POST {target_type,
// target_id} a /quality/check y devuelve banderas que el médico REVISA. El agente las presenta
// como sugerencias, nunca como correcciones; no actúa sobre ellas.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("run_quality_checks: es una lectura (kind read), sin metadata de aprobación", () => {
  const tool = getTool("clinical.run_quality_checks");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "read");
  assert.equal(tool.approval, undefined);
});

test("run_quality_checks: hace POST {target_type, target_id} a /quality/check", async (t) => {
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedBody: unknown = null;
  let capturedContentType: string | null = null;
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    capturedUrl = String(url);
    capturedMethod = String(init.method);
    capturedBody = JSON.parse(String(init.body));
    capturedContentType = new Headers(init.headers).get("content-type");
    assert.equal(init.credentials, "include");
    return jsonResponse(200, {
      target_type: "consultation",
      target_id: "11111111-1111-1111-1111-111111111111",
      flags: [
        {
          rule_id: "vitals_out_of_physiologic_range",
          severity: "warning",
          message: "TA sistólica = 400 mmHg está fuera del rango fisiológico de plausibilidad...",
          source_ref: "vital_sign:abc.systolic_bp",
          threshold_cited: "TA sistólica: rango fisiológico de plausibilidad 40–300 mmHg",
        },
      ],
      flag_count: 1,
    });
  });
  const args = {
    target_type: "consultation",
    target_id: "11111111-1111-1111-1111-111111111111",
  };
  const resolved = resolveToolCall("clinical.run_quality_checks", args);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(capturedUrl, "/api/v1/quality/check");
  assert.equal(capturedMethod, "POST");
  assert.equal(capturedContentType, "application/json");
  assert.deepEqual(capturedBody, args);
  assert.equal(result.status, "success");
});

test("run_quality_checks: target_type y target_id son obligatorios; target_type acotado", () => {
  assert.equal(
    resolveToolCall("clinical.run_quality_checks", { target_type: "consultation" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.run_quality_checks", {
      target_id: "11111111-1111-1111-1111-111111111111",
    }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.run_quality_checks", {
      target_type: "doctor", target_id: "11111111-1111-1111-1111-111111111111",
    }).outcome,
    "invalid_args",
  );
  // Campo desconocido -> rechazado (additionalProperties: false).
  assert.equal(
    resolveToolCall("clinical.run_quality_checks", {
      target_type: "patient", target_id: "11111111-1111-1111-1111-111111111111", fix: true,
    }).outcome,
    "invalid_args",
  );
});

test("run_quality_checks: propaga el 403 del servidor (RBAC quality_checks:read)", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse(403, { code: "forbidden", message: "No autorizado" }),
  );
  const resolved = resolveToolCall("clinical.run_quality_checks", {
    target_type: "patient", target_id: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "error");
});

test("run_quality_checks (fase 2): pasa por banderas de fármaco-alergia y duplicidad", async (t) => {
  const body = {
    target_type: "consultation",
    target_id: "11111111-1111-1111-1111-111111111111",
    flags: [
      {
        rule_id: "drug_allergy_cross_check",
        severity: "warning",
        message: "El medicamento 'Ibuprofeno 400 mg' coincide con una alergia documentada...",
        source_ref: "prescription_item:a|patient_clinical_item:b:aine",
        threshold_cited: "Coincidencia por ingrediente/clase resuelta por la fuente de farmacología configurada.",
      },
      {
        rule_id: "duplicate_active_medication",
        severity: "warning",
        message: "El medicamento 'Paracetamol' aparece 2 veces...",
        source_ref: "prescription_item:c, prescription_item:d",
        threshold_cited: "Mismo medicamento (por nombre normalizado) en más de una indicación activa.",
      },
    ],
    flag_count: 2,
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.run_quality_checks", {
    target_type: "consultation", target_id: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.deepEqual(result.content, body);
});

test("run_quality_checks (fase 2): refleja el marcador 'no disponible' del cruce fármaco-alergia", async (t) => {
  const body = {
    target_type: "patient",
    target_id: "11111111-1111-1111-1111-111111111111",
    flags: [
      {
        rule_id: "drug_allergy_cross_check",
        severity: "info",
        message: "Cruce fármaco-alergia NO disponible: no hay fuente de farmacología (MCP)...",
        source_ref: "drug_allergy:no_disponible",
        threshold_cited: null,
      },
    ],
    flag_count: 1,
  };
  t.mock.method(globalThis, "fetch", async () => jsonResponse(200, body));
  const resolved = resolveToolCall("clinical.run_quality_checks", {
    target_type: "patient", target_id: "11111111-1111-1111-1111-111111111111",
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") throw new Error("no ready");
  const result = await executeTool(resolved.tool, resolved.args);
  assert.equal(result.status, "success");
  if (result.status === "success") {
    const flag = (result.content as typeof body).flags[0];
    assert.equal(flag.source_ref, "drug_allergy:no_disponible");
    assert.equal(flag.severity, "info");
  }
});

test("run_quality_checks: es lectura, no se gatea por rol en cliente", () => {
  const tools = listTools();
  const catalog = buildToolCatalog(tools, new Set<string>());
  assert.notEqual(
    catalog.find((entry) => entry.name === "clinical.run_quality_checks")?.status,
    "gated_out",
  );
});

test("run_quality_checks: descubrible vía tool_search", () => {
  const tools = listTools();
  const hits = searchTools(
    "verificar calidad seguridad signos vitales fuera de rango receta incompleta",
    tools,
    10,
  );
  assert.ok(hits.some((hit) => hit.name === "clinical.run_quality_checks"));
});
