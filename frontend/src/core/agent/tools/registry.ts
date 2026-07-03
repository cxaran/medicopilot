import { browserApi } from "@/core/api/browser-client";
import type { ApiRequestInit } from "@/core/api/request";
import type { WireTool } from "@/core/agent/protocol";

import type { ObjectSchema, PropSchema } from "./schema-validator";
import { browserSandboxRunner, type SandboxRunner } from "./sandbox";
import {
  parseChartSpec,
  parseFormSpec,
  parseResourceFormSpec,
  parseSuggestedRepliesSpec,
} from "./ui-spec";
import { validateDynamicForm } from "./dynamic-form";
import {
  buildCloseOutPlan,
  reviewContextFromCatalog,
  type CatalogResourceLike,
  type DetectedActionsInput,
  type DetectedActionsSpec,
} from "./detected-actions";
import { buildTaskPlan, type TaskPlanInput, type TaskPlanSpec } from "./task-plan";
import {
  buildButtonsModel,
  type ButtonReviewContext,
  type ButtonToolEntry,
  type ButtonsInput,
} from "./button-actions";
import {
  buildCloseChecklist,
  type CloseChecklistInput,
  type CloseChecklistSpec,
} from "./close-checklist";
import {
  buildPromotionProposal,
  type PromotionSignals,
  type TemplatePromotionSpec,
} from "./template-promotion";
import {
  buildRecordUpdate,
  type RecordUpdateInput,
  type RecordUpdateOptions,
} from "./record-update";
import { buildOpenRecord, type OpenRecordInput } from "./open-record";
import { buildWizardPlan, type WizardInput, type WizardSpec } from "./wizard";

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

