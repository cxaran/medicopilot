import test from "node:test";
import assert from "node:assert/strict";

import { deriveResourceTools } from "./contract-tools.ts";
import type { ResourceCatalog } from "@/core/api/contracts";
import type { ToolDefinition } from "./registry.ts";

// Tools derivadas del contrato (F6): el catálogo /resources se convierte en ToolDefinitions genéricas
// (crear/editar/listar/ver + acciones). El backend es la fuente de verdad; aquí se fija el mapeo
// determinista contrato→tool, la precedencia de las hand-written y los límites (multipart, array,
// campos no editables).

function field(
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name, label: name, type, required: false, editable: true, ...extra };
}

const CATALOG = [
  {
    name: "appointments",
    label: "Cita",
    api_path: "/api/v1/appointments",
    view: "table",
    item_reference: { field: "id", placeholder: "appointment_id" },
    detail: { method: "GET", url_template: "/api/v1/appointments/{appointment_id}" },
    list: {
      fields: [],
      // Contrato declarativo ÚNICO: los parámetros de las tools de listado se
      // derivan de filterable_fields (incluye eq con opciones y el rango
      // automático gte/lte de fechas, que el legacy jamás publicaba).
      filterable_fields: [
        {
          key: "status",
          label: "Estado",
          value_type: "enum",
          operators: [
            {
              key: "eq",
              label: "Igual a",
              value_shape: "single",
              widget: "select",
              parameter_name: "status",
              options: [{ value: "pending", label: "Pendiente" }],
            },
          ],
        },
        {
          key: "scheduled_date",
          label: "Fecha",
          value_type: "date",
          operators: [
            {
              key: "gte",
              label: "Desde",
              value_shape: "single",
              widget: "date",
              parameter_name: "scheduled_date_gte",
            },
            {
              key: "lte",
              label: "Hasta",
              value_shape: "single",
              widget: "date",
              parameter_name: "scheduled_date_lte",
            },
          ],
        },
      ],
    },
    forms: {
      create: {
        method: "POST",
        url_template: "/api/v1/appointments",
        transport: "json",
        fields: [
          field("reason", "string", { required: true }),
          field("scheduled_date", "date", { required: true }),
          field("tags", "array"),
          field("audit", "string", { editable: false }),
        ],
      },
      update: {
        method: "PATCH",
        url_template: "/api/v1/appointments/{appointment_id}",
        transport: "json",
        fields: [field("reason", "string")],
      },
    },
    actions: [
      {
        name: "confirm",
        label: "Confirmar",
        method: "POST",
        url_template: "/api/v1/appointments/{appointment_id}/confirm",
        scope: "item",
        danger: false,
        success_behavior: "refresh",
      },
    ],
    relations: [],
  },
  {
    name: "clinical_documents",
    label: "Documento",
    api_path: "/api/v1/clinical-documents",
    view: "table",
    forms: {
      create: {
        method: "POST",
        url_template: "/api/v1/clinical-documents",
        transport: "multipart",
        fields: [field("title", "string", { required: true })],
        file_field: {
          name: "file",
          label: "Archivo",
          accepted_mime_types: [],
          max_size_bytes: 1,
          required: true,
        },
      },
    },
    actions: [],
    relations: [],
  },
] as unknown as ResourceCatalog;

function byName(tools: ToolDefinition[], name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}

type ExecCtx = Parameters<ToolDefinition["execute"]>[1];
function fakeCtx(record: { path?: string; init?: unknown }): ExecCtx {
  return {
    api: async (path: string, init?: unknown) => {
      record.path = path;
      record.init = init;
      return { ok: true };
    },
  } as unknown as ExecCtx;
}

test("deriva create con schema del contrato (excluye no-editable; array sólo en wire)", () => {
  const tools = deriveResourceTools(CATALOG);
  const create = byName(tools, "resource.create_appointments");
  assert.ok(create, "debe existir resource.create_appointments");
  assert.equal(create!.kind, "write");
  assert.equal(create!.approval?.targetResource, "appointments");
  // inputSchema (validador local): reason/scheduled_date presentes, 'audit' (no editable) excluido,
  // 'tags' (array) no expresable -> additionalProperties true.
  const localProps = create!.inputSchema.properties;
  assert.ok(localProps.reason && localProps.scheduled_date);
  assert.ok(!localProps.audit, "campo no editable no se ofrece");
  assert.ok(!localProps.tags, "array no va en el schema local");
  assert.equal(create!.inputSchema.additionalProperties, true);
  assert.deepEqual([...(create!.inputSchema.required ?? [])].sort(), ["reason", "scheduled_date"]);
  // wireSchema (al modelo): tags sí aparece como array.
  const wireProps = (create!.wireSchema as { properties: Record<string, { type?: string }> }).properties;
  assert.equal(wireProps.tags?.type, "array");
});

