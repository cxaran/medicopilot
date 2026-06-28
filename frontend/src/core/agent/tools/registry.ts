import { browserApi } from "@/core/api/browser-client";
import type { ApiRequestInit } from "@/core/api/request";
import type { WireTool } from "@/core/agent/protocol";

import type { ObjectSchema } from "./schema-validator";
import { browserSandboxRunner, type SandboxRunner } from "./sandbox";
import { parseButtonsSpec, parseChartSpec, parseFormSpec } from "./ui-spec";

export type ToolKind = "read" | "write";

// Error de ejecución de una tool NO basada en la API REST (sandbox, specs de UI). Lo
// traduce executeTool a un tool_result de error estructurado.
export class ToolExecutionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
  }
}

// API inyectable (por defecto el cliente de navegador con cookie del médico). En tests
// se inyecta un fetch mockeado a través de browserApi -> globalThis.fetch.
export type ToolApi = <T>(path: string, init?: ApiRequestInit) => Promise<T>;

export interface ToolExecutionContext {
  api: ToolApi;
  // Runner del sandbox de JS (inyectable en tests; por defecto el Web Worker real).
  sandbox: SandboxRunner;
}

export interface ToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  // Esquema usado para validar args localmente (validador propio acotado).
  inputSchema: ObjectSchema;
  // Esquema rico (JSON Schema) que se declara al modelo cuando inputSchema es permisivo
  // (p.ej. specs de UI con estructuras anidadas que el validador local no cubre).
  wireSchema?: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>;
}

export const defaultToolContext: ToolExecutionContext = {
  api: <T>(path: string, init?: ApiRequestInit) => browserApi<T>(path, init),
  sandbox: browserSandboxRunner,
};

// Esquema permisivo para tools cuya entrada es una spec anidada (validada en el executor).
const PASSTHROUGH_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: true,
};

// Esquema de paginación reutilizable por las tools de listado.
const LIST_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    limit: { type: "integer", description: "Máximo de elementos (1-100).", minimum: 1, maximum: 100 },
    offset: { type: "integer", description: "Desplazamiento para paginar.", minimum: 0 },
  },
  required: [],
  additionalProperties: false,
};

