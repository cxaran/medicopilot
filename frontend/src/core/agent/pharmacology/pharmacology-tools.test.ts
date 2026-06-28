import test from "node:test";
import assert from "node:assert/strict";

import { buildToolCatalog } from "@/core/agent/tool-catalog";
import { searchTools } from "@/core/agent/tool-discovery";
import { executeTool, resolveToolCall } from "@/core/agent/tools/tool-runner";

import {
  PHARMA_LOCAL_PROVENANCE,
  PHARMA_MCP_PROVENANCE,
  loadPharmacologyTools,
  pharmacologyToolName,
} from "./pharmacology-tools.ts";

// G3: fuente de farmacología por el MISMO cliente MCP. Verifica que las tools surgen por el camino
// común (procedencia, gating, tool_search), que la salida es DATO DE REFERENCIA NO CONFIABLE
// etiquetado, que un fármaco no cubierto devuelve "no disponible" (sin fabricar) y uno curado
// devuelve su entrada citada. El proveedor local respeta el contrato MCP; un servidor real lo
// reemplaza por configuración.

const NAMES = {
  interactions: pharmacologyToolName("drug_interactions"),
  dose: pharmacologyToolName("dose_adjustment"),
  label: pharmacologyToolName("drug_label"),
};

async function localTools() {
  // Sin servidor MCP de farmacología configurado -> proveedor local.
  const prev = process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  delete process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  try {
    return await loadPharmacologyTools();
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL = prev;
  }
}

function jsonRes(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("local: surface pharma.drug_interactions/dose_adjustment/drug_label (read) con procedencia local", async () => {
  const tools = await localTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [NAMES.label, NAMES.dose, NAMES.interactions].sort());
  for (const t of tools) {
    assert.equal(t.kind, "read", `${t.name} debe ser de lectura`);
    assert.equal(t.source, PHARMA_LOCAL_PROVENANCE);
    assert.equal(t.approval, undefined, "una lectura de referencia no lleva aprobación P1");
  }
});

test("tool_search: las tools de farmacología aparecen con su procedencia", async () => {
  const tools = await localTools();
  const hits = searchTools("interacciones farmacológicas medicamento", tools, 10);
  const hit = hits.find((h) => h.name === NAMES.interactions);
  assert.ok(hit, "drug_interactions debe aparecer en tool_search");
  assert.match(hit.source, /Farmacología/);
});

test("gating: las tools de farmacología son lecturas -> no se gatean por rol", async () => {
  const tools = await localTools();
  const catalog = buildToolCatalog(tools, new Set());
  for (const name of Object.values(NAMES)) {
    const entry = catalog.find((e) => e.name === name);
    assert.ok(entry, `${name} debe estar en el catálogo`);
    assert.notEqual(entry?.status, "gated_out", `${name} (lectura) no debe gatearse`);
  }
});

test("salida etiquetada como DATO DE REFERENCIA NO CONFIABLE (envelope)", async () => {
  const tools = await localTools();
  const label = tools.find((t) => t.name === NAMES.label)!;
  const result = await executeTool(label, { drug: "metformina" });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const env = result.content as Record<string, unknown>;
  assert.equal(env.tipo, "referencia_farmacologica");
  assert.equal(env.confiabilidad, "no_verificada");
  assert.match(String(env.aviso), /verifica la fuente oficial/i);
  assert.match(String(env.aviso), /no es una indicación ni una prescripción/i);
  assert.equal(env.fuente, PHARMA_LOCAL_PROVENANCE);
});

test("fármaco curado: devuelve su entrada citada (con fuente)", async () => {
  const tools = await localTools();
  const label = tools.find((t) => t.name === NAMES.label)!;
  const result = await executeTool(label, { drug: "metformina" });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const resultado = (result.content as { resultado: Record<string, unknown> }).resultado;
  assert.equal(resultado.disponible, true);
  assert.equal(resultado.farmaco, "Metformina");
  assert.ok(typeof resultado.alto_riesgo === "string");
  assert.ok(typeof resultado.embarazo === "string");
  assert.match(String(resultado.fuente), /ficha técnica/i);
});

test("fármaco NO cubierto: 'no disponible', sin fabricar", async () => {
  const tools = await localTools();
  const label = tools.find((t) => t.name === NAMES.label)!;
  const result = await executeTool(label, { drug: "medicamento-inexistente-xyz" });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const resultado = (result.content as { resultado: Record<string, unknown> }).resultado;
  assert.equal(resultado.disponible, false);
  assert.match(String(resultado.mensaje), /no disponible/i);
  assert.equal(resultado.cobertura, "limitada");
});

test("drug_interactions: filtra por other_drug y devuelve interacciones citadas", async () => {
  const tools = await localTools();
  const inter = tools.find((t) => t.name === NAMES.interactions)!;
  const result = await executeTool(inter, { drug: "warfarina", other_drug: "ibuprofeno" });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const resultado = (result.content as { resultado: { interacciones: { con: string }[] } }).resultado;
  assert.ok(resultado.interacciones.length >= 1);
  assert.ok(resultado.interacciones.every((i) => /AINE|ibuprofeno/i.test(i.con)));
});

test("dose_adjustment: organo renal devuelve solo el ajuste renal", async () => {
  const tools = await localTools();
  const dose = tools.find((t) => t.name === NAMES.dose)!;
  const result = await executeTool(dose, { drug: "metformina", organ: "renal" });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const ajuste = (result.content as { resultado: { ajuste: Record<string, string> } }).resultado.ajuste;
  assert.ok("renal" in ajuste);
  assert.ok(!("hepatico" in ajuste));
});

test("se despachan vía extraTools (no están en el registro nativo)", async () => {
  const tools = await localTools();
  const resolved = resolveToolCall(NAMES.label, { drug: "metformina" }, tools);
  assert.equal(resolved.outcome, "ready");
});

test("servidor MCP real configurado: reusa JSON-RPC y procedencia 'Farmacología (MCP)'", async () => {
  const prev = process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL = "https://pharma.test/rpc";
  const items = [
    { name: "drug_label", description: "label", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  ];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    if (body.method === "initialize") return jsonRes({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    if (body.method === "tools/list") return jsonRes({ jsonrpc: "2.0", id: 2, result: { tools: items } });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  try {
    const tools = await loadPharmacologyTools(fetchImpl);
    const label = tools.find((t) => t.name === NAMES.label);
    assert.ok(label, "debe mapear la tool del servidor real con nombre pharma.*");
    assert.equal(label.source, PHARMA_MCP_PROVENANCE);
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL = prev;
    else delete process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  }
});

test("servidor MCP real que falla: cae al proveedor local (la referencia no desaparece)", async () => {
  const prev = process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL = "https://pharma.test/rpc";
  const fetchImpl = (async () => {
    throw new Error("conexión rechazada");
  }) as unknown as typeof fetch;
  try {
    const tools = await loadPharmacologyTools(fetchImpl);
    assert.equal(tools.length, 3, "debe caer al proveedor local con sus 3 tools");
    assert.ok(tools.every((t) => t.source === PHARMA_LOCAL_PROVENANCE));
  } finally {
    if (prev !== undefined) process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL = prev;
    else delete process.env.NEXT_PUBLIC_PHARMA_MCP_SERVER_URL;
  }
});