// Metadata de aprobación de una tool de ESCRITURA: alimenta el plan canónico que el
// médico aprueba (P1). Genérica: cualquier tool de escritura puede declararla para dar un
// resumen en español; sin ella, el protocolo cae a un resumen genérico.
export interface ToolApprovalMeta {
  // Tipo de acción para el plan (p. ej. ``create_consultation_draft``).
  actionType: string;
  // Recurso destino afectado (p. ej. ``consultations``).
  targetResource: string;
  // Resumen legible en español de lo que ocurriría si se aprueba.
  summarize: (args: Record<string, unknown>) => string;
  // Escritura OWNER-SCOPED (sobre datos del propio médico, p. ej. sus memorias): no se gatea
  // por el catálogo de recursos RBAC (no es un recurso global), pero SÍ pasa por la aprobación
  // del médico como cualquier otra escritura. Sin esto, una escritura se gatea por rol.
  ownerScoped?: boolean;
  // Escritura YA AUTORIZADA por la proyección del contrato (tools derivadas de /resources, F6): el
  // backend sólo expone el form/acción si concede el permiso, así que el gate de "creable" no aplica
  // (cubre update/acciones sobre recursos editables pero no creables). Igual pasa por aprobación P1.
  preauthorized?: boolean;
  // Gate ALTERNATIVO por permiso explícito (de la sesión /auth/me) para recursos que a propósito
  // NO publican formulario genérico en el catálogo (p. ej. scale_results: su insumo JSON no se
  // renderiza como form, así que forms.create/update no existen y la señal "creable" nunca llega).
  // La tool se declara si el médico tiene TODOS estos permisos. Defensa en profundidad: FastAPI
  // revalida cada ejecución; esto solo evita ofrecer al modelo lo que el médico no puede hacer.
  requiredPermissions?: readonly string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  kind: ToolKind;
  // Procedencia legible EXPLÍCITA (p. ej. "MCP: <servidor>"). Si se omite, la procedencia se
  // infiere del prefijo del nombre (ver tool-catalog ``toolSource``). Lo usan las tools cuya
  // familia no se deduce del nombre, como las descubiertas por MCP.
  source?: string;
  // Esquema usado para validar args localmente (validador propio acotado).
  inputSchema: ObjectSchema;
  // Esquema rico (JSON Schema) que se declara al modelo cuando inputSchema es permisivo
  // (p.ej. specs de UI con estructuras anidadas que el validador local no cubre).
  wireSchema?: Record<string, unknown>;
  // Solo tools de escritura: metadata para el protocolo de aprobación clínica.
  approval?: ToolApprovalMeta;
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

// --- Filtros de las tools de listado (G1) ---
// CADA filtro expuesto está VERIFICADO contra la API real (resource registry/routers): solo se
// envía un parámetro que el backend honra. Naming del backend: igualdad -> ``<campo>``; rango de
// fecha de calendario -> ``<campo>_from`` / ``<campo>_to`` (valor date YYYY-MM-DD, inclusivos).
// Los filtros clínicamente útiles que el backend AÚN no soporta NO se exponen (ver el reporte).

const LIMIT_PROP: PropSchema = {
  type: "integer",
  description: "Máximo de elementos (1-100).",
  minimum: 1,
  maximum: 100,
};
const OFFSET_PROP: PropSchema = {
  type: "integer",
  description: "Desplazamiento para paginar.",
  minimum: 0,
};
const DATE_FROM_PROP: PropSchema = {
  type: "string",
  description: "Fecha inicial del rango, inclusiva (YYYY-MM-DD).",
};
const DATE_TO_PROP: PropSchema = {
  type: "string",
  description: "Fecha final del rango, inclusiva (YYYY-MM-DD).",
};
const PATIENT_FILTER_PROP: PropSchema = {
  type: "string",
  description: "Filtra por id (UUID) del paciente.",
  format: "uuid",
};
const CONSULTATION_FILTER_PROP: PropSchema = {
  type: "string",
  description: "Filtra por id (UUID) de la consulta.",
  format: "uuid",
};
const DOCTOR_FILTER_PROP: PropSchema = {
  type: "string",
  description: "Filtra por id (UUID) del médico.",
  format: "uuid",
};
const STATUS_FILTER_PROP: PropSchema = {
  type: "string",
  description: "Filtra por estado (valor exacto del backend).",
};

// Esquema de una tool de listado con sus filtros + paginación (additionalProperties:false: el
// modelo solo puede enviar los parámetros que el backend honra).
function clinicalListSchema(filters: Record<string, PropSchema>): ObjectSchema {
  return {
    type: "object",
    properties: { ...filters, limit: LIMIT_PROP, offset: OFFSET_PROP },
    required: [],
    additionalProperties: false,
  };
}

// Construye el query string de un listado clínico: filtros de igualdad (mismo nombre que el
// campo del backend) + rango de fecha (date_from/date_to -> <campo>_from/<campo>_to) + paginación.
// UUID "nulo" (todo ceros): algunos modelos lo inventan como relleno cuando NO quieren filtrar por
// una relación. Tratarlo como filtro real devolvería 0 resultados siempre, así que se ignora.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function clinicalListQuery(
  args: Record<string, unknown>,
  spec: { eq?: readonly string[]; dateField?: string; dateRangeField?: string },
): string {
  const params = new URLSearchParams();
  for (const key of spec.eq ?? []) {
    const value = args[key];
    if (typeof value === "string" && value !== "" && value !== NIL_UUID) {
      params.set(key, value);
    }
  }
  if (spec.dateField) {
    const from = args.date_from;
    const to = args.date_to;
    if (typeof from === "string" && from !== "") {
      params.set(`${spec.dateField}_from`, from);
    }
    if (typeof to === "string" && to !== "") {
      params.set(`${spec.dateField}_to`, to);
    }
  }
  // Rango por extremos gte/lte (campos de fecha/numéricos en filter_fields del contrato).
  if (spec.dateRangeField) {
    const from = args.date_from;
    const to = args.date_to;
    if (typeof from === "string" && from !== "") {
      params.set(`${spec.dateRangeField}_gte`, from);
    }
    if (typeof to === "string" && to !== "") {
      params.set(`${spec.dateRangeField}_lte`, to);
    }
  }
  if (typeof args.limit === "number") {
    params.set("limit", String(args.limit));
  }
  if (typeof args.offset === "number") {
    params.set("offset", String(args.offset));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Arma el body de la cohorte tomando SOLO los criterios reconocidos (los criterios anidados se
// pasan tal cual; el backend valida cada uno con 422 si están mal formados). Evita reenviar
// claves arbitrarias que el modelo pudiera inventar.
function buildCohortBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of ["has_diagnosis", "lab_abnormal", "vital_threshold", "age_range", "appointment_no_show"]) {
    if (isPlainObject(args[key])) {
      body[key] = args[key];
    }
  }
  if (typeof args.pregnancy_status === "string" && args.pregnancy_status !== "") {
    body.pregnancy_status = args.pregnancy_status;
  }
  if (typeof args.limit === "number") {
    body.limit = args.limit;
  }
  if (typeof args.offset === "number") {
    body.offset = args.offset;
  }
  return body;
}

// Mapea (report_type + params) al endpoint REST de reportes correcto y su query string. Solo
// se envían los parámetros que cada reporte honra (verificado contra los routers reales).
function buildReportPath(args: Record<string, unknown>): string {
  const type = String(args.report_type);
  const params = new URLSearchParams();
  const setStr = (key: string) => {
    const value = args[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  };
  const setNum = (key: string) => {
    const value = args[key];
    if (typeof value === "number") params.set(key, String(value));
  };
  const withQuery = (path: string) => {
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };
  switch (type) {
    case "activity":
      setStr("date_from"); setStr("date_to"); setStr("doctor_id");
      return withQuery("/api/v1/reports/activity");
    case "top_diagnoses":
      setStr("date_from"); setStr("date_to"); setNum("limit");
      return withQuery("/api/v1/reports/top-diagnoses");
    case "unsigned_notes":
      setStr("doctor_id");
      return withQuery("/api/v1/reports/unsigned-notes");
    case "attendance":
      setStr("date_from"); setStr("date_to"); setStr("doctor_id");
      return withQuery("/api/v1/reports/attendance");
    default:
      throw new ToolExecutionError("invalid_report_type", `Tipo de reporte no soportado: ${type}`);
  }
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
    description:
      "Lista consultas médicas (paginado). Puede filtrar por paciente (patient_id), médico " +
      "tratante (attending_doctor_id), estado (status) y rango de fecha de atención " +
      "(date_from/date_to, sobre consulted_at). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      attending_doctor_id: DOCTOR_FILTER_PROP,
      status: STATUS_FILTER_PROP,
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/consultations${clinicalListQuery(args, {
          eq: ["patient_id", "attending_doctor_id", "status"],
          dateField: "consulted_at",
        })}`,
      ),
  },
  {
    name: "clinical.list_prescriptions",
    description:
      "Lista recetas médicas (paginado). Puede filtrar por consulta (consultation_id) y estado " +
      "(status). Nota: el backend no expone filtro por paciente ni rango de fecha en recetas. " +
      "Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      consultation_id: CONSULTATION_FILTER_PROP,
      status: STATUS_FILTER_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(`/api/v1/prescriptions${clinicalListQuery(args, { eq: ["consultation_id", "status"] })}`),
  },
  {
    name: "clinical.list_appointments",
    description:
      "Lista citas de la agenda (paginado). Puede filtrar por paciente (patient_id), médico " +
      "(doctor_id), estado (status) y rango de fecha agendada (date_from/date_to, sobre " +
      "scheduled_date). Todos los filtros son OPCIONALES: OMITE el que no necesites (no envíes " +
      "cadenas vacías ni UUID de ceros como relleno). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      doctor_id: DOCTOR_FILTER_PROP,
      status: STATUS_FILTER_PROP,
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/appointments${clinicalListQuery(args, {
          eq: ["patient_id", "doctor_id", "status"],
          dateRangeField: "scheduled_date",
        })}`,
      ),
  },
  {
    name: "clinical.list_vital_signs",
    description:
      "Lista signos vitales medidos (paginado). Se consultan por consulta (consultation_id) y " +
      "admiten rango de fecha de medición (date_from/date_to, sobre measured_at). Nota: el " +
      "backend no expone filtro por paciente en signos vitales (usa la consulta del paciente). " +
      "Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      consultation_id: CONSULTATION_FILTER_PROP,
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/vital-signs${clinicalListQuery(args, {
          eq: ["consultation_id"],
          dateField: "measured_at",
        })}`,
      ),
  },
  {
    name: "clinical.list_documents",
    description:
      "Lista documentos clínicos (paginado): devuelve METADATOS y una URL de descarga por " +
      "documento (no descarga el contenido). Puede filtrar por paciente (patient_id), consulta " +
      "(consultation_id), tipo (document_type) y rango de fecha de carga (date_from/date_to, " +
      "sobre uploaded_at). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      consultation_id: CONSULTATION_FILTER_PROP,
      document_type: { type: "string", description: "Filtra por tipo de documento (valor del backend)." },
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: async (args, ctx) => {
      const page = await ctx.api<{ items?: Array<Record<string, unknown>> }>(
        `/api/v1/clinical-documents${clinicalListQuery(args, {
          eq: ["patient_id", "consultation_id", "document_type"],
          dateField: "uploaded_at",
        })}`,
      );
      // Añade la URL de descarga EXISTENTE por documento sin leer bytes (endpoint real).
      const items = Array.isArray(page?.items) ? page.items : [];
      const withDownload = items.map((item) => {
        const id = item.id;
        return typeof id === "string"
          ? { ...item, download_url: `/api/v1/clinical-documents/${encodeURIComponent(id)}/download` }
          : item;
      });
      return { ...page, items: withDownload };
    },
  },
  {
    // F-MEDIOS fase 1: leer el CONTENIDO de un documento clínico ya cargado (p. ej. un
    // reporte de laboratorio) para proponer resultados estructurados EN BORRADOR. El
    // servidor solo superficie el contenido; la interpretación es del agente.
    //
    // COMPOSICIÓN sugerida para extraer un reporte de laboratorio (cada resultado es un
    // BORRADOR que el médico aprueba, protocolo P1; nada se guarda solo):
    //   1) clinical.read_document_content(clinical_document_id) -> obtén el texto (PDF) o
    //      la referencia de visión (imagen, vía download_url) y el patient_id.
    //   2) Por cada analito que LEAS con claridad, busca su código LOINC con
    //      clinical.search_codes(system="loinc", query=<nombre del analito>).
    //   3) Propón clinical.create_lab_result_draft con analyte_name + value_numeric/value_text
    //      + unit + rango de referencia (si aparece) + measured_at + el LOINC en analyte_code
    //      + clinical_document_id = este documento (como fuente).
    // Si un valor es ilegible o ambiguo, DILO y NO lo adivines: no propongas ese resultado.
    name: "clinical.read_document_content",
    description:
      "Devuelve el CONTENIDO extraíble de un documento clínico ya cargado para interpretarlo: " +
      "{document_type, patient_id, content_kind, download_url, text}. Para PDF con texto, " +
      "content_kind='text' y 'text' trae el texto; para imágenes, content_kind='image' e " +
      "interpretas por visión usando download_url; un PDF escaneado sin texto trae text=null " +
      "(no inventes valores). Úsalo para proponer resultados de laboratorio EN BORRADOR: lee " +
      "el documento, mapea cada analito a su LOINC con clinical.search_codes y propón un " +
      "clinical.create_lab_result_draft por analito con clinical_document_id como fuente. Cada " +
      "resultado es un borrador que el médico aprueba (P1). Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        clinical_document_id: {
          type: "string",
          description: "Id (UUID) del documento clínico a leer.",
          format: "uuid",
        },
      },
      required: ["clinical_document_id"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const id = encodeURIComponent(String(args.clinical_document_id));
      return ctx.api(`/api/v1/clinical-documents/${id}/content`);
    },
  },
  {
    // F-MEDIOS fase 2b: transcripción de un documento de AUDIO de consulta. POR DEFECTO corre
    // EN EL NAVEGADOR (Whisper local con transformers.js): el audio NO sale del dispositivo del
    // médico (confidencialidad del PHI). Si el navegador no lo soporta o está deshabilitado, cae
    // al proveedor STT del servidor (fase 2). Si tampoco hay proveedor, responde 'no disponible'
    // y NUNCA se inventa texto. La transcripción es un BORRADOR NO CONFIABLE que el médico edita.
    //
    // COMPOSICIÓN sugerida para una nota de consulta a partir de audio (nada se guarda solo):
    //   1) Identifica/sube el audio como documento clínico (document_type 'audio').
    //   2) clinical.get_audio_transcript(clinical_document_id) -> obtén el texto. Si
    //      available=false, dilo ('no disponible') y NO inventes una nota. Si source es
    //      'browser-local', puedes aclarar que el audio no salió del dispositivo.
    //   3) Propón clinical.create_consultation_draft FUNDAMENTADO en la transcripción (P1):
    //      el médico revisa y completa el borrador; trátalo como texto no confiable.
    name: "clinical.get_audio_transcript",
    description:
      "Devuelve la transcripción de un documento de AUDIO de consulta: {available, transcript, " +
      "source, model, provider, notes}. POR DEFECTO transcribe EN EL NAVEGADOR (Whisper local): " +
      "el audio no se envía a terceros (source='browser-local'). Si el navegador no lo soporta, " +
      "cae al proveedor del servidor (source='server'). Si available=false, di 'no disponible' " +
      "SIN inventar texto. La transcripción es un borrador NO confiable que el médico edita; " +
      "úsala para proponer una clinical.create_consultation_draft fundamentada en ella (cada nota " +
      "es un borrador que el médico aprueba). Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        clinical_document_id: {
          type: "string",
          description: "Id (UUID) del documento de audio a transcribir.",
          format: "uuid",
        },
      },
      required: ["clinical_document_id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const id = String(args.clinical_document_id);
      const { runAudioTranscript } = await import("@/core/audio-transcription/runtime");
      return runAudioTranscript(id, ctx);
    },
  },
  {
    name: "clinical.list_diagnoses",
    description:
      "Lista diagnósticos de consulta (paginado). Se consultan por consulta (consultation_id) y " +
      "pueden filtrarse por tipo (diagnosis_kind). Nota: el backend no expone filtro por " +
      "paciente ni rango de fecha en diagnósticos. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      consultation_id: CONSULTATION_FILTER_PROP,
      diagnosis_kind: {
        type: "string",
        description: "Tipo de diagnóstico.",
        enum: ["primary", "secondary", "suspected"],
      },
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/consultation-diagnoses${clinicalListQuery(args, {
          eq: ["consultation_id", "diagnosis_kind"],
        })}`,
      ),
  },
  {
    name: "clinical.list_medical_history_versions",
    description:
      "Lista versiones de la historia clínica de un paciente (paginado). Se consultan por " +
      "paciente (patient_id) y pueden filtrarse por estado (status, p. ej. current). Nota: el " +
      "backend no expone rango de fecha en historia clínica. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      status: STATUS_FILTER_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/medical-history-versions${clinicalListQuery(args, {
          eq: ["patient_id", "status"],
        })}`,
      ),
  },
  {
    name: "clinical.list_doctors",
    description:
      "Lista los médicos del consultorio (paginado). Puede filtrar por estado (status) y rango " +
      "de fecha de alta (date_from/date_to, sobre created_at). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      status: STATUS_FILTER_PROP,
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/doctors${clinicalListQuery(args, { eq: ["status"], dateField: "created_at" })}`,
      ),
  },
  {
    name: "clinical.list_medication_templates",
    description:
      "Lista las plantillas de medicamentos del catálogo (paginado). Puede filtrar por médico " +
      "dueño (doctor_id) y estado (status). Nota: el backend no expone filtro por paciente ni " +
      "rango de fecha en plantillas. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      doctor_id: DOCTOR_FILTER_PROP,
      status: STATUS_FILTER_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/medication-templates${clinicalListQuery(args, { eq: ["doctor_id", "status"] })}`,
      ),
  },
  {
    name: "clinical.list_lab_results",
    description:
      "Lista resultados de laboratorio/observaciones ESTRUCTURADOS (valor, unidad, rango de " +
      "referencia, marca de anormalidad, fecha). Habilita tendencias y fuera-de-rango. Puede " +
      "filtrar por paciente (patient_id), analito (analyte, coincidencia parcial; p. ej. " +
      "'HbA1c'), rango de fecha de medición (date_from/date_to, sobre measured_at) y solo " +
      "anormales (abnormal_only: incluye bajo, alto y crítico). Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: PATIENT_FILTER_PROP,
        analyte: {
          type: "string",
          description: "Filtra por nombre de analito (coincidencia parcial, sin distinguir mayúsculas).",
        },
        abnormal_only: {
          type: "boolean",
          description: "Si es true, devuelve solo resultados anormales (bajo, alto o crítico).",
        },
        date_from: DATE_FROM_PROP,
        date_to: DATE_TO_PROP,
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: [],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const params = new URLSearchParams();
      if (typeof args.patient_id === "string" && args.patient_id !== "") {
        params.set("patient_id", args.patient_id);
      }
      // El nombre de analito usa coincidencia parcial (ILIKE) que el backend honra.
      if (typeof args.analyte === "string" && args.analyte !== "") {
        params.set("analyte_name_contains", args.analyte);
      }
      if (typeof args.date_from === "string" && args.date_from !== "") {
        params.set("measured_at_from", args.date_from);
      }
      if (typeof args.date_to === "string" && args.date_to !== "") {
        params.set("measured_at_to", args.date_to);
      }
      // "Solo anormales" = abnormal_flag IN (low, high, critical): el backend lo expone como
      // parámetro repetido abnormal_flag_in.
      if (args.abnormal_only === true) {
        for (const flag of ["low", "high", "critical"]) {
          params.append("abnormal_flag_in", flag);
        }
      }
      if (typeof args.limit === "number") params.set("limit", String(args.limit));
      if (typeof args.offset === "number") params.set("offset", String(args.offset));
      const qs = params.toString();
      return ctx.api(`/api/v1/lab-results${qs ? `?${qs}` : ""}`);
    },
  },
  {
    name: "clinical.get_lab_result",
    description: "Obtiene el detalle de un resultado de laboratorio por su id. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        lab_result_id: {
          type: "string",
          description: "Id (UUID) del resultado de laboratorio.",
          format: "uuid",
        },
      },
      required: ["lab_result_id"],
      additionalProperties: false,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/lab-results/${encodeURIComponent(String(args.lab_result_id))}`),
  },
  {
    name: "clinical.list_clinical_events",
    description:
      "Lista eventos clínicos de la línea de tiempo del paciente (hospitalizaciones, urgencias, " +
      "referencias, procedimientos u otros). Puede filtrar por paciente (patient_id), tipo " +
      "(event_type), estado (status) y rango de fecha de inicio (date_from/date_to, sobre " +
      "started_at). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      event_type: {
        type: "string",
        description: "Tipo de evento.",
        enum: ["hospitalization", "emergency", "referral", "procedure", "other"],
      },
      status: {
        type: "string",
        description: "Estado del evento.",
        enum: ["active", "resolved", "cancelled"],
      },
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/clinical-events${clinicalListQuery(args, {
          eq: ["patient_id", "event_type", "status"],
          dateField: "started_at",
        })}`,
      ),
  },
  {
    name: "clinical.list_study_orders",
    description:
      "Lista órdenes de estudio/laboratorio del paciente (pendientes, en proceso, con resultado " +
      "o canceladas). Puede filtrar por paciente (patient_id), médico que ordena (ordered_by), " +
      "estado (status) y rango de fecha de la orden (date_from/date_to, sobre ordered_at). Solo " +
      "lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      ordered_by: DOCTOR_FILTER_PROP,
      status: {
        type: "string",
        description: "Estado de la orden.",
        enum: ["pending", "in_progress", "resulted", "cancelled"],
      },
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/study-orders${clinicalListQuery(args, {
          eq: ["patient_id", "ordered_by", "status"],
          dateField: "ordered_at",
        })}`,
      ),
  },
  {
    name: "clinical.list_tasks",
    description:
      "Lista tareas clínicas de seguimiento (pendientes/vencidas). Puede filtrar por responsable " +
      "(owner_id), paciente (patient_id), estado (status), prioridad (priority) y rango de fecha " +
      "de vencimiento (date_from/date_to, sobre due_at). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      owner_id: { type: "string", description: "Filtra por id (UUID) del usuario responsable.", format: "uuid" },
      patient_id: PATIENT_FILTER_PROP,
      status: {
        type: "string",
        description: "Estado de la tarea.",
        enum: ["open", "done", "cancelled"],
      },
      priority: {
        type: "string",
        description: "Prioridad de la tarea.",
        enum: ["low", "medium", "high"],
      },
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/clinical-tasks${clinicalListQuery(args, {
          eq: ["owner_id", "patient_id", "status", "priority"],
          dateField: "due_at",
        })}`,
      ),
  },
  {
    // Cohorte/población (G5 fase 1): CONTEO agregado + muestra de pacientes que cumplen
    // criterios estructurados combinados con AND. Es un POST con criterios anidados (por eso
    // inputSchema permisivo + wireSchema rico). Solo lectura; FastAPI exige population:read y
    // nunca incluye pacientes eliminados. El resultado es un CONTEO para revisión del médico,
    // NO una lista para contactar pacientes ni una acción que se ejecute automáticamente.
    name: "clinical.query_cohort",
    description:
      "Cuenta cuántos pacientes cumplen criterios clínicos combinados (AND) y devuelve " +
      "{ count, sample } (muestra mínima: patient_id + full_name) para revisión del médico. " +
      "Criterios: has_diagnosis (code o text), lab_abnormal (analyte + ventana de fechas), " +
      "vital_threshold (vital + comparator + value), pregnancy_status, age_range (min_age/" +
      "max_age) y appointment_no_show (ventana de fechas). Útil para '¿cuántos de mis " +
      "pacientes con X?'. Es un CONTEO para revisión, no una lista para contactar ni una " +
      "acción automática. Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        has_diagnosis: {
          type: "object",
          description: "Coincidencia por código o texto sobre diagnósticos de consulta. Indique al menos uno.",
          properties: {
            code: { type: "string", description: "Código exacto (sin distinguir mayúsculas)." },
            text: { type: "string", description: "Subcadena del texto del diagnóstico." },
          },
        },
        lab_abnormal: {
          type: "object",
          description: "Resultado de laboratorio anormal (low/high/critical) para un analito.",
          properties: {
            analyte: { type: "string", description: "Nombre o código del analito." },
            date_from: { type: "string", description: "Inicio de la ventana (YYYY-MM-DD), inclusivo." },
            date_to: { type: "string", description: "Fin de la ventana (YYYY-MM-DD), inclusivo." },
          },
          required: ["analyte"],
        },
        vital_threshold: {
          type: "object",
          description: "Umbral sobre un signo vital.",
          properties: {
            vital: {
              type: "string",
              enum: [
                "systolic_bp",
                "diastolic_bp",
                "heart_rate_bpm",
                "respiratory_rate_rpm",
                "oxygen_saturation",
                "temperature_c",
                "weight_kg",
                "height_cm",
                "capillary_glucose",
                "pain_scale",
              ],
            },
            comparator: { type: "string", enum: ["gte", "lte", "gt", "lt", "eq"] },
            value: { type: "number" },
          },
          required: ["vital", "comparator", "value"],
        },
        pregnancy_status: {
          type: "string",
          description: "Estado de embarazo/lactancia del paciente.",
          enum: ["none", "pregnant", "postpartum", "lactating"],
        },
        age_range: {
          type: "object",
          description: "Rango de edad en años cumplidos. Indique min_age y/o max_age (inclusivos).",
          properties: {
            min_age: { type: "integer", minimum: 0, maximum: 150 },
            max_age: { type: "integer", minimum: 0, maximum: 150 },
          },
        },
        appointment_no_show: {
          type: "object",
          description: "Tuvo una cita con inasistencia (no_show) en una ventana opcional de fechas.",
          properties: {
            date_from: { type: "string", description: "Inicio de la ventana (YYYY-MM-DD), inclusivo." },
            date_to: { type: "string", description: "Fin de la ventana (YYYY-MM-DD), inclusivo." },
          },
        },
        limit: { type: "integer", description: "Tamaño de la muestra (1-100).", minimum: 1, maximum: 100 },
        offset: { type: "integer", description: "Desplazamiento de la muestra.", minimum: 0 },
      },
      required: [],
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/population/cohort`, { method: "POST", body: buildCohortBody(args) }),
  },
  {
    // Reportes agregados (G5 fase 2): punto único para los cuatro reportes de calidad/
    // auditoría. Solo lectura; FastAPI exige reports:read y devuelve DATOS AGREGADOS
    // (series/conteos) para revisión del médico, NUNCA filas con PHI ni una acción automática.
    name: "clinical.get_report",
    description:
      "Devuelve un reporte AGREGADO (series/conteos, sin datos de pacientes) para revisión " +
      "del médico. report_type: 'activity' (consultas y citas por mes en date_from..date_to, " +
      "opcional doctor_id), 'top_diagnoses' (ranking de diagnósticos en date_from..date_to, " +
      "limit opcional), 'unsigned_notes' (consultas en borrador por médico, opcional " +
      "doctor_id) o 'attendance' (tasas de asistencia/inasistencia/cancelación en " +
      "date_from..date_to, opcional doctor_id). Es información para revisión, no una acción " +
      "automática. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        report_type: {
          type: "string",
          description: "Tipo de reporte agregado.",
          enum: ["activity", "top_diagnoses", "unsigned_notes", "attendance"],
        },
        date_from: DATE_FROM_PROP,
        date_to: DATE_TO_PROP,
        doctor_id: DOCTOR_FILTER_PROP,
        limit: LIMIT_PROP,
      },
      required: ["report_type"],
      additionalProperties: false,
    },
    execute: (args, ctx) => ctx.api(buildReportPath(args)),
  },
  {
    // Configuración institucional (G5 fase 3): umbrales/metas/intervalos clínicos que la
    // clínica configura. Solo lectura; FastAPI exige institutional_settings:read. Permite que
    // el copiloto FUNDAMENTE sus sugerencias en la configuración de la institución, presentada
    // EXPLÍCITAMENTE como configuración institucional (no como opinión del agente).
    name: "clinical.get_institutional_config",
    description:
      "Devuelve la configuración institucional (umbrales de bandera roja, metas de " +
      "laboratorio, intervalos de seguimiento, protocolos) para fundamentar sugerencias en " +
      "los valores que la CLÍNICA configuró, no en la opinión del agente. Filtra por " +
      "category (vital_threshold/lab_target/follow_up/protocol) o busca por clave/descripción " +
      "(search). Preséntalo como configuración institucional. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filtra por categoría de configuración.",
          enum: ["vital_threshold", "lab_target", "follow_up", "protocol"],
        },
        search: {
          type: "string",
          description: "Busca por clave o descripción (p. ej. 'vital_redflag.systolic_bp').",
        },
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: [],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const params = new URLSearchParams();
      if (typeof args.category === "string" && args.category !== "") {
        params.set("category", args.category);
      }
      if (typeof args.search === "string" && args.search !== "") {
        params.set("q", args.search);
      }
      if (typeof args.limit === "number") params.set("limit", String(args.limit));
      if (typeof args.offset === "number") params.set("offset", String(args.offset));
      const qs = params.toString();
      return ctx.api(`/api/v1/institutional-settings${qs ? `?${qs}` : ""}`);
    },
  },
  {
    // Codificación clínica (G5 fase 4): catálogo de apoyo CIE-10/LOINC/ATC. Solo lectura;
    // FastAPI exige clinical_codes:read. Es una AYUDA a la codificación que el médico
    // confirma: un término desconocido devuelve vacío; el agente NUNCA debe inventar un
    // código que el catálogo no devolvió.
    name: "clinical.search_codes",
    description:
      "Busca códigos clínicos de apoyo en el catálogo por sistema y término. system: 'cie10' " +
      "(diagnósticos), 'loinc' (laboratorio) o 'atc' (medicamentos); query es el término o " +
      "código a buscar. Devuelve los códigos que COINCIDEN; si no hay coincidencia, devuelve " +
      "vacío. Es una ayuda a la codificación que el médico confirma: NUNCA inventes un código " +
      "que no aparezca en el resultado. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        system: {
          type: "string",
          description: "Sistema de codificación a consultar.",
          enum: ["cie10", "loinc", "atc"],
        },
        query: {
          type: "string",
          description: "Término o código a buscar (p. ej. 'diabetes', 'HbA1c', 'E11.9').",
        },
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: ["system", "query"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const params = new URLSearchParams();
      params.set("system", String(args.system ?? ""));
      if (typeof args.query === "string" && args.query !== "") {
        params.set("q", args.query);
      }
      if (typeof args.limit === "number") params.set("limit", String(args.limit));
      if (typeof args.offset === "number") params.set("offset", String(args.offset));
      return ctx.api(`/api/v1/clinical-codes?${params.toString()}`);
    },
  },
  {
    // EPIC ESCALAS fase 1: descubrir las escalas clínicas validadas y sus insumos requeridos.
    // Solo lectura; FastAPI exige clinical_scales:read. El cómputo es determinista y citado.
    //
    // COMPOSICIÓN sugerida (el puntaje es APOYO A LA DECISIÓN que el médico confirma):
    //   1) clinical.list_scales() -> elige la escala y LEE sus insumos requeridos (key, tipo,
    //      valores permitidos).
    //   2) Reúne TODOS los insumos del expediente/conversación. Si falta alguno, PREGÚNTALO al
    //      médico; NUNCA lo asumas ni uses un valor por defecto (no hay puntaje parcial).
    //   3) clinical.compute_scale(scale_id, inputs) -> obtén {score, interpretation_label,
    //      interpretation_detail, sources}. Presenta el puntaje, la interpretación y CITA las
    //      fuentes; recuerda que es un apoyo a la decisión, no un diagnóstico.
    name: "clinical.list_scales",
    description:
      "Lista las escalas clínicas validadas disponibles (p. ej. CHA2DS2-VASc, Wells para TVP) " +
      "con su descripción, fuente citada y los insumos que cada una REQUIERE (key, etiqueta, " +
      "tipo boolean/enum/number y valores permitidos). Úsala antes de clinical.compute_scale " +
      "para saber qué datos reunir. El puntaje es apoyo a la decisión que el médico confirma, " +
      "no un diagnóstico. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: (_args, ctx) => ctx.api(`/api/v1/clinical-scales`),
  },
  {
    // Cómputo determinista de una escala. La validación es estricta en el servidor: si falta o
    // es inválido un insumo, responde 422 nombrando el campo; en ese caso PREGUNTA el dato al
    // médico y NO inventes ni asumas valores.
    name: "clinical.compute_scale",
    description:
      "Computa una escala clínica validada (cómputo determinista, sin estado). scale_id es el " +
      "id de la escala (de clinical.list_scales) e inputs es un objeto con TODOS los insumos " +
      "requeridos por esa escala. Devuelve {scale_id, score, interpretation_label, " +
      "interpretation_detail, sources}. Si faltan o son inválidos los insumos, el servidor " +
      "responde 422 nombrando el campo: en ese caso PREGUNTA el dato al médico, NUNCA lo " +
      "asumas (no hay puntaje parcial). Presenta el resultado citando las fuentes; es apoyo a " +
      "la decisión que el médico confirma, no un diagnóstico. Solo lectura (no guarda nada).",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        scale_id: {
          type: "string",
          description: "Id de la escala a computar (de clinical.list_scales).",
        },
        inputs: {
          type: "object",
          description:
            "Objeto clave→valor con TODOS los insumos requeridos por la escala (ver " +
            "clinical.list_scales). No omitas insumos: si falta uno, pregúntalo.",
          additionalProperties: true,
        },
      },
      required: ["scale_id", "inputs"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const id = encodeURIComponent(String(args.scale_id ?? ""));
      const inputs =
        args.inputs && typeof args.inputs === "object" ? args.inputs : {};
      return ctx.api(`/api/v1/clinical-scales/${id}/compute`, {
        method: "POST",
        body: { inputs } as Record<string, unknown>,
      });
    },
  },
  {
    // NUEVO CLUSTER — Verificaciones de calidad/seguridad clínica (fases 1-2). SÓLO LECTURA:
    // FastAPI exige quality_checks:read. Ejecuta reglas DETERMINISTAS sobre datos existentes y
    // devuelve banderas que el médico REVISA; no corrige ni escribe nada.
    //
    // Reglas: (f1) signos vitales fuera de rango fisiológico, lab imposible, nota SOAP incompleta
    // en borrador, medicamento sin dosis/frecuencia; (f2) cruce FÁRMACO-ALERGIA (medicamento que
    // coincide con una alergia documentada por ingrediente/clase) y MEDICAMENTOS DUPLICADOS
    // activos; (f3) INTERACCIONES fármaco-fármaco (pares de medicamentos activos que la fuente de
    // farmacología reporta como interacción, con severidad/cita) y AJUSTE DE DOSIS RENAL (fármaco
    // de eliminación renal con un eGFR medido por debajo del umbral citado). El cruce fármaco-
    // alergia y las interacciones se resuelven con la fuente de farmacología configurada; si no
    // está disponible, el cruce devuelve source_ref 'drug_allergy:no_disponible' y las
    // interacciones 'drug_interaction:no_disponible' (severidad info): NO concluyen ausencia —
    // adviértelo y sugiere verificar a mano. La regla renal sólo dispara si hay un eGFR medido.
    //
    // COMPOSICIÓN (presenta las banderas como SUGERENCIAS de revisión, NUNCA como correcciones):
    //   1) clinical.run_quality_checks(target_type, target_id) sobre la consulta/receta/paciente.
    //   2) Presenta las banderas como "posibles problemas para tu revisión" citando el umbral/
    //      criterio de cada una (threshold_cited) y lo coincidente/el par (source_ref). El médico
    //      decide; el agente NO actúa sobre ellas (no corrige, no firma, no edita). Si flags está
    //      vacío, dilo sin afirmar que el expediente es perfecto: sólo que estas reglas no marcaron
    //      nada. Si aparece 'drug_allergy:no_disponible' o 'drug_interaction:no_disponible', aclara
    //      que esa verificación NO pudo ejecutarse (no es una confirmación de seguridad).
    name: "clinical.run_quality_checks",
    description:
      "Ejecuta verificaciones DETERMINISTAS de calidad/seguridad sobre una consulta, receta o " +
      "paciente y devuelve POSIBLES PROBLEMAS para la revisión del médico: signos vitales fuera " +
      "de rango fisiológico, valores de laboratorio imposibles, nota SOAP incompleta antes de " +
      "firmar, medicamentos sin dosis/frecuencia, CRUCE FÁRMACO-ALERGIA (medicamento que coincide " +
      "con una alergia documentada), MEDICAMENTOS DUPLICADOS activos, INTERACCIONES fármaco-" +
      "fármaco (pares que la fuente de farmacología reporta, con severidad citada) y AJUSTE DE " +
      "DOSIS RENAL (fármaco de eliminación renal con un eGFR medido por debajo del umbral citado). " +
      "SÓLO LECTURA: no corrige, no escribe ni firma nada. Cada bandera trae regla, severidad, " +
      "mensaje, el origen (registro/campo) y el umbral/criterio citado. Si la fuente de " +
      "farmacología no está disponible, el cruce fármaco-alergia devuelve " +
      "'drug_allergy:no_disponible' y las interacciones 'drug_interaction:no_disponible' (no " +
      "concluyen ausencia). Preséntalas como sugerencias a revisar, NUNCA como correcciones " +
      "automáticas; el médico decide. Devuelve {target_type, target_id, flags, flag_count}.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        target_type: {
          type: "string",
          description:
            "Qué verificar: 'consultation' (nota+vitales+labs+recetas de la consulta), " +
            "'prescription' (medicamentos de la receta) o 'patient' (labs del paciente).",
          enum: ["consultation", "prescription", "patient"],
        },
        target_id: {
          type: "string",
          description: "Id (UUID) de la consulta, receta o paciente a verificar.",
          format: "uuid",
        },
      },
      required: ["target_type", "target_id"],
      additionalProperties: false,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/quality/check`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    // CLINICAL ROADMAP — Conciliación de medicación (gap case 26). SÓLO LECTURA: FastAPI exige
    // medication_reconciliation:read. Consolida la medicación ACTIVA del paciente desde lo
    // PRESCRITO (recetas activas) y lo REPORTADO ('medicamento actual'), de-duplica por
    // ingrediente/clase con la fuente de farmacología, y devuelve discrepancias que el médico
    // REVISA. No corrige, no escribe, no auto-concilia.
    //
    // COMPOSICIÓN: presenta la lista consolidada y las discrepancias (prescribed_not_reported,
    // reported_not_prescribed, duplicate_medication) como "para tu revisión"; NUNCA actúes sobre
    // ellas ni propongas una escritura salvo que el médico lo pida (y toda escritura va por las
    // tools de borrador P1, no por esta lectura). Si resolver_available es false o un elemento
    // trae resolver_status 'no_disponible', aclara que el emparejamiento por ingrediente/clase no
    // estuvo disponible y se usó el nombre (no es una confirmación).
    name: "clinical.reconcile_medications",
    description:
      "Concilia la medicación de un paciente: consolida lo PRESCRITO (recetas activas) y lo " +
      "REPORTADO por el paciente ('medicamento actual'), de-duplica por ingrediente/clase y " +
      "devuelve {patient_id, consolidated, flags, flag_count, resolver_available}. Las " +
      "discrepancias (prescribed_not_reported, reported_not_prescribed, duplicate_medication) son " +
      "PARA REVISIÓN del médico: no corrige ni escribe nada. Si la fuente de farmacología no está " +
      "disponible, el emparejamiento cae a nombre y se marca 'no_disponible' (no concluye). " +
      "Preséntalas como sugerencias; cualquier cambio lo decide el médico por las tools de " +
      "borrador (P1), no por esta lectura. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: {
          type: "string",
          description: "Id (UUID) del paciente a conciliar.",
          format: "uuid",
        },
      },
      required: ["patient_id"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const id = encodeURIComponent(String(args.patient_id));
      return ctx.api(`/api/v1/patients/${id}/medication-reconciliation`);
    },
  },
  {
    // FOLLOW-UP & TASKS (gap 57-62). SÓLO LECTURA: FastAPI exige follow_ups:read. Reúne los
    // pendientes accionables del médico desde modelos YA existentes: tareas clínicas abiertas/
    // vencidas, citas no asistidas (no_show) o canceladas recientes, y resultados de laboratorio
    // anormales sin revisar. No corrige, no escribe, no muta; cita el id de cada registro.
    //
    // COMPOSICIÓN: presenta los tres grupos como "pendientes para tu revisión" citando el
    // registro (tarea/cita/laboratorio), el paciente y la fecha. NUNCA actúes sobre ellos (no
    // marques una tarea como hecha, no revises un laboratorio, no reagendes) salvo que el médico
    // lo pida, y siempre por las tools de escritura correspondientes. Si un grupo viene vacío,
    // dilo sin afirmar que no hay nada pendiente en absoluto: sólo que estas reglas no marcaron
    // nada en la ventana consultada.
    name: "clinical.list_follow_ups",
    description:
      "Reúne los pendientes de seguimiento del médico (SÓLO LECTURA): tareas clínicas abiertas/" +
      "vencidas, citas no asistidas (no_show) o canceladas recientes, y resultados de laboratorio " +
      "anormales (low/high/critical) aún sin revisar. Devuelve cada grupo con su conteo y los " +
      "registros citados (id, paciente, fecha, qué está pendiente). Parámetro opcional " +
      "appointment_lookback_days (1-365, por defecto 30) acota la ventana de citas. No corrige, " +
      "no escribe ni cambia nada: preséntalos como pendientes para la REVISIÓN del médico, nunca " +
      "como acciones automáticas. Solo lectura.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        appointment_lookback_days: {
          type: "number",
          description: "Ventana en días (1-365) para las citas no asistidas/canceladas. Opcional.",
          minimum: 1,
          maximum: 365,
        },
      },
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const days = args.appointment_lookback_days;
      const query =
        days === undefined || days === null
          ? ""
          : `?appointment_lookback_days=${encodeURIComponent(String(days))}`;
      return ctx.api(`/api/v1/follow-ups/summary${query}`);
    },
  },
  {
    // EPIC ESCALAS fase 2: listar los resultados de escalas YA persistidos de un paciente
    // (los borradores que el médico aprobó). Solo lectura; FastAPI exige scale_results:read.
    // Útil para mostrar puntajes previos antes de proponer uno nuevo.
    name: "clinical.list_scale_results",
    description:
      "Lista los resultados de escalas clínicas ya guardados de un paciente (puntajes que el " +
      "médico aprobó). Se consultan por paciente (patient_id) y pueden filtrarse por escala " +
      "(scale_id). El puntaje guardado fue re-computado por el servidor; es apoyo a la decisión, " +
      "no un diagnóstico. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      scale_id: {
        type: "string",
        description: "Id de la escala para filtrar (p. ej. 'cha2ds2_vasc').",
      },
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/scale-results${clinicalListQuery(args, {
          eq: ["patient_id", "scale_id"],
        })}`,
      ),
  },
  {
    // EPIC DOCS fase 1: listar las notas clínicas (SOAP) ya guardadas de un paciente o
    // consulta. Solo lectura; FastAPI exige clinical_notes:read.
    name: "clinical.list_soap_notes",
    description:
      "Lista las notas clínicas (SOAP) ya guardadas de un paciente o de una consulta. Se " +
      "filtran por patient_id, consultation_id y/o status (draft/approved). Cada nota es un " +
      "borrador que el médico aprueba; no es un documento autofirmado. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      consultation_id: CONSULTATION_FILTER_PROP,
      status: {
        type: "string",
        description: "Estado de la nota.",
        enum: ["draft", "approved"],
      },
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/clinical-notes${clinicalListQuery(args, {
          eq: ["patient_id", "consultation_id", "status"],
        })}`,
      ),
  },
  {
    // Acceso clínico estructurado estilo FHIR: equivalente NATIVO a un MCP-server FHIR
    // (p.ej. wso2/fhir-mcp-server) respetando la AUTORIDAD CLÍNICA. Se ejecuta en el
    // NAVEGADOR con la cookie del médico (ctx.api -> credentials:include); FastAPI valida
    // rol/permiso/paciente en cada endpoint. NUNCA hay acceso server-side al expediente
    // desde el gateway. Compone una vista del paciente desde endpoints REST existentes.
    name: "clinical.patient_summary",
    description:
      "Devuelve un resumen del expediente de un paciente (datos del paciente + sus datos " +
      "clínicos importantes: alergias, enfermedades crónicas, medicamentos, alertas). Solo " +
      "lectura, vía la cookie del médico (FastAPI valida permiso y paciente).",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
      },
      required: ["patient_id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const id = encodeURIComponent(String(args.patient_id));
      const [patient, clinicalItems] = await Promise.all([
        ctx.api<unknown>(`/api/v1/patients/${id}`),
        ctx.api<{ items?: unknown[] }>(`/api/v1/patient-clinical-items?patient_id=${id}`),
      ]);
      const items = Array.isArray(clinicalItems?.items) ? clinicalItems.items : clinicalItems;
      return { patient, clinical_items: items };
    },
  },
  {
    // Investigación PubMed: equivalente NATIVO a un MCP-server de PubMed (p.ej.
    // cyanheads/pubmed). Mapea al proxy server-side /api/v1/research/pubmed (NO toca el
    // expediente). El servidor MCP real puede enchufarse después tras el mismo contrato.
    name: "pubmed.search",
    description:
      "Busca artículos en PubMed por términos de consulta para fundamentar con evidencia. " +
      "Devuelve pmid, título, autores, año, fuente y una cita formateada. Solo investigación " +
      "(no toca el expediente). Recuerda: toda salida de IA es un borrador a revisar.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Términos de búsqueda en PubMed." },
        limit: { type: "integer", description: "Máximo de artículos (1-50).", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const params = new URLSearchParams({ query: String(args.query ?? "") });
      if (typeof args.limit === "number") {
        params.set("limit", String(args.limit));
      }
      return ctx.api(`/api/v1/research/pubmed?${params.toString()}`);
    },
  },
  {
    name: "pubmed.get_article",
    description:
      "Obtiene el detalle de un artículo de PubMed por su PMID (incluye el abstract). Solo " +
      "investigación; no toca el expediente.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        pmid: { type: "string", description: "PMID (numérico) del artículo." },
      },
      required: ["pmid"],
      additionalProperties: false,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/research/pubmed/${encodeURIComponent(String(args.pmid))}`),
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
    approval: {
      actionType: "create_consultation_draft",
      targetResource: "consultations",
      summarize: (args) =>
        `Crear una consulta médica EN BORRADOR para el paciente ${String(args.patient_id ?? "—")} ` +
        `(médico tratante ${String(args.attending_doctor_id ?? "—")}). Motivo: ` +
        `${String(args.reason_for_visit ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/consultations`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_prescription_draft",
    description:
      "Crea una receta médica EN BORRADOR ligada a una consulta. Acción de escritura: " +
      "requiere confirmación explícita del médico antes de ejecutarse. La receta nace en " +
      "borrador para que el médico la revise, agregue medicamentos y la apruebe; no se " +
      "aprueba ni imprime de forma autónoma. La consulta puede estar en borrador o " +
      "finalizada. IMPORTANTE: 'related_diagnosis_id' es OPCIONAL; OMÍTELO por completo si " +
      "no hay un diagnóstico real de esa consulta. NUNCA inventes un UUID ni uses ceros " +
      "(00000000-…) como marcador de posición.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: { type: "string", description: "Id (UUID) de la consulta origen.", format: "uuid" },
        related_diagnosis_id: {
          type: "string",
          description:
            "Id (UUID) REAL de un diagnóstico de la MISMA consulta. Opcional: si no hay " +
            "diagnóstico, OMITE el campo (no lo incluyas). Nunca uses un UUID inventado ni ceros.",
          format: "uuid",
        },
        observations: { type: "string", description: "Observaciones de la receta (opcional)." },
      },
      required: ["consultation_id"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_prescription_draft",
      targetResource: "prescriptions",
      summarize: (args) =>
        `Crear una receta médica EN BORRADOR para la consulta ${String(args.consultation_id ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/prescriptions`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_diagnosis_draft",
    description:
      "Registra un diagnóstico o impresión diagnóstica EN BORRADOR en una consulta. Acción de " +
      "escritura: requiere confirmación explícita del médico. Es un borrador a revisar; no " +
      "sustituye el juicio clínico.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: { type: "string", description: "Id (UUID) de la consulta.", format: "uuid" },
        diagnosis_kind: {
          type: "string",
          description: "Tipo de diagnóstico.",
          enum: ["primary", "secondary", "suspected"],
        },
        diagnosis_text: {
          type: "string",
          description: "Texto del diagnóstico o impresión diagnóstica.",
        },
        notes: { type: "string", description: "Notas (opcional)." },
      },
      required: ["consultation_id", "diagnosis_kind", "diagnosis_text"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_diagnosis_draft",
      targetResource: "consultation_diagnoses",
      summarize: (args) =>
        `Registrar un diagnóstico (${String(args.diagnosis_kind ?? "—")}) en la consulta ` +
        `${String(args.consultation_id ?? "—")}: ${String(args.diagnosis_text ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/consultation-diagnoses`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_appointment_draft",
    description:
      "Agenda una cita EN BORRADOR (estado pendiente) para un paciente con un médico. Sólo la " +
      "FECHA es obligatoria; la HORA es opcional (muchas veces el paciente acude dentro del " +
      "horario de consulta sin hora concreta). Acción de escritura: requiere confirmación " +
      "explícita del médico. La cita nace pendiente; el médico la revisa y confirma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        doctor_id: { type: "string", description: "Id (UUID) del médico.", format: "uuid" },
        scheduled_date: {
          type: "string",
          description: "Fecha de la cita (YYYY-MM-DD). Obligatoria.",
        },
        scheduled_time: {
          type: "string",
          description:
            "Hora concreta (HH:MM), OPCIONAL. Omítela si el paciente acude dentro del horario.",
        },
        duration_minutes: {
          type: "integer",
          description: "Duración en minutos (5-480), opcional; sólo si hay hora concreta.",
          minimum: 5,
          maximum: 480,
        },
        reason: { type: "string", description: "Motivo de la cita." },
        internal_notes: { type: "string", description: "Notas internas (opcional)." },
      },
      required: ["patient_id", "doctor_id", "scheduled_date", "reason"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_appointment_draft",
      targetResource: "appointments",
      summarize: (args) => {
        const time = args.scheduled_time ? ` a las ${String(args.scheduled_time)}` : "";
        return (
          `Agendar una cita (pendiente) para el paciente ${String(args.patient_id ?? "—")} con el ` +
          `médico ${String(args.doctor_id ?? "—")} el ${String(args.scheduled_date ?? "—")}${time}. ` +
          `Motivo: ${String(args.reason ?? "—")}.`
        );
      },
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/appointments`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_patient_clinical_item_draft",
    description:
      "Registra un dato clínico importante del paciente EN BORRADOR (alergia, enfermedad " +
      "crónica, medicamento actual, hábito relevante, alerta clínica u otro). Acción de " +
      "escritura: requiere confirmación explícita del médico.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        item_type: {
          type: "string",
          description: "Tipo de dato clínico.",
          enum: [
            "allergy",
            "chronic_condition",
            "current_medication",
            "relevant_habit",
            "clinical_alert",
            "other",
          ],
        },
        title: { type: "string", description: "Nombre del dato clínico." },
        details: {
          type: "string",
          description: "Detalle: reacción, dosis, frecuencia o contexto (opcional).",
        },
        severity: {
          type: "string",
          description: "Severidad (opcional).",
          enum: ["low", "moderate", "high", "critical"],
        },
      },
      required: ["patient_id", "item_type", "title"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_patient_clinical_item_draft",
      targetResource: "patient_clinical_items",
      summarize: (args) =>
        `Registrar un dato clínico (${String(args.item_type ?? "—")}) para el paciente ` +
        `${String(args.patient_id ?? "—")}: ${String(args.title ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/patient-clinical-items`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    name: "clinical.create_lab_result_draft",
    description:
      "Registra un resultado de laboratorio/observación ESTRUCTURADO para un paciente (valor " +
      "numérico o cualitativo, unidad, rango de referencia, marca de anormalidad, fecha). " +
      "Acción de escritura: requiere confirmación explícita del médico antes de guardarse. El " +
      "médico revisa y aprueba el dato exacto; nada se guarda de forma autónoma. Al extraer un " +
      "reporte (ver clinical.read_document_content), incluye analyte_code con el LOINC que " +
      "encontraste (clinical.search_codes) y clinical_document_id como documento de origen.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        analyte_name: { type: "string", description: "Nombre del analito o prueba (p. ej. 'HbA1c')." },
        analyte_code: { type: "string", description: "Código LOINC del analito (opcional; de clinical.search_codes)." },
        value_numeric: { type: "number", description: "Valor numérico del resultado (si es cuantitativo)." },
        value_text: { type: "string", description: "Valor cualitativo (p. ej. 'positivo'), si aplica." },
        unit: { type: "string", description: "Unidad de medida (opcional)." },
        reference_range_low: { type: "number", description: "Límite inferior del rango de referencia (opcional)." },
        reference_range_high: { type: "number", description: "Límite superior del rango de referencia (opcional)." },
        abnormal_flag: {
          type: "string",
          description: "Marca de anormalidad.",
          enum: ["normal", "low", "high", "critical", "unknown"],
        },
        measured_at: {
          type: "string",
          description: "Fecha y hora ISO 8601 de la medición (opcional; por defecto, ahora).",
        },
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta asociada (opcional).",
          format: "uuid",
        },
        clinical_document_id: {
          type: "string",
          description: "Id (UUID) del documento de origen (opcional).",
          format: "uuid",
        },
        source_name: { type: "string", description: "Laboratorio o fuente (opcional)." },
        method: { type: "string", description: "Método de medición (opcional)." },
      },
      required: ["patient_id", "analyte_name"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_lab_result_draft",
      targetResource: "lab_results",
      summarize: (args) => {
        const value =
          args.value_numeric !== undefined && args.value_numeric !== null
            ? `${String(args.value_numeric)}${args.unit ? ` ${String(args.unit)}` : ""}`
            : String(args.value_text ?? "—");
        return (
          `Registrar el resultado "${String(args.analyte_name ?? "—")}" = ${value} ` +
          `para el paciente ${String(args.patient_id ?? "—")}` +
          `${args.abnormal_flag ? ` (marca: ${String(args.abnormal_flag)})` : ""}.`
        );
      },
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/lab-results`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_clinical_event_draft",
    description:
      "Registra un evento clínico EN BORRADOR en la línea de tiempo del paciente " +
      "(hospitalización, urgencia, referencia, procedimiento u otro). Acción de escritura: " +
      "requiere confirmación explícita del médico antes de guardarse. El médico revisa y aprueba " +
      "el evento exacto; nada se guarda de forma autónoma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        event_type: {
          type: "string",
          description: "Tipo de evento.",
          enum: ["hospitalization", "emergency", "referral", "procedure", "other"],
        },
        title: { type: "string", description: "Título breve del evento." },
        description: { type: "string", description: "Descripción o contexto (opcional)." },
        started_at: {
          type: "string",
          description: "Fecha y hora ISO 8601 de inicio (opcional; por defecto, ahora).",
        },
        ended_at: { type: "string", description: "Fecha y hora ISO 8601 de fin (opcional)." },
        severity: {
          type: "string",
          description: "Severidad (opcional).",
          enum: ["low", "moderate", "high", "critical"],
        },
        specialty: { type: "string", description: "Especialidad relacionada (opcional)." },
        destination: { type: "string", description: "Destino, p. ej. en una referencia (opcional)." },
        status: {
          type: "string",
          description: "Estado del evento (opcional).",
          enum: ["active", "resolved", "cancelled"],
        },
      },
      required: ["patient_id", "event_type", "title"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_clinical_event_draft",
      targetResource: "clinical_events",
      summarize: (args) =>
        `Registrar un evento clínico (${String(args.event_type ?? "—")}) para el paciente ` +
        `${String(args.patient_id ?? "—")}: ${String(args.title ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-events`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    // EPIC ESCALAS fase 2: persistir un resultado de escala como BORRADOR que el médico
    // aprueba (P1). El servidor RE-COMPUTA el puntaje desde scale_id + inputs (no confía en
    // ningún puntaje del cliente). Flujo del agente: clinical.compute_scale (fase 1) para
    // mostrar el puntaje + interpretación + fuentes -> proponer ESTA acción con patient_id +
    // scale_id + los MISMOS inputs para aprobación. Si faltan/invalidan insumos, el servidor
    // responde 422 nombrando el campo: pregunta el dato, no lo asumas.
    name: "clinical.create_scale_result_draft",
    description:
      "Guarda el resultado de una escala clínica EN BORRADOR para un paciente (CHA2DS2-VASc, " +
      "Wells, etc.), ligándolo opcionalmente a una consulta. Acción de escritura: requiere " +
      "confirmación explícita del médico antes de guardarse. El servidor recomputa el puntaje " +
      "desde scale_id + inputs (no se confía en un puntaje provisto); el médico aprueba el dato " +
      "exacto. Antes, computa con clinical.compute_scale y muestra puntaje, interpretación y " +
      "fuentes. Si faltan insumos, pregúntalos; nada se guarda de forma autónoma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        scale_id: {
          type: "string",
          description: "Id de la escala (de clinical.list_scales; p. ej. 'cha2ds2_vasc').",
        },
        inputs: {
          type: "object",
          description:
            "Insumos requeridos por la escala (los MISMOS con los que computaste). El " +
            "servidor los valida y recomputa el puntaje.",
          additionalProperties: true,
        },
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta asociada (opcional).",
          format: "uuid",
        },
      },
      required: ["patient_id", "scale_id", "inputs"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_scale_result_draft",
      targetResource: "scale_results",
      // scale_results no publica forms.create (su insumo JSON no es un form genérico):
      // se gatea por el permiso explícito, no por la señal "creable" del catálogo.
      requiredPermissions: ["scale_results:create"],
      summarize: (args) =>
        `Guardar el resultado de la escala "${String(args.scale_id ?? "—")}" para el paciente ` +
        `${String(args.patient_id ?? "—")} (el servidor recomputa el puntaje).`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/scale-results`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    // EPIC ESCALAS: corregir un resultado GUARDADO sin borrar y recrear ("capturé mal un
    // insumo"). El servidor RECOMPUTA el puntaje desde la escala guardada + los nuevos
    // inputs (jamás confía en un puntaje del cliente) y conserva la identidad de la escala
    // (scale_id no cambia en una edición). También permite re-vincular la consulta.
    name: "clinical.update_scale_result_draft",
    description:
      "Corrige un resultado de escala clínica YA GUARDADO: envía los inputs corregidos y el " +
      "servidor RECOMPUTA el puntaje, interpretación y fuente desde la escala original (no se " +
      "acepta un puntaje directo ni cambiar de escala; para otra escala, crea un resultado " +
      "nuevo). También puede re-vincular la consulta asociada. Acción de escritura: requiere " +
      "confirmación explícita del médico. Úsala cuando un insumo se capturó mal; muestra antes " +
      "el nuevo cómputo con clinical.compute_scale para que el médico apruebe el dato exacto.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        result_id: {
          type: "string",
          description: "Id (UUID) del resultado guardado (de clinical.list_scale_results).",
          format: "uuid",
        },
        inputs: {
          type: "object",
          description:
            "Insumos corregidos COMPLETOS de la escala (el servidor los valida y recomputa; " +
            "422 nombrando el campo si faltan o son inválidos).",
          additionalProperties: true,
        },
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta a vincular (opcional).",
          format: "uuid",
        },
      },
      required: ["result_id"],
      additionalProperties: false,
    },
    approval: {
      actionType: "update_scale_result_draft",
      targetResource: "scale_results",
      requiredPermissions: ["scale_results:update"],
      summarize: (args) =>
        `Corregir el resultado de escala ${String(args.result_id ?? "—")}` +
        (args.inputs !== undefined
          ? " con nuevos insumos (el servidor recomputa el puntaje)"
          : "") +
        (args.consultation_id !== undefined
          ? `, vinculándolo a la consulta ${String(args.consultation_id)}`
          : "") +
        ".",
    },
    execute: (args, ctx) => {
      const { result_id: resultId, ...body } = args as {
        result_id: string;
        inputs?: Record<string, unknown>;
        consultation_id?: string;
      };
      return ctx.api(`/api/v1/scale-results/${encodeURIComponent(resultId)}`, {
        method: "PATCH",
        body,
      });
    },
  },
  {
    // STRUCTURED HISTORY (gap 6): listar los antecedentes ESTRUCTURADOS de un paciente
    // (familiar/quirúrgico/obstétrico/patológico/no patológico). Solo lectura; FastAPI exige
    // patient_history_items:read. Distinto de patient_clinical_items (problemas ACTIVOS): esto es
    // la HISTORIA (antecedentes). Filtrable por categoría.
    name: "clinical.list_history_items",
    description:
      "Lista los ANTECEDENTES clínicos estructurados de un paciente (historia familiar, " +
      "quirúrgica, obstétrica y personal patológica/no patológica). Se consultan por paciente " +
      "(patient_id) y pueden filtrarse por categoría (familiar/quirurgico/obstetrico/patologico/" +
      "no_patologico). Son ANTECEDENTES (historia), no los problemas activos del resumen (para " +
      "esos usa clinical.patient_summary / los datos clínicos). Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      category: {
        type: "string",
        description: "Categoría para filtrar.",
        enum: ["familiar", "quirurgico", "obstetrico", "patologico", "no_patologico"],
      },
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/patient-history-items${clinicalListQuery(args, {
          eq: ["patient_id", "category"],
        })}`,
      ),
  },
  {
    // STRUCTURED HISTORY (gap 6): crear un antecedente ESTRUCTURADO como BORRADOR que el médico
    // aprueba (P1). Acción de escritura gateada por aprobación: nada se guarda de forma autónoma.
    // Para antecedentes familiares, usa relationship_to_patient (parentesco). Funda el dato en lo
    // que dijo el paciente/el expediente; no inventes diagnósticos ni fechas.
    name: "clinical.create_history_item_draft",
    description:
      "Guarda un ANTECEDENTE clínico estructurado EN BORRADOR para un paciente (historia " +
      "familiar/quirúrgica/obstétrica/patológica/no patológica). Acción de escritura: requiere " +
      "confirmación explícita del médico antes de guardarse; nada se guarda de forma autónoma. " +
      "category y description son obligatorios; para antecedentes familiares indica el parentesco " +
      "(relationship_to_patient). Campos opcionales: condición/código relacionados, edad de " +
      "inicio (0-120) y fecha del evento. No inventes datos: funda el antecedente en lo referido.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        category: {
          type: "string",
          description: "Categoría del antecedente.",
          enum: ["familiar", "quirurgico", "obstetrico", "patologico", "no_patologico"],
        },
        description: {
          type: "string",
          description: "Descripción breve (p. ej. 'Apendicectomía', 'Diabetes en la madre').",
        },
        relationship_to_patient: {
          type: "string",
          description: "Parentesco, para antecedentes familiares (opcional).",
          enum: ["padre", "madre", "hermano", "hermana", "abuelo", "abuela", "hijo", "hija", "otro"],
        },
        related_condition: {
          type: "string",
          description: "Condición o diagnóstico relacionado, en texto libre (opcional).",
        },
        related_code: {
          type: "string",
          description: "Código de la condición (estilo CIE-10), si se conoce (opcional).",
        },
        onset_age: {
          type: "number",
          description: "Edad (años) de inicio o del evento (0-120, opcional).",
          minimum: 0,
          maximum: 120,
        },
        occurred_on: {
          type: "string",
          description: "Fecha del evento en formato AAAA-MM-DD (opcional).",
        },
        notes: { type: "string", description: "Notas o contexto adicional (opcional)." },
      },
      required: ["patient_id", "category", "description"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_history_item_draft",
      targetResource: "patient_history_items",
      summarize: (args) =>
        `Guardar un antecedente "${String(args.category ?? "—")}" (${String(
          args.description ?? "—",
        )}) para el paciente ${String(args.patient_id ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/patient-history-items`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    // VACCINATION TRACKING: listar las inmunizaciones (vacunas administradas) de un paciente.
    // Solo lectura; FastAPI exige patient_immunizations:read. Filtrable por estado.
    name: "clinical.list_immunizations",
    description:
      "Lista las INMUNIZACIONES (vacunas) registradas de un paciente. Se consultan por paciente " +
      "(patient_id) y pueden filtrarse por estado (aplicada/no_aplicada/contraindicada). Cada " +
      "registro incluye la vacuna, el número de dosis, la fecha de aplicación, la vía, el lote y " +
      "el sitio cuando se conocen. Solo lectura.",
    kind: "read",
    inputSchema: clinicalListSchema({
      patient_id: PATIENT_FILTER_PROP,
      status: {
        type: "string",
        description: "Estado para filtrar.",
        enum: ["aplicada", "no_aplicada", "contraindicada"],
      },
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/patient-immunizations${clinicalListQuery(args, {
          eq: ["patient_id", "status"],
        })}`,
      ),
  },
  {
    // VACCINATION TRACKING: crear una inmunización como BORRADOR que el médico aprueba (P1).
    // Acción de escritura gateada por aprobación: nada se guarda de forma autónoma. Funda el dato
    // en lo que dijo el paciente / el expediente; no inventes vacunas, fechas ni lotes.
    name: "clinical.create_immunization_draft",
    description:
      "Guarda una INMUNIZACIÓN (vacuna) EN BORRADOR para un paciente. Acción de escritura: " +
      "requiere confirmación explícita del médico antes de guardarse; nada se guarda de forma " +
      "autónoma. vaccine_name es obligatorio. Campos opcionales: número de dosis (1-50), fecha de " +
      "aplicación (AAAA-MM-DD), vía (intramuscular/subcutanea/intradermica/oral/intranasal), lote, " +
      "sitio anatómico y notas. status por defecto 'aplicada'. No inventes datos: funda el " +
      "registro en lo referido o documentado.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        vaccine_name: {
          type: "string",
          description: "Nombre de la vacuna (p. ej. 'Influenza estacional', 'Hepatitis B').",
        },
        status: {
          type: "string",
          description: "Estado del registro (por defecto 'aplicada').",
          enum: ["aplicada", "no_aplicada", "contraindicada"],
        },
        dose_number: {
          type: "number",
          description: "Número de dosis aplicada (1-50, opcional).",
          minimum: 1,
          maximum: 50,
        },
        administered_on: {
          type: "string",
          description: "Fecha de aplicación en formato AAAA-MM-DD (opcional).",
        },
        route: {
          type: "string",
          description: "Vía de administración (opcional).",
          enum: ["intramuscular", "subcutanea", "intradermica", "oral", "intranasal"],
        },
        lot_number: {
          type: "string",
          description: "Número de lote del biológico (opcional).",
        },
        site: {
          type: "string",
          description: "Sitio anatómico de aplicación (p. ej. 'deltoides izquierdo', opcional).",
        },
        notes: { type: "string", description: "Notas o contexto adicional (opcional)." },
      },
      required: ["patient_id", "vaccine_name"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_immunization_draft",
      targetResource: "patient_immunizations",
      summarize: (args) =>
        `Guardar la inmunización "${String(args.vaccine_name ?? "—")}" para el paciente ${String(
          args.patient_id ?? "—",
        )}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/patient-immunizations`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    // AUDIT LOG READ (gaps 105/110-112): consultar la bitácora de auditoría YA registrada
    // (quién accedió/cambió qué y cuándo). Solo lectura; FastAPI exige audit_events:read (gate
    // SENSIBLE dedicado). Presenta los registros tal cual ('registros de auditoría'): NUNCA
    // infiere intención ni edita la bitácora. El rastro de un paciente se reconstruye con
    // entity_type=patient + entity_id (la bitácora no tiene una columna patient_id propia).
    name: "clinical.list_audit_events",
    description:
      "Lista los REGISTROS DE AUDITORÍA ya registrados (bitácora append-only): qué acción se " +
      "ejecutó, sobre qué entidad, por qué usuario y cuándo. Se puede filtrar por usuario " +
      "(actor_user_id), acción (action), tipo de entidad (entity_type), entidad concreta " +
      "(entity_id) y rango de fecha (date_from/date_to). Para el rastro de un paciente, filtra " +
      "entity_type=patient y entity_id=<id del paciente>. Solo lectura: presenta los registros " +
      "tal como están; no infiere intención ni modifica nada.",
    kind: "read",
    inputSchema: clinicalListSchema({
      actor_user_id: {
        type: "string",
        description: "Filtra por id (UUID) del usuario que ejecutó la acción.",
        format: "uuid",
      },
      action: {
        type: "string",
        description: "Filtra por acción exacta (p. ej. consultation_finalized).",
      },
      entity_type: {
        type: "string",
        description: "Filtra por tipo de entidad (p. ej. patient, prescription).",
      },
      entity_id: {
        type: "string",
        description: "Filtra por id (UUID) de la entidad afectada.",
        format: "uuid",
      },
      date_from: DATE_FROM_PROP,
      date_to: DATE_TO_PROP,
    }),
    execute: (args, ctx) =>
      ctx.api(
        `/api/v1/audit-events${clinicalListQuery(args, {
          eq: ["actor_user_id", "action", "entity_type", "entity_id"],
          dateField: "occurred_at",
        })}`,
      ),
  },
  {
    // CONVERSACIÓN→EXPEDIENTE (keystone determinista): buscar pacientes existentes por señales
    // de identidad y devolver candidatos ORDENADOS para que el médico ELIJA. Solo lectura;
    // FastAPI exige patients:read. Sirve también para DEDUPLICAR antes de crear (has_strong_match
    // avisa de un posible duplicado). NUNCA abre ni crea un expediente por su cuenta; presenta
    // 'posibles coincidencias para elegir' con campos seguros (sin CURP/correo/dirección).
    name: "clinical.search_patients",
    description:
      "Busca pacientes EXISTENTES por nombre (DIFUSO: tolera acentos, mayúsculas, espacios, nombres " +
      "PARCIALES como solo el nombre de pila, y errores de tipeo), teléfono, CURP, fecha de " +
      "nacimiento o correo, y devuelve POSIBLES COINCIDENCIAS ordenadas por confianza " +
      "(exacto/fuerte/posible). Cuando devuelva candidatos, MUÉSTRALOS al médico con ui.render_buttons " +
      "(un botón por candidato con nombre + edad + teléfono enmascarado) para que ELIJA uno; no los " +
      "listes solo en texto. Arma la acción de CADA botón como un mensaje que INCLUYA el id del " +
      "candidato, p. ej. 'Usar paciente <id> (Nombre)', para poder continuar sin volver a buscar. Una " +
      "vez que el médico elija un candidato, ÚSALO por su id: NO repitas esta búsqueda ni vuelvas a " +
      "mostrar la lista de candidatos. Úsala ANTES de crear un paciente para detectar duplicados (has_strong_match). Solo " +
      "lectura: no abre ni crea expedientes; si no hay coincidencia devuelve vacío. Sólo expone " +
      "campos seguros (nombre, año de nacimiento, edad, sexo, teléfono enmascarado).",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre o parte del nombre (difuso)." },
        phone: { type: "string", description: "Teléfono (se compara por dígitos)." },
        curp: { type: "string", description: "CURP exacta." },
        birth_date: { type: "string", description: "Fecha de nacimiento (AAAA-MM-DD)." },
        email: { type: "string", description: "Correo exacto." },
        limit: { type: "integer", description: "Máximo de candidatos (1-50).", minimum: 1, maximum: 50 },
      },
      required: [],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const params = new URLSearchParams();
      for (const key of ["name", "phone", "curp", "birth_date", "email"]) {
        const value = args[key];
        if (typeof value === "string" && value !== "") params.set(key, value);
      }
      if (typeof args.limit === "number") params.set("limit", String(args.limit));
      const qs = params.toString();
      return ctx.api(`/api/v1/patients/search${qs ? `?${qs}` : ""}`);
    },
  },
  {
    // UI HÍBRIDA (paso 1-2 de la política): ANTES de componer UI dinámica, consulta el catálogo
    // de PLANTILLAS REGISTRADAS y elige una. Devuelve, filtradas por el RBAC del médico, las
    // plantillas (recurso) con sus modos (create/edit/review), el contrato de prellenado (qué
    // campos puede sugerir el agente y cuáles son obligatorios a confirmar) y las acciones
    // permitidas. Solo lectura; la plataforma renderiza/valida/audita. El agente PROPONE.
    name: "clinical.list_templates",
    description:
      "Lista las PLANTILLAS REGISTRADAS que el médico puede usar (flujos comunes/clínicos/" +
      "regulados), filtradas por sus permisos. Para cada una: id estable, etiqueta, modos " +
      "permitidos (create/edit/review), contrato de prellenado (campos sugeribles y campos " +
      "obligatorios a confirmar) y acciones permitidas. ÚSALA PRIMERO: elige una plantilla " +
      "registrada y propón abrirla con prellenado en vez de inventar UI. Solo lectura.",
    kind: "read",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    execute: (_args, ctx) => ctx.api(`/api/v1/agent/templates`),
  },
  {
    // UI HÍBRIDA (paso 3): una vez elegida una plantilla REGISTRADA (con clinical.list_templates),
    // proponer abrirla PRELLENADA. El agente emite valores de alta confianza (prefilled) y de
    // menor confianza (suggested), más los fragmentos de origen que respaldan cada valor. La
    // plataforma valida contra el catálogo + RBAC, DESCARTA campos que no existan en el esquema
    // (no inventa), renderiza el formulario registrado prellenado y enruta la aceptación del
    // médico por la ruta P1. NADA se guarda automáticamente: el médico revisa/edita/aprueba.
    name: "clinical.open_template",
    description:
      "Propone ABRIR una plantilla registrada PRELLENADA (paso posterior a clinical.list_templates). " +
      "Indica template_id (id del catálogo), mode (create/edit/review), prefilled (valores de alta " +
      "confianza), suggested (valores de menor confianza, se marcan como sugerencia) y " +
      "source_fragments (el fragmento de origen que respalda cada campo, para trazabilidad). Sólo " +
      "se aceptan campos que existan en el esquema de la plantilla; los demás se descartan (no " +
      "inventes campos ni plantillas). NO guarda nada: la plataforma muestra el formulario " +
      "prellenado y el médico revisa/edita/aprueba por la ruta de aprobación. Si template_id es " +
      "desconocido o no está permitido, se rechaza nombrándolo: pide o elige una plantilla válida.",
    kind: "read",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "Id de la plantilla (del catálogo)." },
        mode: {
          type: "string",
          description: "Modo de apertura.",
          enum: ["create", "edit", "review"],
        },
        prefilled: {
          type: "object",
          description: "Valores de alta confianza por campo (se prellenan).",
          additionalProperties: true,
        },
        suggested: {
          type: "object",
          description: "Valores de menor confianza por campo (se marcan como sugerencia).",
          additionalProperties: true,
        },
        source_fragments: {
          type: "object",
          description: "Fragmento de origen (transcripción/fuente) que respalda cada campo.",
          additionalProperties: true,
        },
        source_overall: {
          type: "string",
          description: "Fragmento de origen general que respalda la propuesta (opcional).",
        },
      },
      required: ["template_id", "mode"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const id = encodeURIComponent(String(args.template_id));
      const body: Record<string, unknown> = { mode: args.mode };
      for (const key of ["prefilled", "suggested", "source_fragments", "source_overall"]) {
        if (args[key] !== undefined) body[key] = args[key];
      }
      return ctx.api(`/api/v1/agent/templates/${id}/prefill`, { method: "POST", body });
    },
  },
  {
    // CONVERSACIÓN→EXPEDIENTE (seam EXTRACCIÓN->PREFILL, MP-CTRL-0118): cierra "hablar/dictar ->
    // formulario registrado prellenado -> aprobar". El agente extrae los campos de la transcripción/
    // texto libre (la extracción LLM es su trabajo) y aquí emite el RESULTADO ya estructurado:
    // cada campo con confianza [0,1] y el fragmento de origen que lo respalda. La plataforma reparte
    // DETERMINISTA por confianza (alta -> prellenado, media -> sugerido, baja -> descartado), descarta
    // los campos ajenos al esquema (no inventa) y deja vacíos los ausentes (la ausencia no es un
    // negativo clínico). Devuelve el MISMO plan que clinical.open_template: el formulario registrado
    // se renderiza prellenado y el médico revisa/edita/aprueba por la ruta P1. NADA se guarda.
    name: "clinical.prefill_from_extraction",
    description:
      "Mapea un RESULTADO DE EXTRACCIÓN (de una transcripción/texto libre) a una plantilla " +
      "registrada PRELLENADA. Indica template_id (del catálogo), mode (create/edit/review) y " +
      "extracted_fields: lista de campos extraídos, cada uno { field, value, confidence (0..1), " +
      "source_fragment }. La plataforma reparte por confianza (alta -> prellenado, media -> " +
      "sugerido, baja -> descartado), descarta los campos que no existan en el esquema (no inventes " +
      "campos) y deja vacíos los ausentes (no afirmes un negativo por ausencia). NO guarda nada: " +
      "muestra el formulario prellenado y el médico aprueba por la ruta de aprobación. Usa esto " +
      "cuando partes de una transcripción/dictado; si ya separaste confianza alta/baja, usa " +
      "clinical.open_template. Si template_id es desconocido o no permitido, se rechaza nombrándolo.",
    kind: "read",
    // El validador local acotado no cubre arrays; esquema permisivo + wireSchema rico (igual que las
    // demás tools con listas). El execute arma defensivamente el cuerpo de la petición.
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "Id de la plantilla (del catálogo)." },
        mode: {
          type: "string",
          description: "Modo de apertura.",
          enum: ["create", "edit", "review"],
        },
        extracted_fields: {
          type: "array",
          description: "Campos extraídos con su confianza y fragmento de origen.",
          items: {
            type: "object",
            properties: {
              field: { type: "string", description: "Nombre del campo de la plantilla." },
              value: { description: "Valor extraído (en bruto; el médico lo revisa)." },
              confidence: {
                type: "number",
                description: "Confianza de la extracción en [0,1].",
                minimum: 0,
                maximum: 1,
              },
              source_fragment: {
                type: "string",
                description: "Fragmento de origen que respalda el valor (trazabilidad).",
              },
            },
            required: ["field", "value", "confidence"],
            additionalProperties: false,
          },
        },
        source_overall: {
          type: "string",
          description: "Id/fragmento de la transcripción o fuente general (opcional).",
        },
        allowed_actions: {
          type: "array",
          description: "Acciones que se sugieren habilitar tras la revisión (se filtran por RBAC).",
          items: { type: "string" },
        },
      },
      required: ["template_id", "mode", "extracted_fields"],
      additionalProperties: false,
    },
    execute: (args, ctx) => {
      const id = encodeURIComponent(String(args.template_id));
      const body: Record<string, unknown> = { mode: args.mode };
      for (const key of ["extracted_fields", "source_overall", "allowed_actions"]) {
        if (args[key] !== undefined) body[key] = args[key];
      }
      return ctx.api(`/api/v1/agent/templates/${id}/prefill-from-extraction`, {
        method: "POST",
        body,
      });
    },
  },
  {
    // CONVERSACIÓN→EXPEDIENTE (casos 116/117/119/123): proponer el ALTA de un paciente como
    // BORRADOR P1 con campos prellenados desde lo extraído. NUNCA autocrea: el alta pasa por la
    // aprobación del médico. ANTES de crear, internamente DEDUPLICA (llama a la búsqueda de 0113):
    // si hay una coincidencia fuerte y no se ha confirmado (acknowledge_duplicates), NO crea y
    // devuelve las posibles coincidencias para que el médico elija un expediente existente.
    // Valida formatos (CURP/teléfono/fecha) NOMBRANDO el campo inválido para que el agente pida
    // corregirlo; los campos ausentes quedan VACÍOS (la ausencia no es una afirmación negativa).
    name: "clinical.create_patient_draft",
    description:
      "Propone el ALTA de un paciente EN BORRADOR con los datos extraídos (nombre, fecha de " +
      "nacimiento, sexo y, si están, teléfono/correo/CURP/dirección). Acción de escritura: " +
      "requiere aprobación explícita del médico; nada se crea de forma autónoma. ANTES de crear " +
      "BUSCA DUPLICADOS: si existe una coincidencia fuerte devuelve 'posibles coincidencias " +
      "existentes — confirma antes de crear' SIN crear nada, para que el médico elija el " +
      "expediente existente; para crear de todos modos, reenvía con acknowledge_duplicates=true. " +
      "No inventes datos: deja vacío lo que no sepas (no rellenes valores por defecto). full_name, " +
      "birth_date (AAAA-MM-DD) y sex son obligatorios.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Nombre completo del paciente." },
        birth_date: {
          type: "string",
          description: "Fecha de nacimiento en formato AAAA-MM-DD.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
        sex: {
          type: "string",
          description: "Sexo registrado.",
          enum: ["female", "male", "other", "unspecified"],
        },
        phone: {
          type: "string",
          description: "Teléfono (dígitos y separadores).",
          pattern: "^[0-9()+\\-\\s]{7,20}$",
        },
        email: { type: "string", description: "Correo electrónico." },
        curp: {
          type: "string",
          description: "CURP mexicana (18 caracteres).",
          pattern: "^[A-Za-z][AEIOUXaeioux][A-Za-z]{2}[0-9]{6}[HMhm][A-Za-z]{5}[0-9A-Za-z][0-9]$",
        },
        address: { type: "string", description: "Dirección." },
        acknowledge_duplicates: {
          type: "boolean",
          description: "Crear aunque existan posibles duplicados (sólo tras revisarlos el médico).",
        },
      },
      required: ["full_name", "birth_date", "sex"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_patient_draft",
      targetResource: "patients",
      summarize: (args) =>
        `Crear el expediente del paciente "${String(args.full_name ?? "—")}" ` +
        `(nac. ${String(args.birth_date ?? "—")}).`,
    },
    execute: async (args, ctx) => {
      // 1) Dedup interno (búsqueda de 0113) con las señales de identidad disponibles.
      const search = new URLSearchParams();
      search.set("name", String(args.full_name));
      for (const key of ["phone", "curp", "birth_date", "email"]) {
        const value = args[key];
        if (typeof value === "string" && value !== "") search.set(key, value);
      }
      const dedup = (await ctx.api(
        `/api/v1/patients/search?${search.toString()}`,
      )) as { has_strong_match?: boolean; candidates?: unknown[] };

      if (dedup.has_strong_match && args.acknowledge_duplicates !== true) {
        // Coincidencia fuerte: NO se crea. Se devuelven los candidatos para que el médico
        // elija un expediente existente o confirme la creación reenviando acknowledge_duplicates.
        return {
          created: false,
          message:
            "Posibles coincidencias existentes — confirma antes de crear. Para usar un " +
            "paciente existente, elígelo; para crear de todos modos, reenvía con " +
            "acknowledge_duplicates=true.",
          possible_duplicates: dedup.candidates ?? [],
        };
      }

      // 2) Sin duplicado fuerte (o ya confirmado): se crea el expediente. ``acknowledge_duplicates``
      // no es un campo del paciente: se excluye del cuerpo (PatientCreate rechaza extras).
      const body: Record<string, unknown> = {};
      for (const key of ["full_name", "birth_date", "sex", "phone", "email", "curp", "address"]) {
        const value = args[key];
        if (value !== undefined && value !== null && value !== "") body[key] = value;
      }
      const patient = await ctx.api(`/api/v1/patients`, { method: "POST", body });
      return { created: true, patient };
    },
  },
  {
    // EPIC DOCS fase 1: componer una nota SOAP de una consulta y guardarla como BORRADOR que
    // el médico aprueba (P1). NUNCA se autofinaliza: nace en estado draft.
    //
    // COMPOSICIÓN sugerida (todo se fundamenta en los datos REALES de la consulta; nada se
    // inventa; el médico revisa y aprueba):
    //   1) Lee la consulta y los datos clínicos relevantes (p. ej. clinical.patient_summary,
    //      clinical.list_lab_results, clinical.list_diagnoses) para conocer el contenido real.
    //   2) Redacta las cuatro secciones SOAP fundamentadas en esos datos: S (motivo/
    //      padecimiento/interrogatorio), O (exploración/hallazgos/laboratorio), A (análisis/
    //      impresión), P (tratamiento/indicaciones/seguimiento). Si una sección no tiene datos
    //      de origen, DÉJALA VACÍA — no inventes contenido.
    //   3) Propón clinical.create_soap_note_draft(consultation_id, S/O/A/P) para aprobación. El
    //      servidor deriva el paciente de la consulta y guarda la nota como BORRADOR; el médico
    //      la finaliza. El paciente y el estado NO se envían (los gobierna el servidor).
    name: "clinical.create_soap_note_draft",
    description:
      "Guarda una nota SOAP EN BORRADOR para una consulta, compuesta de sus datos reales " +
      "(secciones S/O/A/P). Acción de escritura: requiere confirmación explícita del médico " +
      "antes de guardarse, y la nota queda en BORRADOR (nunca autofirmada/autofinalizada). El " +
      "servidor deriva el paciente de la consulta; no envíes patient_id ni status. Deja vacía " +
      "cualquier sección sin datos de origen: no inventes contenido. Debe traer al menos una " +
      "sección con contenido.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta de la que se compone la nota.",
          format: "uuid",
        },
        subjective: { type: "string", description: "Sección S (Subjetivo). Vacía si no hay datos." },
        objective: { type: "string", description: "Sección O (Objetivo). Vacía si no hay datos." },
        assessment: { type: "string", description: "Sección A (Análisis). Vacía si no hay datos." },
        plan: { type: "string", description: "Sección P (Plan). Vacía si no hay datos." },
      },
      required: ["consultation_id"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_soap_note_draft",
      targetResource: "clinical_notes",
      summarize: (args) =>
        `Guardar una nota SOAP EN BORRADOR para la consulta ${String(args.consultation_id ?? "—")} ` +
        `(el médico la revisa y finaliza; no se autofirma).`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-notes`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    // EPIC DOCS fase 2: constancia/justificante de asistencia EN BORRADOR. El servidor toma de
    // la consulta la identidad del paciente, la fecha de asistencia y el médico + cédula
    // (snapshot); no se inventan hechos de asistencia. Nace en draft (nunca autofirmada).
    //
    // COMPOSICIÓN: identifica la consulta del paciente; si procede, indica el motivo/diagnóstico
    // a declarar. NO envíes paciente, fecha ni médico: el servidor los toma de la consulta.
    name: "clinical.create_medical_certificate_draft",
    description:
      "Genera una CONSTANCIA/justificante médico de asistencia EN BORRADOR a partir de una " +
      "consulta. Acción de escritura: requiere confirmación explícita del médico antes de " +
      "guardarse y queda en BORRADOR (nunca autofirmada). El servidor toma de la consulta el " +
      "paciente, la fecha de asistencia y el médico + cédula; no inventa hechos de asistencia. " +
      "Sólo se envía la consulta y, si aplica, el motivo a declarar.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta a la que asistió el paciente.",
          format: "uuid",
        },
        motivo: { type: "string", description: "Motivo/diagnóstico a declarar (opcional)." },
      },
      required: ["consultation_id"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_medical_certificate_draft",
      targetResource: "clinical_notes",
      summarize: (args) =>
        `Generar una constancia médica EN BORRADOR para la consulta ${String(args.consultation_id ?? "—")} ` +
        `(el médico la revisa y firma; no se autofirma).`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-notes/medical-certificate`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    // EPIC DOCS fase 2: incapacidad/justificante de reposo EN BORRADOR. El número de DÍAS DE
    // REPOSO es una decisión médica EXPLÍCITA: es obligatorio y debe ser ≥1; NUNCA lo inventes
    // ni asumas un valor por defecto — si el médico no lo indicó, PREGÚNTALO. El servidor toma
    // de la consulta el paciente y el médico + cédula. Nace en draft (nunca autofirmada).
    name: "clinical.create_sick_leave_draft",
    description:
      "Genera una INCAPACIDAD/justificante de reposo laboral EN BORRADOR a partir de una " +
      "consulta. Acción de escritura: requiere confirmación explícita del médico y queda en " +
      "BORRADOR (nunca autofirmada). Debes indicar el diagnóstico/motivo, la fecha de inicio y " +
      "el NÚMERO DE DÍAS de reposo (rest_days, ≥1): es una decisión médica; NUNCA la inventes ni " +
      "uses un valor por defecto — si no la tienes, pregúntala al médico. El servidor toma de la " +
      "consulta el paciente y el médico + cédula.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta de la que deriva la incapacidad.",
          format: "uuid",
        },
        diagnosis: { type: "string", description: "Diagnóstico o motivo del reposo." },
        rest_start_date: {
          type: "string",
          description: "Fecha de inicio del reposo (ISO 8601, YYYY-MM-DD).",
        },
        rest_days: {
          type: "integer",
          description: "Número de días de reposo (decisión médica explícita; ≥1, nunca inventado).",
          minimum: 1,
        },
      },
      required: ["consultation_id", "diagnosis", "rest_start_date", "rest_days"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_sick_leave_draft",
      targetResource: "clinical_notes",
      summarize: (args) =>
        `Generar una incapacidad EN BORRADOR (${String(args.rest_days ?? "—")} día[s] de reposo) ` +
        `para la consulta ${String(args.consultation_id ?? "—")} (el médico la revisa y firma).`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-notes/sick-leave`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    // EPIC DOCS fase 3: referencia/contrarreferencia EN BORRADOR. Un solo tool con discriminador
    // kind ("referencia" = envío a otra unidad/especialidad; "contrarreferencia" = respuesta de
    // vuelta a quien refirió). El servidor toma de la consulta el paciente y el médico + cédula.
    //
    // - referencia: el DESTINO (institución/servicio/especialidad) es una decisión médica
    //   EXPLÍCITA; NUNCA lo inventes — si no lo tienes, PREGÚNTALO al médico. reason y
    //   clinical_summary son opcionales (compuestos de la consulta).
    // - contrarreferencia: requiere al menos hallazgos (findings) o recomendaciones
    //   (recommendations); no los inventes — si no los tienes, pregúntalos.
    // Nace en draft (nunca autofirmada).
    name: "clinical.create_referral_draft",
    description:
      "Genera una REFERENCIA (envío a otra unidad/especialidad) o CONTRARREFERENCIA (respuesta de " +
      "vuelta) EN BORRADOR a partir de una consulta. Acción de escritura: requiere confirmación " +
      "explícita del médico y queda en BORRADOR (nunca autofirmada). Indica kind ('referencia' o " +
      "'contrarreferencia'). En 'referencia' el DESTINO es obligatorio (institución/servicio/" +
      "especialidad): es decisión médica, NUNCA lo inventes — si no lo tienes, pregúntalo. En " +
      "'contrarreferencia' indica al menos hallazgos o recomendaciones. El servidor toma de la " +
      "consulta el paciente y el médico + cédula.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta de la que se compone la carta.",
          format: "uuid",
        },
        kind: {
          type: "string",
          description: "Tipo de carta: referencia (envío) o contrarreferencia (respuesta de vuelta).",
          enum: ["referencia", "contrarreferencia"],
        },
        destination: {
          type: "string",
          description:
            "Institución/servicio/especialidad destino (OBLIGATORIO en referencia; decisión " +
            "médica, nunca inventado).",
        },
        reason: { type: "string", description: "Motivo de la referencia (opcional)." },
        clinical_summary: {
          type: "string",
          description: "Resumen clínico para la referencia (opcional; compuesto de la consulta).",
        },
        findings: {
          type: "string",
          description: "En contrarreferencia: hallazgos / lo realizado por el especialista.",
        },
        recommendations: {
          type: "string",
          description: "En contrarreferencia: recomendaciones/plan para el médico de origen.",
        },
      },
      required: ["consultation_id", "kind"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_referral_draft",
      targetResource: "clinical_notes",
      summarize: (args) =>
        args.kind === "contrarreferencia"
          ? `Generar una contrarreferencia EN BORRADOR para la consulta ${String(args.consultation_id ?? "—")} ` +
            `(el médico la revisa y firma).`
          : `Generar una referencia EN BORRADOR a ${String(args.destination ?? "—")} para la consulta ` +
            `${String(args.consultation_id ?? "—")} (el médico la revisa y firma).`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-notes/referral`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
  },
  {
    name: "clinical.create_study_order_draft",
    description:
      "Crea una orden de estudio/laboratorio EN BORRADOR para un paciente. Acción de escritura: " +
      "requiere confirmación explícita del médico antes de guardarse. El médico revisa y aprueba " +
      "la orden exacta; nada se guarda de forma autónoma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id (UUID) del paciente.", format: "uuid" },
        ordered_by: { type: "string", description: "Id (UUID) del médico que ordena.", format: "uuid" },
        study_name: { type: "string", description: "Nombre del estudio solicitado." },
        code: { type: "string", description: "Código del estudio (LOINC), opcional." },
        reason: { type: "string", description: "Motivo clínico (opcional)." },
        ordered_at: {
          type: "string",
          description: "Fecha y hora ISO 8601 de la orden (opcional; por defecto, ahora).",
        },
        status: {
          type: "string",
          description: "Estado de la orden (opcional).",
          enum: ["pending", "in_progress", "resulted", "cancelled"],
        },
      },
      required: ["patient_id", "ordered_by", "study_name"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_study_order_draft",
      targetResource: "study_orders",
      summarize: (args) =>
        `Crear una orden de estudio EN BORRADOR para el paciente ${String(args.patient_id ?? "—")}: ` +
        `${String(args.study_name ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/study-orders`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    name: "clinical.create_task_draft",
    description:
      "Crea una tarea clínica de seguimiento EN BORRADOR. Acción de escritura: requiere " +
      "confirmación explícita del médico antes de guardarse. Por defecto, el responsable es el " +
      "propio médico; puede referir a un paciente. Nada se guarda de forma autónoma.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título de la tarea." },
        description: { type: "string", description: "Detalle de la tarea (opcional)." },
        patient_id: {
          type: "string",
          description: "Id (UUID) del paciente relacionado (opcional).",
          format: "uuid",
        },
        due_at: {
          type: "string",
          description: "Fecha y hora ISO 8601 de vencimiento (opcional).",
        },
        priority: {
          type: "string",
          description: "Prioridad (opcional).",
          enum: ["low", "medium", "high"],
        },
        status: {
          type: "string",
          description: "Estado (opcional).",
          enum: ["open", "done", "cancelled"],
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    approval: {
      actionType: "create_task_draft",
      targetResource: "clinical_tasks",
      summarize: (args) =>
        `Crear una tarea clínica EN BORRADOR: "${String(args.title ?? "—")}"` +
        `${args.patient_id ? ` (paciente ${String(args.patient_id)})` : ""}` +
        `${args.due_at ? `, vence ${String(args.due_at)}` : ""}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/clinical-tasks`, { method: "POST", body: args as Record<string, unknown> }),
  },
  {
    // REMEMBER (P2): el agente PROPONE persistir una memoria del médico. Es una escritura
    // OWNER-SCOPED (sobre las propias memorias del médico, no un recurso clínico RBAC), así
    // que no se gatea por rol, pero SÍ pasa por el protocolo de aprobación (P1): nada se
    // guarda sin que el médico confirme exactamente lo que se recordará. Se ejecuta contra el
    // endpoint owner-only con la cookie del médico; el contenido se cifra en el backend.
    name: "memory.remember",
    description:
      "Propone GUARDAR una memoria del médico (nota, preferencia, hecho clínico o " +
      "recordatorio) para tenerla en cuenta en futuras conversaciones. Acción de escritura: " +
      "requiere confirmación explícita del médico antes de guardarse. No guarda nada de forma " +
      "autónoma; el médico revisa y aprueba qué se recuerda.",
    kind: "write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título breve de la memoria." },
        content: { type: "string", description: "Contenido a recordar (puede ser clínico)." },
        kind: {
          type: "string",
          description: "Tipo de memoria.",
          enum: ["nota", "preferencia", "hecho_clinico", "recordatorio"],
        },
        patient_id: {
          type: "string",
          description: "Id (UUID) del paciente relacionado (opcional).",
          format: "uuid",
        },
        consultation_id: {
          type: "string",
          description: "Id (UUID) de la consulta relacionada (opcional).",
          format: "uuid",
        },
      },
      required: ["title", "content"],
      additionalProperties: false,
    },
    approval: {
      actionType: "remember_memory",
      targetResource: "agent_memories",
      ownerScoped: true,
      summarize: (args) =>
        `Guardar una memoria del médico (${String(args.kind ?? "nota")}) "` +
        `${String(args.title ?? "—")}": ${String(args.content ?? "—")}.`,
    },
    execute: (args, ctx) =>
      ctx.api(`/api/v1/users/me/agent-memories`, {
        method: "POST",
        body: args as Record<string, unknown>,
      }),
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
      "Genera un formulario para que el médico lo complete y revise. Recibe una spec declarativa " +
      "(fields con name/label/type[text|number|textarea|select]/options, y 'value' OPCIONAL para " +
      "PRELLENAR el campo) y un submit_prompt. SIEMPRE que el médico pida crear o editar algo, " +
      "muestra este formulario PRELLENANDO con 'value' todos los datos que ya te dio (p. ej. el " +
      "nombre del paciente); NO pidas los datos por texto. Deja vacíos los que falten. Al enviarlo " +
      "se continúa la conversación con los valores; no escribe nada por sí mismo.",
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
              value: { type: "string", description: "Valor inicial para PRELLENAR el campo (datos ya proporcionados)." },
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
    name: "ui.open_resource_form",
    description:
      "Abre en el chat el FORMULARIO OFICIAL de un recurso del contrato (pacientes, consultas, " +
      "citas, recetas, etc.) para CREAR o EDITAR. PREFIERE esta herramienta sobre ui.render_form " +
      "siempre que el recurso exista en el catálogo: el formulario, sus campos y validaciones salen " +
      "del contrato, y las RELACIONES (paciente, médico, etc.) aparecen como BUSCADORES por nombre " +
      "— NUNCA pidas ni muestres UUIDs. Recibe { resource (nombre del recurso, p. ej. 'patients' o " +
      "'consultations'), mode ('create'|'update'), resource_id (REQUERIDO en 'update'), values? " +
      "(prellenado: pares campo→valor con lo que ya te dieron, p. ej. {\"full_name\":\"Jordan ...\"}; " +
      "deja fuera lo que falte). title? }. No teclees relaciones por id: pon en 'values' sólo datos " +
      "que tengas; el médico elegirá las relaciones en el buscador. El nombre del formulario lo pone " +
      "la plataforma a partir del recurso (no lo escribas tú). El médico completa el formulario y, al " +
      "pulsar Guardar, el registro se GUARDA directamente (ése es su acto de revisión): no hay un paso " +
      "de revisión posterior, no invoques otra herramienta de escritura ni pidas confirmación por texto.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        resource: { type: "string", description: "Nombre del recurso del contrato (p. ej. 'patients', 'consultations')." },
        mode: { type: "string", enum: ["create", "update"] },
        resource_id: { type: "string", description: "Id del registro a editar (REQUERIDO en mode 'update')." },
        values: {
          type: "object",
          description: "Prellenado: pares campo→valor con los datos ya proporcionados. Omite los que falten.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["resource", "mode"],
    },
    execute: async (args) => {
      const parsed = parseResourceFormSpec(args);
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
    // RESPUESTAS SUGERIDAS (quick replies): chips bajo el mensaje del agente con las posibles
    // siguientes respuestas del médico. Al hacer clic, el texto se envía como mensaje del médico
    // (turno normal) y los chips se contraen; también caducan si el médico escribe otra cosa.
    // Sólo texto plano: no despachan tools ni escriben nada.
    name: "ui.suggest_replies",
    description:
      "Sugiere las SIGUIENTES respuestas del médico como chips bajo tu mensaje. Recibe { title?, " +
      "replies: [texto, ...] } (2 a 6 respuestas CORTAS, máx. 140 caracteres, en primera persona " +
      "del médico, p. ej. 'Busca al paciente Juan Pérez' o 'Muéstrame la agenda de hoy'). Al hacer " +
      "clic, esa respuesta se envía automáticamente como mensaje del médico y los chips desaparecen. " +
      "Úsala al FINAL de tu turno cuando haya caminos claros de continuación (saludo inicial, " +
      "resultado con varios pasos posibles, pregunta con opciones); no la uses si la continuación es " +
      "libre. Es texto plano: para acciones ejecutables usa ui.render_buttons. Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        replies: {
          type: "array",
          items: { type: "string" },
          description: "Respuestas sugeridas (2 a 6, cortas, redactadas como las diría el médico).",
        },
      },
      required: ["replies"],
    },
    execute: async (args) => {
      const parsed = parseSuggestedRepliesSpec(args);
      if (!parsed.ok) {
        throw new ToolExecutionError("invalid_ui_spec", parsed.error);
      }
      return parsed.spec;
    },
  },
  {
    // BOTONES ACCIONABLES GOBERNADOS (MP-CTRL-0130). Cada botón se RESUELVE contra el catálogo de
    // tools + RBAC: una acción de mensaje o una tool de lectura es de sólo lectura; una tool de
    // escritura permitida es ACCIONABLE y al hacer clic la ejecuta el modelo pasando por la
    // aprobación P1 (no es un despacho directo ni una llamada arbitraria); una tool desconocida o una
    // escritura sin permiso quedan BLOQUEADAS con motivo. Los argumentos fuera del esquema de la tool
    // se descartan (no se inventan). Solo lectura: no ejecuta ni guarda nada, sólo arma el panel.
    name: "ui.render_buttons",
    description:
      "Genera botones para el chat. Recibe { title?, buttons: [{label, action}] } donde action es " +
      "{ type:'message', prompt }, { type:'tool', tool, args? } o { type:'link', url }. La plataforma " +
      "RESUELVE cada botón contra el catálogo de herramientas + permisos: un mensaje o una herramienta " +
      "de lectura es de sólo lectura; una herramienta de ESCRITURA permitida es accionable y al hacer " +
      "clic se ejecuta pasando por tu aprobación (P1); una herramienta desconocida o una escritura sin " +
      "permiso queda bloqueada con motivo. Los argumentos fuera del esquema se descartan (no se " +
      "inventan). type:'link' abre un enlace de CONTACTO en otra pestaña (sólo WhatsApp wa.me/" +
      "api.whatsapp.com, tel:, mailto:, sms:; cualquier otra URL se descarta). Para ENVIAR un mensaje " +
      "por WhatsApp usa un botón link con url 'https://wa.me/<telefono_internacional_sin_+>?text=<texto " +
      "URL-encoded>'; toma el teléfono COMPLETO del expediente del paciente (la búsqueda lo entrega " +
      "ENMASCARADO, no sirve para el enlace). No se ejecuta ni guarda nada por sí mismo. Solo lectura.",
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
            properties: {
              label: { type: "string" },
              action: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["message", "tool", "link"] },
                  prompt: { type: "string", description: "Para type='message': texto a continuar." },
                  tool: { type: "string", description: "Para type='tool': nombre de la herramienta." },
                  args: {
                    type: "object",
                    description: "Argumentos de la herramienta (se validan contra su esquema).",
                    additionalProperties: true,
                  },
                  url: {
                    type: "string",
                    description: "Para type='link': URL de contacto (wa.me/api.whatsapp.com, tel:, mailto:, sms:).",
                  },
                },
                required: ["type"],
              },
            },
            required: ["label", "action"],
          },
        },
      },
      required: ["buttons"],
    },
    execute: async (args, ctx) => {
      // Catálogo de recursos proyectado por permiso (RBAC) — misma señal que 0120/0129 — + el
      // catálogo de tools estático para resolver y sanear cada botón. buildButtonsModel valida la
      // estructura, resuelve contra el catálogo + RBAC y clasifica (read_only/actionable/blocked).
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const reviewCtx: ButtonReviewContext = {
        tools: buttonToolCatalog(),
        creatable: reviewContextFromCatalog(catalog).creatable,
      };
      const model = buildButtonsModel(args as unknown as ButtonsInput, reviewCtx);
      if (!model.ok) {
        throw new ToolExecutionError("invalid_ui_spec", model.error);
      }
      return model.spec;
    },
  },
  {
    name: "ui.render_dynamic_form",
    description:
      "Compone una UI a la medida SOLO para casos especiales que NINGUNA plantilla registrada " +
      "cubre. Recibe { title?, description?, widgets: [...] } con widgets de una LISTA BLANCA: " +
      "heading, info_card, section (contenedor), text, textarea, number, date, checkbox, select, " +
      "multiselect, radio, decision_list. Cada widget admite solo props fijas (name, label, " +
      "options, items, required, min, max, placeholder, help, text, title, tone, children); se " +
      "rechaza cualquier prop, HTML, script o URL. Hay límites de cantidad/anidación/opciones. " +
      "Al enviarlo se continúa la conversación con los valores; no escribe ni guarda nada por sí " +
      "mismo (las acciones clínicas siguen requiriendo aprobación). Prefiere SIEMPRE una plantilla " +
      "registrada (open_template) cuando exista; usa esto solo para lo no cubierto.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        submit_label: { type: "string" },
        submit_prompt: { type: "string" },
        widgets: {
          type: "array",
          description:
            "Lista de widgets de la lista blanca. 'section' puede anidar 'children'; los widgets de " +
            "selección requieren 'options: [{value, label?}]'; 'decision_list' requiere " +
            "'items: [{value, text}]'.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "heading",
                  "info_card",
                  "section",
                  "text",
                  "textarea",
                  "number",
                  "date",
                  "checkbox",
                  "select",
                  "multiselect",
                  "radio",
                  "decision_list",
                ],
              },
              name: { type: "string" },
              label: { type: "string" },
              text: { type: "string" },
              title: { type: "string" },
              tone: { type: "string", enum: ["info", "warn", "muted"] },
              placeholder: { type: "string" },
              help: { type: "string" },
              required: { type: "boolean" },
              min: { type: "number" },
              max: { type: "number" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: { value: { type: "string" }, label: { type: "string" } },
                  required: ["value"],
                },
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: { value: { type: "string" }, text: { type: "string" } },
                  required: ["value", "text"],
                },
              },
              children: { type: "array", items: { type: "object" } },
            },
            required: ["type"],
          },
        },
      },
      required: ["widgets"],
    },
    execute: async (args) => {
      const parsed = validateDynamicForm(args);
      if (!parsed.ok) {
        throw new ToolExecutionError("invalid_ui_spec", parsed.error);
      }
      return parsed.spec;
    },
  },
  {
    // CIERRE CONSCIENTE POST-TRANSCRIPCIÓN (MP-CTRL-0120): tras procesar una consulta, el agente
    // emite el CONJUNTO de acciones que detectó (altas/diagnósticos/recetas/tareas/plantillas) y
    // esta tool renderiza un PANEL para que el médico las revise TODAS juntas (aceptar/editar/
    // rechazar) y vea el resumen de cierre (borrador/pendiente/descartado/bloqueado) + el diff
    // contra el expediente ANTES de escribir nada. Es ORQUESTACIÓN read-only sobre el camino P1:
    // valida cada acción contra el catálogo + RBAC (las desconocidas/sin permiso quedan BLOQUEADAS
    // con motivo, no se descartan en silencio) y NO guarda nada. Al confirmar, el agente procede
    // acción por acción con la tool de escritura de cada una (cada guardado pasa por la aprobación
    // P1; nunca una escritura en lote). La extracción que produce las acciones es del agente.
    name: "ui.review_detected_actions",
    description:
      "Renderiza el PANEL de cierre post-consulta para revisar juntas las acciones detectadas " +
      "(borradores propuestos). Indica actions: lista de { id, type (create_consultation|" +
      "create_diagnosis|create_prescription|open_template:<id>|create_task|...), target_resource, " +
      "template_id?, proposed_values, edited_values?, current_values?, source_fragment, status " +
      "(pending|accepted|edited|rejected) }, y opcional patient_id/consultation_id. La plataforma " +
      "valida cada acción contra el catálogo + permisos (las no permitidas/desconocidas quedan " +
      "bloqueadas con motivo, no se inventan), calcula el diff contra el expediente y arma el " +
      "resumen de cierre. NO guarda nada: el médico revisa y al confirmar tú procedes acción por " +
      "acción con la tool de escritura de cada una (cada guardado requiere aprobación P1). Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del panel (opcional)." },
        patient_id: { type: "string", description: "Paciente del cierre (opcional, para el diff)." },
        consultation_id: { type: "string", description: "Consulta del cierre (opcional)." },
        confirm_label: { type: "string", description: "Etiqueta del botón de confirmación." },
        confirm_prompt: { type: "string", description: "Encabezado del mensaje de cierre." },
        actions: {
          type: "array",
          description: "Acciones detectadas a revisar.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Id estable de la acción." },
              type: {
                type: "string",
                description: "Tipo de acción (create_*, open_template:<id>, ...).",
              },
              label: { type: "string", description: "Etiqueta legible de la acción." },
              target_resource: { type: "string", description: "Recurso destino." },
              template_id: { type: "string", description: "Id de plantilla (si aplica)." },
              proposed_values: {
                type: "object",
                description: "Valores propuestos por campo.",
                additionalProperties: true,
              },
              edited_values: {
                type: "object",
                description: "Valores editados por el médico (si status = edited).",
                additionalProperties: true,
              },
              current_values: {
                type: "object",
                description: "Estado actual del expediente para el diff (vacío en altas).",
                additionalProperties: true,
              },
              source_fragment: { type: "string", description: "Fragmento de origen." },
              status: {
                type: "string",
                description: "Estado propuesto.",
                enum: ["pending", "accepted", "edited", "rejected"],
              },
              category: {
                type: "string",
                description: "Categoría (si se omite, se infiere).",
                enum: ["clinical", "administrative"],
              },
            },
            required: ["id", "type", "target_resource"],
            additionalProperties: false,
          },
        },
      },
      required: ["actions"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const result = buildCloseOutPlan(args as unknown as DetectedActionsInput, reviewContextFromCatalog(catalog));
      if (!result.ok) {
        throw new ToolExecutionError("invalid_detected_actions", result.error);
      }
      const spec: DetectedActionsSpec = {
        kind: "detected_actions",
        plan: result.plan,
        confirm_label:
          typeof args.confirm_label === "string" ? args.confirm_label : "Confirmar cierre",
        confirm_prompt:
          typeof args.confirm_prompt === "string"
            ? args.confirm_prompt
            : "Cierre de la consulta revisado:",
      };
      if (typeof args.title === "string") spec.title = args.title;
      return spec;
    },
  },
  {
    // COMPARACIÓN DEDICADA ANTES/DESPUÉS para una ACTUALIZACIÓN (MP-CTRL-0137): cuando el médico quiere
    // cambiar un dato YA guardado (ajustar la dosis de una receta vigente, corregir la fecha de
    // nacimiento, conciliar una medicación), el agente lee el estado actual del registro y PROPONE los
    // nuevos valores; esta tool arma una vista campo-a-campo (actual → propuesto) para revisar ANTES de
    // escribir. READ-ONLY: valida contra el catálogo + permiso de EDICIÓN (forms.update; recurso
    // desconocido o sin permiso = BLOQUEADA con motivo, no se inventa), descarta campos fuera del esquema
    // de edición y calcula el diff contra el estado actual. NO guarda nada: al confirmar, el agente aplica
    // la edición con la tool de actualización del recurso (cada guardado pasa por la aprobación P1). A
    // diferencia de review_detected_actions (orientada a ALTAS, gateada por creatable), ésta es para EDITAR
    // un registro existente. Útil para conciliación de medicación y correcciones del expediente.
    name: "ui.review_record_update",
    description:
      "Renderiza una COMPARACIÓN antes/después para ACTUALIZAR un registro existente (p. ej. ajustar la " +
      "dosis de una receta vigente o corregir un dato del paciente). Indica target_resource, resource_id " +
      "(id del registro), current_values (estado actual que leíste del expediente) y proposed_values (los " +
      "valores nuevos). La plataforma valida el permiso de EDICIÓN (recurso desconocido o sin permiso = " +
      "bloqueada con motivo, no se inventa), descarta campos fuera del esquema de edición y calcula el diff " +
      "campo a campo. NO guarda nada: el médico revisa y al confirmar tú aplicas la edición con la tool de " +
      "actualización de ese recurso (requiere aprobación P1). Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del panel (opcional)." },
        target_resource: { type: "string", description: "Recurso del registro a actualizar." },
        resource_id: { type: "string", description: "Id del registro existente a actualizar." },
        label: { type: "string", description: "Etiqueta legible de la actualización (opcional)." },
        current_values: {
          type: "object",
          description: "Estado actual del registro (lo lees del expediente) para el 'antes' del diff.",
          additionalProperties: true,
        },
        proposed_values: {
          type: "object",
          description: "Valores nuevos propuestos por campo.",
          additionalProperties: true,
        },
        source_fragment: { type: "string", description: "Fragmento de origen (opcional)." },
        confirm_label: { type: "string", description: "Etiqueta del botón de confirmación." },
        confirm_prompt: { type: "string", description: "Encabezado del mensaje de confirmación." },
      },
      required: ["target_resource", "resource_id", "proposed_values"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const options: RecordUpdateOptions = {};
      if (typeof args.title === "string") options.title = args.title;
      if (typeof args.confirm_label === "string") options.confirm_label = args.confirm_label;
      if (typeof args.confirm_prompt === "string") options.confirm_prompt = args.confirm_prompt;
      const result = buildRecordUpdate(
        args as unknown as RecordUpdateInput,
        reviewContextFromCatalog(catalog),
        options,
      );
      if (!result.ok) {
        throw new ToolExecutionError("invalid_record_update", result.error);
      }
      return result.spec;
    },
  },
  {
    // ACCIÓN GOBERNADA "ABRIR EXPEDIENTE" (MP-CTRL-0138): tras buscar/identificar a un paciente, el médico
    // pide "abre su expediente". En vez de navegar a ciegas, el agente emite esta acción y la plataforma
    // valida que el médico PUEDE ver pacientes (el recurso aparece en el catálogo proyectado por permiso;
    // si no, BLOQUEADA con motivo) y devuelve una tarjeta con un botón. Abrir el expediente NO es una
    // escritura clínica: sólo cambia el contexto activo del shell (que monta el panel del paciente). El
    // médico hace el clic; nada se navega automáticamente desde la salida del modelo. Solo lectura.
    name: "ui.open_record",
    description:
      "Renderiza una tarjeta para ABRIR el expediente de un paciente ya identificado (p. ej. tras " +
      "clinical.search_patients). Indica patient_id (requerido), patient_label (nombre legible) y, " +
      "opcionalmente, consultation_id/consultation_label y label. La plataforma valida que el médico " +
      "puede ver pacientes (si no, bloqueada con motivo). NO navega ni guarda nada: muestra un botón y " +
      "el médico decide abrir el expediente (cambia el contexto activo, no es una escritura). Úsala " +
      "cuando el médico pida abrir/ver el expediente de un paciente. Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Id del paciente cuyo expediente abrir." },
        patient_label: { type: "string", description: "Nombre legible del paciente (para la tarjeta)." },
        consultation_id: { type: "string", description: "Consulta a enfocar (opcional)." },
        consultation_label: { type: "string", description: "Etiqueta de la consulta (opcional)." },
        label: { type: "string", description: "Etiqueta del botón (opcional)." },
      },
      required: ["patient_id"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const result = buildOpenRecord(args as unknown as OpenRecordInput, reviewContextFromCatalog(catalog));
      if (!result.ok) {
        throw new ToolExecutionError("invalid_open_record", result.error);
      }
      return result.spec;
    },
  },
  {
    // ASISTENTE MULTI-PASO GUIADO (MP-CTRL-0139, épica conversación→expediente, casos 121, 182-186): para
    // flujos guiados ("guíame paso a paso para registrar al paciente, su historia y abrir la consulta",
    // "asistente de primera consulta pediátrica"), el agente propone una SECUENCIA ORDENADA de pasos —cada
    // uno crea un recurso o abre una plantilla— con DEPENDENCIAS entre entidades. Esta tool valida cada
    // paso contra el catálogo + RBAC (desconocido/sin permiso = bloqueado con motivo), descarta campos
    // fuera del esquema, marca los requeridos que faltan y resuelve el PASO ACTUAL (el primero pendiente
    // con sus dependencias hechas). NO guarda nada: el agente avanza UN paso a la vez con la tool de
    // escritura del paso (cada guardado pasa por la aprobación P1, nunca en lote). Solo lectura.
    name: "ui.review_wizard",
    description:
      "Renderiza un ASISTENTE PASO A PASO para un flujo guiado de varias entidades (p. ej. registrar " +
      "paciente → historia clínica → abrir consulta). Indica steps: lista ORDENADA de { id, title, type " +
      "(create_patient|create_consultation|open_template:<id>|...), target_resource, template_id?, " +
      "proposed_values?, status? (pending|done; marca 'done' lo ya hecho), depends_on? (ids de pasos " +
      "previos requeridos), source_fragment? }, y opcional patient_id/consultation_id. La plataforma " +
      "valida cada paso contra el catálogo + permisos (sin permiso/recurso desconocido = bloqueado con " +
      "motivo), descarta campos fuera del esquema, marca los requeridos que falten, respeta las " +
      "dependencias y resuelve cuál es el PASO ACTUAL. NO guarda nada: el médico revisa el plan y tú " +
      "avanzas UN paso a la vez con la tool de escritura de ese paso (cada uno requiere aprobación P1, " +
      "nunca en lote ni salteando el orden). Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del asistente (opcional)." },
        patient_id: { type: "string", description: "Paciente del flujo (opcional)." },
        consultation_id: { type: "string", description: "Consulta del flujo (opcional)." },
        confirm_label: { type: "string", description: "Etiqueta del botón de avance." },
        confirm_prompt: { type: "string", description: "Encabezado del mensaje de avance." },
        steps: {
          type: "array",
          description: "Pasos ordenados del asistente.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Id estable del paso." },
              title: { type: "string", description: "Título legible del paso." },
              type: {
                type: "string",
                description: "Tipo de acción (create_*, open_template:<id>, ...).",
              },
              target_resource: { type: "string", description: "Recurso destino del paso." },
              template_id: { type: "string", description: "Id de plantilla (si aplica)." },
              proposed_values: {
                type: "object",
                description: "Valores propuestos por campo.",
                additionalProperties: true,
              },
              status: {
                type: "string",
                description: "Estado propuesto (pending por defecto; done si ya se completó).",
                enum: ["pending", "done"],
              },
              depends_on: {
                type: "array",
                description: "Ids de pasos previos que deben completarse antes.",
                items: { type: "string" },
              },
              source_fragment: { type: "string", description: "Fragmento de origen." },
            },
            required: ["id", "target_resource"],
            additionalProperties: false,
          },
        },
      },
      required: ["steps"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const result = buildWizardPlan(args as unknown as WizardInput, reviewContextFromCatalog(catalog));
      if (!result.ok) {
        throw new ToolExecutionError("invalid_wizard", result.error);
      }
      const spec: WizardSpec = {
        kind: "wizard",
        plan: result.plan,
        confirm_label:
          typeof args.confirm_label === "string" ? args.confirm_label : "Continuar con el paso actual",
        confirm_prompt:
          typeof args.confirm_prompt === "string" ? args.confirm_prompt : "Asistente guiado:",
      };
      if (typeof args.title === "string") spec.title = args.title;
      return spec;
    },
  },
  {
    // PLAN DE TAREAS revisable (MP-CTRL-0129, épica conversación→expediente): cuando el agente
    // detecta pendientes de seguimiento de una conversación/transcripción (agendar control, pedir
    // laboratorios, llamar al paciente), emite el CONJUNTO de tareas propuestas y esta tool renderiza
    // un PANEL para que el médico las revise EN GRUPO (aceptar/posponer/rechazar) ANTES de crear
    // nada. Es ORQUESTACIÓN read-only sobre el camino de creación P1 (clinical.create_task_draft):
    // reparte por confianza (>=0.8 lista / >=0.5 sugerida / <0.5 descartada), valida contra el
    // catálogo + RBAC (sin permiso/recurso desconocido = BLOQUEADA con motivo), descarta campos fuera
    // del esquema (no inventa) y marca los requeridos que faltan. NO guarda nada: al confirmar, el
    // agente crea las aceptadas TAREA POR TAREA con clinical.create_task_draft (cada una P1, nunca en
    // lote). La extracción que produce las tareas es del agente.
    name: "ui.review_task_plan",
    description:
      "Renderiza el PANEL de PLAN DE TAREAS para revisar juntas las tareas de seguimiento que " +
      "detectaste (p. ej. 'agendar control en 2 semanas', 'solicitar laboratorios', 'llamar al " +
      "paciente'). Indica tasks: lista de { id, label?, confidence (0-1), target_resource? (por " +
      "defecto clinical_tasks), proposed_values (title/description/due_at/priority/patient_id/" +
      "status), source_fragment? }, y opcional patient_id/consultation_id. La plataforma reparte por " +
      "confianza (>=0.8 lista, >=0.5 sugerida, <0.5 descartada), valida contra el catálogo + permisos " +
      "(sin permiso o recurso desconocido = bloqueada con motivo, no se inventa), descarta campos " +
      "fuera del esquema y marca los requeridos que falten. NO guarda nada: el médico revisa y al " +
      "confirmar tú creas las aceptadas UNA POR UNA con clinical.create_task_draft (cada una requiere " +
      "aprobación P1, nunca en lote). Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del panel (opcional)." },
        patient_id: { type: "string", description: "Paciente del plan (opcional)." },
        consultation_id: { type: "string", description: "Consulta del plan (opcional)." },
        confirm_label: { type: "string", description: "Etiqueta del botón de confirmación." },
        confirm_prompt: { type: "string", description: "Encabezado del mensaje de confirmación." },
        tasks: {
          type: "array",
          description: "Tareas de seguimiento detectadas a revisar.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Id estable de la tarea." },
              label: { type: "string", description: "Etiqueta legible de la tarea." },
              confidence: {
                type: "number",
                description: "Confianza de la detección en [0,1].",
                minimum: 0,
                maximum: 1,
              },
              target_resource: {
                type: "string",
                description: "Recurso destino (por defecto clinical_tasks).",
              },
              proposed_values: {
                type: "object",
                description: "Valores propuestos por campo (title/description/due_at/priority/…).",
                additionalProperties: true,
              },
              source_fragment: { type: "string", description: "Fragmento de origen." },
            },
            required: ["id"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const result = buildTaskPlan(args as unknown as TaskPlanInput, reviewContextFromCatalog(catalog));
      if (!result.ok) {
        throw new ToolExecutionError("invalid_task_plan", result.error);
      }
      const spec: TaskPlanSpec = {
        kind: "task_plan",
        plan: result.plan,
        confirm_label:
          typeof args.confirm_label === "string" ? args.confirm_label : "Confirmar plan de tareas",
        confirm_prompt:
          typeof args.confirm_prompt === "string"
            ? args.confirm_prompt
            : "Plan de tareas de seguimiento revisado:",
      };
      if (typeof args.title === "string") spec.title = args.title;
      return spec;
    },
  },
  {
    // CHECKLIST DE CIERRE DE CONSULTA (MP-CTRL-0131): cierra el flujo post-consulta. Tras revisar las
    // acciones detectadas (0120) y los planes de tareas (0129) y guardarlas como borrador, el agente
    // emite los ítems de cierre que evaluó y esta tool renderiza la CHECKLIST + el RESUMEN consolidado
    // (guardado/pendiente/descartado). Es ORQUESTACIÓN read-only: valida cada ítem contra el contrato
    // (recurso desconocido/sin acceso = bloqueado con motivo), clasifica el estado de forma
    // determinista (sin asumir 'hecho') y calcula si la consulta está LISTA PARA CERRAR. NO cierra ni
    // firma nada: firmar la nota y cerrar la consulta siguen por el camino de aprobación P1. El médico
    // confirma; nada se cierra de forma autónoma.
    name: "ui.review_close_checklist",
    description:
      "Renderiza la CHECKLIST DE CIERRE de la consulta para revisarla antes de firmar la nota y " +
      "cerrar. Indica items: lista de { id, label, status? (done|pending|not_applicable), " +
      "requirement? (required|recommended|optional), detail?, source_fragment?, related_resource? }, " +
      "y opcional consultation_id/patient_id y actions_summary { saved, pending, discarded, blocked } " +
      "(conteos del cierre de acciones ya confirmado). La plataforma valida cada ítem contra el " +
      "contrato (un recurso desconocido o sin acceso queda bloqueado con motivo), clasifica el estado " +
      "sin asumir 'hecho' (ausencia = pendiente) y calcula si la consulta está lista para cerrar " +
      "(ningún requerido pendiente). NO cierra ni firma nada: el médico revisa y al confirmar firma la " +
      "nota y cierra la consulta por el camino de aprobación habitual (P1). Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del panel (opcional)." },
        consultation_id: { type: "string", description: "Consulta a cerrar (opcional)." },
        patient_id: { type: "string", description: "Paciente de la consulta (opcional)." },
        confirm_label: { type: "string", description: "Etiqueta del botón de confirmación." },
        confirm_prompt: { type: "string", description: "Encabezado del mensaje de cierre." },
        actions_summary: {
          type: "object",
          description: "Conteos del cierre de acciones ya confirmado (para el resumen consolidado).",
          properties: {
            saved: { type: "number" },
            pending: { type: "number" },
            discarded: { type: "number" },
            blocked: { type: "number" },
          },
          additionalProperties: false,
        },
        items: {
          type: "array",
          description: "Ítems de cierre a revisar.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Id estable del ítem." },
              label: { type: "string", description: "Texto del ítem de cierre." },
              status: {
                type: "string",
                description: "Estado propuesto.",
                enum: ["done", "pending", "not_applicable"],
              },
              requirement: {
                type: "string",
                description: "Nivel de exigencia.",
                enum: ["required", "recommended", "optional"],
              },
              detail: { type: "string", description: "Detalle/ayuda del ítem." },
              source_fragment: { type: "string", description: "Fragmento de origen." },
              related_resource: {
                type: "string",
                description: "Recurso relacionado (se valida contra el contrato).",
              },
            },
            required: ["id", "label"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const result = buildCloseChecklist(
        args as unknown as CloseChecklistInput,
        reviewContextFromCatalog(catalog),
      );
      if (!result.ok) {
        throw new ToolExecutionError("invalid_close_checklist", result.error);
      }
      const spec: CloseChecklistSpec = {
        kind: "close_checklist",
        checklist: result.checklist,
        confirm_label:
          typeof args.confirm_label === "string" ? args.confirm_label : "Confirmar revisión de cierre",
        confirm_prompt:
          typeof args.confirm_prompt === "string"
            ? args.confirm_prompt
            : "Checklist de cierre de la consulta revisada:",
      };
      if (typeof args.title === "string") spec.title = args.title;
      return spec;
    },
  },
  {
    // PROMOCIÓN DINÁMICA→PLANTILLA (MP-CTRL-0132, UI híbrida sección 13): evalúa una UI DINÁMICA
    // contra los criterios de promoción y, si califica, RECOMIENDA convertirla en plantilla
    // registrada con una forma sugerida (campos→tipos, cuáles regulados, nombre de recurso). SÓLO
    // PROPUESTA: NUNCA registra una ResourceDefinition ni muta el backend/registro — eso es un cambio
    // de código del desarrollador. La spec se valida primero con la MISMA lista blanca de la UI
    // dinámica (0117). El sistema NO persiste el reuso de las UIs dinámicas, así que la decisión se
    // basa en los criterios ESTRUCTURALES de la spec + señales que el caller aporte explícitamente
    // (la ausencia de una señal no cuenta). Solo lectura.
    name: "ui.propose_template_promotion",
    description:
      "Evalúa si una UI DINÁMICA debería convertirse en PLANTILLA REGISTRADA (criterios: campos " +
      "regulados, recetas/diagnósticos/órdenes/referencias, implicaciones legales, requiere " +
      "validaciones, debe persistir estructurado, y —si el caller lo aporta— reuso frecuente/" +
      "multiespecialidad/institucional). Indica spec: la especificación de la UI dinámica (misma " +
      "forma que ui.render_dynamic_form) y opcional signals { reuse_count, regulated, " +
      "multi_specialty, institutional, legal_implications, must_persist_structured }. Devuelve una " +
      "RECOMENDACIÓN legible con los criterios cumplidos y la forma sugerida del recurso. NO registra " +
      "ni cambia nada: registrar la plantilla es un cambio de código del desarrollador. Solo lectura.",
    kind: "read",
    inputSchema: PASSTHROUGH_SCHEMA,
    wireSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título del panel (opcional)." },
        spec: {
          type: "object",
          description: "Especificación de la UI dinámica a evaluar (como ui.render_dynamic_form).",
          additionalProperties: true,
        },
        signals: {
          type: "object",
          description: "Señales que el caller afirma explícitamente (su ausencia no cuenta).",
          properties: {
            reuse_count: { type: "number", description: "Veces que se ha usado esta UI (si se sabe)." },
            regulated: { type: "boolean" },
            multi_specialty: { type: "boolean" },
            institutional: { type: "boolean" },
            legal_implications: { type: "boolean" },
            must_persist_structured: { type: "boolean" },
          },
          additionalProperties: false,
        },
        follow_up_label: { type: "string", description: "Etiqueta del botón de seguimiento." },
        follow_up_prompt: { type: "string", description: "Encabezado del mensaje de seguimiento." },
      },
      required: ["spec"],
      additionalProperties: false,
    },
    execute: async (args, ctx) => {
      // 1) Validar la UI dinámica con la MISMA lista blanca (0117): así el contenido es seguro.
      const validated = validateDynamicForm(args.spec);
      if (!validated.ok) {
        throw new ToolExecutionError("invalid_ui_spec", validated.error);
      }
      // 2) Recursos ya registrados (para no proponer un nombre que colisione).
      const catalog = await ctx.api<readonly CatalogResourceLike[]>(`/api/v1/resources`);
      const knownResources = new Set(catalog.map((resource) => resource.name));
      const signals =
        args.signals && typeof args.signals === "object"
          ? (args.signals as PromotionSignals)
          : undefined;
      const result = buildPromotionProposal(validated.spec, { signals, knownResources });
      if (!result.ok) {
        throw new ToolExecutionError("invalid_template_promotion", result.error);
      }
      const spec: TemplatePromotionSpec = {
        kind: "template_promotion_proposal",
        proposal: result.proposal,
        follow_up_label:
          typeof args.follow_up_label === "string" ? args.follow_up_label : "Enviar recomendación",
        follow_up_prompt:
          typeof args.follow_up_prompt === "string"
            ? args.follow_up_prompt
            : "Recomendación de promoción a plantilla:",
      };
      if (typeof args.title === "string") spec.title = args.title;
      return spec;
    },
  },
];

