import test from "node:test";
import assert from "node:assert/strict";

import {
  SANDBOX_WORKER_SOURCE,
  clampOutcome,
  type SandboxOutcome,
  type SandboxRunner,
} from "./sandbox.ts";
import { getTool, type ToolExecutionContext } from "./registry.ts";
import { executeTool } from "./tool-runner.ts";

function ctxWith(sandbox: SandboxRunner): ToolExecutionContext {
  return {
    api: async () => {
      throw new Error("api no debe llamarse para el sandbox");
    },
    sandbox,
  };
}

const sandboxTool = () => {
  const tool = getTool("sandbox.run_js");
  if (!tool) throw new Error("falta sandbox.run_js");
  return tool;
};

test("sandbox.run_js: ejecuta y devuelve value + logs (runner mockeado)", async () => {
  const runner: SandboxRunner = async (code) => {
    assert.match(code, /return 2 \+ 2/);
    return { ok: true, value: 4, logs: ["calculando"] };
  };
  const result = await executeTool(sandboxTool(), { code: "return 2 + 2;" }, ctxWith(runner));
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(result.content, { value: 4, logs: ["calculando"] });
});

test("sandbox.run_js: un timeout (loop infinito) -> error 'sandbox_timeout'", async () => {
  const runner: SandboxRunner = async () => ({
    ok: false,
    timedOut: true,
    error: "Tiempo de ejecución agotado (>2500ms).",
    logs: [],
  });
  const result = await executeTool(sandboxTool(), { code: "while(true){}" }, ctxWith(runner));
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "sandbox_timeout");
});

test("sandbox.run_js: error del código -> tool_result de error estructurado", async () => {
  const runner: SandboxRunner = async () => ({ ok: false, error: "boom", logs: [] });
  const result = await executeTool(sandboxTool(), { code: "throw new Error('boom')" }, ctxWith(runner));
  assert.equal(result.status, "error");
  if (result.status !== "error") return;
  assert.equal(result.code, "sandbox_error");
  assert.equal(result.message, "boom");
});

test("aislamiento (diseño): el worker deshabilita la red y no expone cookie/document", () => {
  // El código corre vía new Function (sin scope externo) en un Web Worker, que NO tiene
  // document/cookie/localStorage/window. Además se anula explícitamente la red.
  assert.match(SANDBOX_WORKER_SOURCE, /self\.fetch = function/);
  assert.match(SANDBOX_WORKER_SOURCE, /importScripts/);
  assert.match(SANDBOX_WORKER_SOURCE, /new Function/);
  assert.ok(!SANDBOX_WORKER_SOURCE.includes("document.cookie"));
  assert.ok(!SANDBOX_WORKER_SOURCE.includes("localStorage"));
});

test("clampOutcome: trunca salida grande y limita los logs", () => {
  const big = "x".repeat(1000);
  const outcome: SandboxOutcome = { ok: true, value: big, logs: [big] };
  const clamped = clampOutcome(outcome, 100);
  assert.ok(String(clamped.value).length <= 130);
  assert.ok(clamped.logs[0].length <= 130);
});