test("create execute: POST con allowlist (descarta vacíos y campos fuera del contrato)", async () => {
  const tools = deriveResourceTools(CATALOG);
  const create = byName(tools, "resource.create_appointments")!;
  const rec: { path?: string; init?: unknown } = {};
  await create.execute({ reason: "Control", scheduled_date: "", hacker: "x" }, fakeCtx(rec));
  assert.equal(rec.path, "/api/v1/appointments");
  const init = rec.init as { method: string; body: Record<string, unknown> };
  assert.equal(init.method, "POST");
  assert.deepEqual(init.body, { reason: "Control" }); // vacío y campo ajeno descartados
});

test("update requiere id y rellena el placeholder de la URL", async () => {
  const tools = deriveResourceTools(CATALOG);
  const update = byName(tools, "resource.update_appointments")!;
  assert.equal(update.kind, "write");
  assert.deepEqual(update.inputSchema.required, ["id"]);
  const rec: { path?: string; init?: unknown } = {};
  await update.execute({ id: "abc", reason: "Nuevo motivo" }, fakeCtx(rec));
  assert.equal(rec.path, "/api/v1/appointments/abc");
  assert.deepEqual((rec.init as { body: unknown }).body, { reason: "Nuevo motivo" });
});

test("list deriva filtros del contrato; get usa el detalle por id", async () => {
  const tools = deriveResourceTools(CATALOG);
  const list = byName(tools, "resource.list_appointments")!;
  assert.equal(list.kind, "read");
  assert.ok((list.inputSchema.properties as Record<string, unknown>).status, "filtro status");
  // Los rangos automáticos del plan ahora llegan al copiloto (antes invisibles).
  assert.ok(
    (list.inputSchema.properties as Record<string, unknown>).scheduled_date_gte,
    "rango gte automático",
  );
  assert.ok(
    (list.inputSchema.properties as Record<string, unknown>).scheduled_date_lte,
    "rango lte automático",
  );
  const rec: { path?: string } = {};
  await list.execute({ status: "pending", limit: 10 }, fakeCtx(rec));
  assert.match(rec.path!, /\/api\/v1\/appointments\?/);
  assert.match(rec.path!, /status=pending/);

  const get = byName(tools, "resource.get_appointments")!;
  const rec2: { path?: string } = {};
  await get.execute({ id: "xyz" }, fakeCtx(rec2));
  assert.equal(rec2.path, "/api/v1/appointments/xyz");
});

test("acción de item: requiere id, es write y rellena el placeholder", async () => {
  const tools = deriveResourceTools(CATALOG);
  const confirm = byName(tools, "resource.action_appointments_confirm")!;
  assert.equal(confirm.kind, "write");
  assert.deepEqual(confirm.inputSchema.required, ["id"]);
  const rec: { path?: string } = {};
  await confirm.execute({ id: "a1" }, fakeCtx(rec));
  assert.equal(rec.path, "/api/v1/appointments/a1/confirm");
});

test("el alta multipart NO se deriva (el agente no sube binarios por args)", () => {
  const tools = deriveResourceTools(CATALOG);
  assert.equal(byName(tools, "resource.create_clinical_documents"), undefined);
});

test("precedencia: una hand-written gana sobre la derivada (mismo recurso/op)", () => {
  const existing = [
    {
      name: "clinical.create_patient_draft",
      approval: { actionType: "create_patient_draft", targetResource: "appointments" },
    },
    { name: "clinical.list_appointments" },
  ] as unknown as ToolDefinition[];
  const tools = deriveResourceTools(CATALOG, existing);
  // create_appointments queda cubierto por la curada (targetResource appointments) -> se omite.
  assert.equal(byName(tools, "resource.create_appointments"), undefined);
  // list_appointments cubierto por nombre -> se omite; update/get siguen derivándose.
  assert.equal(byName(tools, "resource.list_appointments"), undefined);
  assert.ok(byName(tools, "resource.update_appointments"));
  assert.ok(byName(tools, "resource.get_appointments"));
});
