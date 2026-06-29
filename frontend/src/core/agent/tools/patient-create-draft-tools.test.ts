import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { getTool, listTools, type ToolExecutionContext } from "./registry.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";
import { buildClinicalActionPlan } from "../approval-protocol.ts";

// CONVERSACIÓN→EXPEDIENTE (casos 116/117/119/123): alta de paciente como BORRADOR P1 con
// prefill + dedup. La tool es de ESCRITURA (pasa por aprobación; nunca autocrea). Antes de crear
// busca duplicados (0113) y, si hay coincidencia fuerte, NO crea y los devuelve para que el
// médico elija. Valida formatos NOMBRANDO el campo. Los campos ausentes quedan vacíos.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Contexto de prueba que registra cada llamada HTTP y responde de forma programable.
function recordingCtx(
  handler: (url: string, init?: { method?: string; body?: unknown }) => unknown,
): { ctx: ToolExecutionContext; calls: { url: string; method: string }[] } {
  const calls: { url: string; method: string }[] = [];
  const ctx = {
    api: async (url: string, init?: { method?: string; body?: unknown }) => {
      calls.push({ url, method: init?.method ?? "GET" });
      return handler(url, init);
    },
    sandbox: { run: async () => ({ ok: true, value: null }) },
  } as unknown as ToolExecutionContext;
  return { ctx, calls };
}

const NEW_PATIENT = {
  full_name: "María Fernanda López",
  birth_date: "1992-08-15",
  sex: "female",
  phone: "5512345678",
};

test("create_patient_draft: es escritura y arma el plan canónico de aprobación", () => {
  const tool = getTool("clinical.create_patient_draft");
  assert.ok(tool);
  if (!tool) return;
  assert.equal(tool.kind, "write");
  assert.ok(tool.approval);
  const plan = buildClinicalActionPlan(tool, NEW_PATIENT);
  assert.equal(plan.actionType, "create_patient_draft");
  assert.equal(plan.targetResource, "patients");
  assert.match(plan.humanReadableSummary, /María Fernanda López/);
});

test("create_patient_draft: gated por permiso de creación en patients", () => {
  const tools = listTools();
  const gatedOut = buildToolCatalog(tools, new Set<string>()).find(
    (e) => e.name === "clinical.create_patient_draft",
  );
  assert.equal(gatedOut?.status, "gated_out");
  const effective = new Set(
    effectiveTools(tools, new Set<string>(["patients"])).map((t) => t.name),
  );
  assert.ok(effective.has("clinical.create_patient_draft"));
});

test("create_patient_draft: requiere full_name, birth_date y sex", () => {
  assert.equal(
    resolveToolCall("clinical.create_patient_draft", { full_name: "X", birth_date: "1990-01-01" }).outcome,
    "invalid_args",
  );
  assert.equal(
    resolveToolCall("clinical.create_patient_draft", { full_name: "X", sex: "female" }).outcome,
    "invalid_args",
  );
});

test("create_patient_draft: valida formato nombrando el campo (CURP/fecha/teléfono/sexo)", () => {
  const badMessage = (over: Record<string, unknown>): string => {
    const r = resolveToolCall("clinical.create_patient_draft", { ...NEW_PATIENT, ...over });
    assert.equal(r.outcome, "invalid_args");
    if (r.outcome !== "invalid_args" || r.result.status !== "error") throw new Error("no error");
    return r.result.message;
  };
  assert.match(badMessage({ curp: "NO-ES-CURP" }), /curp/); // CURP mal formada nombra 'curp'
  assert.match(badMessage({ birth_date: "15/08/1992" }), /birth_date/); // fecha nombra 'birth_date'
  assert.match(badMessage({ phone: "abc" }), /phone/); // teléfono nombra 'phone'
  assert.match(badMessage({ sex: "x" }), /sex/); // sexo fuera del enum nombra 'sex'
});

test("create_patient_draft: CURP válida (cualquier caso) pasa la validación", () => {
  const ok = resolveToolCall("clinical.create_patient_draft", {
    ...NEW_PATIENT, curp: "LXMF920815MDFLPR03",
  });
  assert.equal(ok.outcome, "ready");
});

test("create_patient_draft: coincidencia fuerte -> NO crea, devuelve duplicados", async () => {
  const { ctx, calls } = recordingCtx((url) => {
    if (url.includes("/patients/search")) {
      return { has_strong_match: true, candidates: [{ id: "p1", full_name: "María F. López" }] };
    }
    throw new Error(`no debería llamar a ${url}`);
  });
  const resolved = resolveToolCall("clinical.create_patient_draft", NEW_PATIENT);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const result = await executeTool(resolved.tool, resolved.args, ctx);
  assert.equal(result.status, "success");
  const content = (result as { content: { created: boolean; possible_duplicates: unknown[] } }).content;
  assert.equal(content.created, false); // NO se creó
  assert.equal(content.possible_duplicates.length, 1);
  // Sólo se llamó a la búsqueda; NUNCA al POST de creación.
  assert.deepEqual(calls.map((c) => c.method), ["GET"]);
  assert.ok(!calls.some((c) => c.method === "POST"));
});

test("create_patient_draft: sin duplicado -> crea (POST /patients) con campos presentes", async () => {
  const { ctx, calls } = recordingCtx((url, init) => {
    if (url.includes("/patients/search")) return { has_strong_match: false, candidates: [] };
    if (url === "/api/v1/patients" && init?.method === "POST") {
      // Campos ausentes (email/curp/address) NO se envían (no se rellenan por defecto).
      assert.deepEqual(init.body, {
        full_name: NEW_PATIENT.full_name,
        birth_date: NEW_PATIENT.birth_date,
        sex: NEW_PATIENT.sex,
        phone: NEW_PATIENT.phone,
      });
      return { id: "new-1", full_name: NEW_PATIENT.full_name };
    }
    throw new Error(`url inesperada ${url}`);
  });
  const resolved = resolveToolCall("clinical.create_patient_draft", NEW_PATIENT);
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const result = await executeTool(resolved.tool, resolved.args, ctx);
  assert.equal(result.status, "success");
  const content = (result as { content: { created: boolean } }).content;
  assert.equal(content.created, true);
  assert.deepEqual(calls.map((c) => c.method), ["GET", "POST"]);
});

test("create_patient_draft: con acknowledge_duplicates crea pese a coincidencia", async () => {
  const { ctx, calls } = recordingCtx((url, init) => {
    if (url.includes("/patients/search")) return { has_strong_match: true, candidates: [{ id: "p1" }] };
    if (url === "/api/v1/patients" && init?.method === "POST") {
      // acknowledge_duplicates NO se envía al backend (no es campo del paciente).
      assert.ok(!("acknowledge_duplicates" in (init.body as object)));
      return { id: "new-2" };
    }
    throw new Error(`url inesperada ${url}`);
  });
  const resolved = resolveToolCall("clinical.create_patient_draft", {
    ...NEW_PATIENT, acknowledge_duplicates: true,
  });
  assert.equal(resolved.outcome, "ready");
  if (resolved.outcome !== "ready") return;
  const result = await executeTool(resolved.tool, resolved.args, ctx);
  const content = (result as { content: { created: boolean } }).content;
  assert.equal(content.created, true);
  assert.ok(calls.some((c) => c.method === "POST"));
});
