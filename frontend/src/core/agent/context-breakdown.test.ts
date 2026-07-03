import test from "node:test";
import assert from "node:assert/strict";

import { buildContextBreakdown } from "./context-breakdown.ts";
import type { WireMessage, WireTool } from "@/core/agent/protocol";

function sys(text: string): WireMessage {
  return { role: "system", content: [{ type: "text", text }] };
}

const tool = (name: string): WireTool => ({
  name,
  description: `Descripción de ${name}`,
  input_schema: { type: "object", properties: {} },
  strict: false,
});

const BASE = {
  persona: null,
  doctorProfile: null,
  activeContext: null,
  patientSummary: null,
  memory: null,
  toolsWire: [] as WireTool[],
  budgetWindow: 100_000,
};

test("siempre incluye seguridad, operativa y herramientas", () => {
  const b = buildContextBreakdown(BASE);
  const keys = b.items.map((i) => i.key);
  assert.ok(keys.includes("safety"));
  assert.ok(keys.includes("operational"));
  assert.ok(keys.includes("tools"));
  // Sin capas opcionales presentes.
  assert.ok(!keys.includes("persona"));
  assert.ok(!keys.includes("doctor"));
  assert.ok(!keys.includes("memories"));
});

test("incluye las capas opcionales sólo cuando están presentes, en orden", () => {
  const b = buildContextBreakdown({
    ...BASE,
    persona: { tone: "cálido" },
    doctorProfile: sys("MÉDICO A CARGO\nMédico: Dra. Ana"),
    activeContext: sys("Contexto activo: Paciente X"),
    patientSummary: sys("RESUMEN DEL PACIENTE\nPaciente: Y"),
    memory: sys("MEMORIAS\n- nota"),
    toolsWire: [tool("clinical.search_patients"), tool("ui.render_chart")],
  });
  const keys = b.items.map((i) => i.key);
  assert.deepEqual(keys, [
    "safety",
    "operational",
    "persona",
    "doctor",
    "active_context",
    "patient_summary",
    "memories",
    "tools",
  ]);
});

test("las memorias son 'dato' (no confiable); el resto instrucción", () => {
  const b = buildContextBreakdown({ ...BASE, memory: sys("MEMORIAS\n- x") });
  const mem = b.items.find((i) => i.key === "memories");
  assert.equal(mem?.trusted, false);
  assert.equal(b.items.find((i) => i.key === "safety")?.trusted, true);
});

test("el elemento de herramientas lista los nombres y cuenta tokens", () => {
  const b = buildContextBreakdown({ ...BASE, toolsWire: [tool("a.tool"), tool("b.tool")] });
  const tools = b.items.find((i) => i.key === "tools");
  assert.match(tools!.content, /2 herramientas/);
  assert.match(tools!.content, /a\.tool/);
  assert.ok(tools!.tokens > 0);
});

test("percent = tokens/ventana; totalTokens = suma; ventana 0 -> 0%", () => {
  const b = buildContextBreakdown(BASE);
  const suma = b.items.reduce((s, i) => s + i.tokens, 0);
  assert.equal(b.totalTokens, suma);
  for (const item of b.items) {
    assert.equal(item.percent, Math.round((item.tokens / 100_000) * 100));
  }
  const zero = buildContextBreakdown({ ...BASE, budgetWindow: 0 });
  assert.ok(zero.items.every((i) => i.percent === 0));
  assert.equal(zero.totalPercent, 0);
});
