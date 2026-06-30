import test from "node:test";
import assert from "node:assert/strict";

import { executeTool, resolveToolCall } from "./tool-runner.ts";
import { listTools } from "./registry.ts";
import { searchTools } from "../tool-discovery.ts";
import { buildToolCatalog, effectiveTools } from "../tool-catalog.ts";

// G1: tools de lectura clínica con filtros (patient_id + rango de fecha + paginación). Se verifica
// que CADA tool pega al endpoint REST correcto y arma EXACTAMENTE el query string que el backend
// honra (igualdad -> ``<campo>``; rango -> ``<campo>_from``/``<campo>_to`` con date YYYY-MM-DD), que
// los filtros no soportados se RECHAZAN localmente (additionalProperties:false), que las lecturas
// nunca se gatean por rol y que son descubribles vía tool_search.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const DOCTOR_ID = "22222222-2222-2222-2222-222222222222";
const CONSULTATION_ID = "33333333-3333-3333-3333-333333333333";

// Ejecuta una tool capturando la URL pedida; devuelve la URL y el resultado.
async function callTool(
  t: { mock: { method: typeof import("node:test").mock.method } },
  name: string,
  args: Record<string, unknown>,
  body: unknown = { items: [], pagination: {} },
): Promise<{ url: string; result: Awaited<ReturnType<typeof executeTool>> }> {
  let captured = "";
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    captured = String(url);
    assert.equal(init.credentials, "include");
    return jsonResponse(200, body);
  });
  const resolved = resolveToolCall(name, args);
  assert.equal(resolved.outcome, "ready", `esperado ready para ${name}`);
  if (resolved.outcome !== "ready") throw new Error("no ready");
  assert.equal(resolved.tool.kind, "read");
  const result = await executeTool(resolved.tool, resolved.args);
  return { url: captured, result };
}

test("list_recent_consultations: patient_id + estado + rango de fecha -> consulted_at_from/to", async (t) => {
  const { url, result } = await callTool(t, "clinical.list_recent_consultations", {
    patient_id: PATIENT_ID,
    attending_doctor_id: DOCTOR_ID,
    status: "finalized",
    date_from: "2026-01-01",
    date_to: "2026-06-30",
    limit: 50,
  });
  assert.equal(result.status, "success");
  assert.ok(url.startsWith("/api/v1/consultations?"));
  assert.equal(
    url,
    `/api/v1/consultations?patient_id=${PATIENT_ID}&attending_doctor_id=${DOCTOR_ID}` +
      `&status=finalized&consulted_at_from=2026-01-01&consulted_at_to=2026-06-30&limit=50`,
  );
});

test("list_recent_consultations: sin filtros -> sin query string", async (t) => {
  const { url } = await callTool(t, "clinical.list_recent_consultations", {});
  assert.equal(url, "/api/v1/consultations");
});