const TOOLS_BY_NAME = new Map<string, ToolDefinition>(TOOLS.map((tool) => [tool.name, tool]));

// Catálogo de tools (estático) que necesita el gobierno de botones (MP-CTRL-0130): por cada tool, su
// tipo (read/write), el recurso destino + owner-scoped de la aprobación (para el RBAC de escritura) y
// el set de argumentos permitidos (propiedades del inputSchema; undefined si el esquema es permisivo,
// p. ej. PASSTHROUGH, donde no se puede validar campo a campo). El gobierno lo usa para resolver y
// sanear cada botón sin acoplar button-actions.ts al registro (evita ciclo de imports).
function buttonToolCatalog(): Map<string, ButtonToolEntry> {
  const map = new Map<string, ButtonToolEntry>();
  for (const tool of TOOLS) {
    const schema = tool.inputSchema;
    const props = Object.keys(schema.properties ?? {});
    // Esquema permisivo (additionalProperties true y sin propiedades declaradas) → no se valida.
    const schemaProps =
      schema.additionalProperties === true && props.length === 0 ? undefined : new Set(props);
    const entry: ButtonToolEntry = { name: tool.name, kind: tool.kind };
    if (tool.approval?.targetResource) entry.targetResource = tool.approval.targetResource;
    if (tool.approval?.ownerScoped) entry.ownerScoped = true;
    if (schemaProps) entry.schemaProps = schemaProps;
    map.set(tool.name, entry);
  }
  return map;
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...TOOLS];
}

// Definiciones para declarar al modelo en turn.start (name/description/input_schema).
// Recibe la lista EFECTIVA de tools (tras el gating por rol); por defecto, todas.
export function toWireToolDefinitions(tools: ToolDefinition[] = TOOLS): WireTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: (tool.wireSchema ?? tool.inputSchema) as unknown as Record<string, unknown>,
    strict: false,
  }));
}