function listQuery(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  if (typeof args.limit === "number") {
    params.set("limit", String(args.limit));
  }
  if (typeof args.offset === "number") {
    params.set("offset", String(args.offset));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Todas las tools mapean a la API REST EXISTENTE de FastAPI usando la cookie del médico.
// FastAPI valida cookie+rol+permiso+paciente en cada llamada; el gateway nunca toca el
// expediente. Las de escritura crean BORRADORES y van siempre gated por confirmación.
const TOOLS: ToolDefinition[] = [
  {
    name: "clinical.list_patients",
    description:
      "Lista los pacientes del expediente (paginado). Devuelve items y paginación. Solo lectura.",
    kind: "read",
    inputSchema: LIST_SCHEMA,
    execute: (args, ctx) => ctx.api(`/api/v1/patients${listQuery(args)}`),
  },
  {
    name: "clinical.get_patient",
    description: "Obtiene el detalle de un paciente por su id. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
      },
      required: ["patient_id"],
      additionalProperties: false,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/patients/${encodeURIComponent(String(args.patient_id))}`),
  },
  {
    name: "clinical.list_recent_consultations",
    description: "Lista las consultas médicas recientes (paginado). Solo lectura.",
    kind: "read",
    inputSchema: LIST_SCHEMA,
    execute: (args, ctx) => ctx.api(`/api/v1/consultations${listQuery(args)}`),
  },
  {
    name: "clinical.list_prescriptions",
    description: "Lista las recetas médicas (paginado). Solo lectura.",
    kind: "read",
    inputSchema: LIST_SCHEMA,
    execute: (args, ctx) => ctx.api(`/api/v1/prescriptions${listQuery(args)}`),
  },
  {
    name: "clinical.list_appointments",
    description: "Lista las citas de la agenda (paginado). Solo lectura.",
    kind: "read",
    inputSchema: LIST_SCHEMA,
    execute: (args, ctx) => ctx.api(`/api/v1/appointments${listQuery(args)}`),
  },
  {
    name: "clinical.create_consultation_draft",
    description:
      "Crea una consulta médica EN BORRADOR para el paciente indicado. Acción de escritura: " +
      "requiere confirmación explícita del médico antes de ejecutarse. El borrador queda para " +
      "que el médico lo revise y complete; no finaliza nada de forma autónoma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente atendido.", format: "uuid" },
        attending_doctor_id: {
          type: "string",
          description: "Id (UUID) del médico tratante.",
          format: "uuid",
        },
        reason_for_visit: { type: "string", description: "Motivo de la consulta." },
        current_illness: { type: "string", description: "Padecimiento actual (opcional)." },
        treatment: { type: "string", description: "Tratamiento propuesto (opcional)." },
      },
      required: ["patient_id", "attending_doctor_id", "reason_for_visit"],
      additionalProperties: false,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/consultations`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "sandbox.run_js",
    description:
      "Ejecuta código JavaScript en un sandbox AISLADO (Web Worker, sin DOM, sin cookies, " +
      "sin red). Usa `return <valor>` para devolver un resultado y console.log(...) para " +
      "registrar. Hay un timeout (~2.5s) que corta loops infinitos.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: "Código JavaScript a ejecutar." } },
      required: ["code"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const outcome = await ctx.sandbox(String(args.code ?? ""));
      if (!outcome.ok) {
        throw new ToolExecutionError(
          outcome.timedOut ? "sandbox_timeout" : "sandbox_error",
          outcome.error ?? "Error al ejecutar el código en el sandbox.",
        );
      }
      return { value: outcome.value, logs: outcome.logs };
    },
  },
  {
    name: "ui.render_form",
    description:
      "Genera un formulario para que el médico lo complete. Recibe una spec declarativa " +
      "(fields con name/label/type[text|number|textarea|select]/options) y un submit_prompt. " +
      "Al enviarlo se continúa la conversación con los valores; no escribe nada por sí mismo.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "textarea", "select"] },
              placeholder: { type: "string" },
              required: { type: "boolean" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: { label: { type: "string" }, value: { type: "string" } },
                  required: ["value"],
                },
              },
            },
            required: ["name", "type"],
          },
        },
        submit_label: { type: "string" },
        submit_prompt: { type: "string" },
      },
      required: ["fields"],
    },
    execute: async (args) => {
      const parsed = parseFormSpec(args);
      if (!parsed.ok) {
        throw new ToolExecutionError("invalid_ui_spec", parsed.error);
      }
      return parsed.spec;
    },
  },
  {
    name: "ui.render_chart",
    description:
      "Genera un gráfico de barras simple. Recibe { chart_type: 'bar', title?, data: " +
      "[{label, value}] }. Solo visualización; los datos los provee el modelo.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        chart_type: { type: "string", enum: ["bar"] },
        title: { type: "string" },
        data: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, value: { type: "number" } },
            required: ["label", "value"],
          },
        },
      },
      required: ["data"],
    },
    execute: async (args) => {
      const parsed = parseChartSpec(args);
      if (!parsed.ok) {
        throw new ToolExecutionError("invalid_ui_spec", parsed.error);
      }
      return parsed.spec;
    },
  },
  {
    name: "ui.render_buttons",
    description:
      "Genera botones de acción. Recibe { title?, buttons: [{label, action}] } donde action " +
      "es { type:'message', prompt } o { type:'tool', tool, args? }. Al hacer clic se continúa " +
      "la conversación con el modelo (las acciones de escritura siguen requiriendo aprobación).",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        buttons: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, action: { type: "object" } },
            required: ["label", "action"],
          },
        },
      },
      required: ["buttons"],
    },
    execute: async (args) => {
      const parsed = parseButtonsSpec(args);
      if (!parsed.ok) {
        throw new ToolExecutionError("invalid_ui_spec", parsed.error);
      }
      return parsed.spec;
    },
  },
];

const TOOLS_BY_NAME = new Map<string, ToolDefinition>(TOOLS.map((tool) => [tool.name, tool]));

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...TOOLS];
}

// Definiciones para declarar al modelo en turn.start (name/description/input_schema).
export function toWireToolDefinitions(): WireTool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.wireSchema ?? tool.inputSchema) as unknown as Record<string, unknown>,
    strict: false,
  }));
}