test("list_recent_consultations: parámetro no soportado -> args inválidos (no se envía)", () => {
  const resolved = resolveToolCall("clinical.list_recent_consultations", { reason: "dolor" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_appointments: patient_id + doctor_id + rango -> scheduled_date_from/to", async (t) => {
  const { url } = await callTool(t, "clinical.list_appointments", {
    patient_id: PATIENT_ID,
    doctor_id: DOCTOR_ID,
    date_from: "2026-03-01",
    date_to: "2026-03-31",
  });
  assert.equal(
    url,
    `/api/v1/appointments?patient_id=${PATIENT_ID}&doctor_id=${DOCTOR_ID}` +
      `&scheduled_date_from=2026-03-01&scheduled_date_to=2026-03-31`,
  );
});

test("list_prescriptions: solo consultation_id + status (sin patient_id ni fecha)", async (t) => {
  const { url } = await callTool(t, "clinical.list_prescriptions", {
    consultation_id: CONSULTATION_ID,
    status: "approved",
  });
  assert.equal(url, `/api/v1/prescriptions?consultation_id=${CONSULTATION_ID}&status=approved`);
});

test("list_prescriptions: rechaza patient_id (el backend no lo honra)", () => {
  const resolved = resolveToolCall("clinical.list_prescriptions", { patient_id: PATIENT_ID });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_vital_signs: consultation_id + rango -> measured_at_from/to", async (t) => {
  const { url } = await callTool(t, "clinical.list_vital_signs", {
    consultation_id: CONSULTATION_ID,
    date_from: "2026-02-01",
    date_to: "2026-02-28",
  });
  assert.equal(
    url,
    `/api/v1/vital-signs?consultation_id=${CONSULTATION_ID}` +
      `&measured_at_from=2026-02-01&measured_at_to=2026-02-28`,
  );
});

test("list_documents: filtros + URL de descarga derivada por item (sin leer bytes)", async (t) => {
  const { url, result } = await callTool(
    t,
    "clinical.list_documents",
    {
      patient_id: PATIENT_ID,
      document_type: "lab_result",
      date_from: "2026-01-01",
      date_to: "2026-06-30",
    },
    { items: [{ id: "doc-1", original_filename: "labs.pdf" }], pagination: {} },
  );
  assert.equal(
    url,
    `/api/v1/clinical-documents?patient_id=${PATIENT_ID}&document_type=lab_result` +
      `&uploaded_at_from=2026-01-01&uploaded_at_to=2026-06-30`,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const content = result.content as { items: Array<{ id: string; download_url?: string }> };
  assert.equal(content.items[0]?.download_url, "/api/v1/clinical-documents/doc-1/download");
});

test("list_diagnoses: consultation_id + diagnosis_kind (enum), sin fecha", async (t) => {
  const { url } = await callTool(t, "clinical.list_diagnoses", {
    consultation_id: CONSULTATION_ID,
    diagnosis_kind: "primary",
  });
  assert.equal(
    url,
    `/api/v1/consultation-diagnoses?consultation_id=${CONSULTATION_ID}&diagnosis_kind=primary`,
  );
});

test("list_diagnoses: diagnosis_kind fuera del enum -> args inválidos", () => {
  const resolved = resolveToolCall("clinical.list_diagnoses", { diagnosis_kind: "tentative" });
  assert.equal(resolved.outcome, "invalid_args");
});

test("list_medical_history_versions: patient_id + status", async (t) => {
  const { url } = await callTool(t, "clinical.list_medical_history_versions", {
    patient_id: PATIENT_ID,
    status: "current",
  });
  assert.equal(url, `/api/v1/medical-history-versions?patient_id=${PATIENT_ID}&status=current`);
});

test("list_doctors: status + rango -> created_at_from/to", async (t) => {
  const { url } = await callTool(t, "clinical.list_doctors", {
    status: "active",
    date_from: "2026-01-01",
    date_to: "2026-12-31",
  });
  assert.equal(
    url,
    "/api/v1/doctors?status=active&created_at_from=2026-01-01&created_at_to=2026-12-31",
  );
});

test("list_medication_templates: doctor_id + status (sin fecha)", async (t) => {
  const { url } = await callTool(t, "clinical.list_medication_templates", {
    doctor_id: DOCTOR_ID,
    status: "active",
  });
  assert.equal(url, `/api/v1/medication-templates?doctor_id=${DOCTOR_ID}&status=active`);
});

test("tool_search: las nuevas lecturas clínicas son descubribles por intención", () => {
  const tools = listTools();
  const expectVisible = [
    { query: "signos vitales", name: "clinical.list_vital_signs" },
    { query: "documentos clínicos descarga", name: "clinical.list_documents" },
    { query: "diagnósticos consulta", name: "clinical.list_diagnoses" },
    { query: "historia clínica versiones", name: "clinical.list_medical_history_versions" },
    { query: "médicos doctores", name: "clinical.list_doctors" },
    { query: "plantillas medicamentos", name: "clinical.list_medication_templates" },
  ];
  for (const { query, name } of expectVisible) {
    const hits = searchTools(query, tools, 10);
    assert.ok(
      hits.some((hit) => hit.name === name),
      `tool_search('${query}') debería incluir ${name}`,
    );
  }
});

test("catálogo: las lecturas clínicas nuevas NO se gatean por rol (sin permisos de creación)", () => {
  const tools = listTools();
  // Médico sin permiso de creación en ningún recurso: las escrituras se gatean, las lecturas no.
  const catalog = buildToolCatalog(tools, new Set<string>());
  const newReads = [
    "clinical.list_vital_signs",
    "clinical.list_documents",
    "clinical.list_diagnoses",
    "clinical.list_medical_history_versions",
    "clinical.list_doctors",
    "clinical.list_medication_templates",
  ];
  for (const name of newReads) {
    const entry = catalog.find((e) => e.name === name);
    assert.ok(entry, `${name} debería estar en el catálogo`);
    assert.notEqual(entry?.status, "gated_out", `${name} (lectura) nunca debe gatearse por rol`);
  }
  // Y siguen siendo EFECTIVAS aun sin permisos de creación.
  const effective = new Set(effectiveTools(tools, new Set<string>()).map((tool) => tool.name));
  for (const name of newReads) {
    assert.ok(effective.has(name), `${name} debería ser efectiva`);
  }
});
