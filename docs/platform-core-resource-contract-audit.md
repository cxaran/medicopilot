# Auditoría del contrato declarativo de recursos (Platform Core) — fase de alineación clínica

> Gate de la **Sección 1** de la corrección arquitectónica: documentar el contrato
> real **antes** de modificar comportamiento. Toda afirmación se sustenta en archivos
> reales. Complementa —no reemplaza— a `docs/architecture/resource-contract-audit.md`
> (auditoría previa, centrada en users/roles/permissions y en los filtros C1/C2). Este
> documento añade el foco que faltaba: **los recursos clínicos ya implementados sólo
> tienen `ResourceQuery`, no `ResourceDefinition`**, y qué hace falta para registrarlos.

## 0. Conclusión ejecutiva

- El núcleo de Platform Core es **genuinamente declarativo**: el frontend Next.js
  (`frontend/src`) construye catálogo, tablas, columnas, filtros, formularios
  create/update, acciones, relaciones y rutas **100% desde** `GET /api/v1/resources`,
  sin hardcodear nombres de recurso. No existe ninguna pantalla por recurso ni
  pantalla clínica; todo recurso publicado hereda la UI genérica.
- **`RESOURCE_REGISTRY` contiene hoy sólo `users`, `roles`, `permissions`**
  (`backend/app/resources/registry.py`). Los diez recursos clínicos
  (`doctors`, `patients`, `patient_clinical_items`, `medical_history_versions`,
  `consultations`, `vital_signs`, `consultation_diagnoses`, `prescriptions`,
  `prescription_items`, `appointments`) tienen una instancia **`ResourceQuery`** en el
  mismo módulo, pero **no** un `ResourceDefinition`. Por tanto el backend no publica su
  contrato y el frontend no puede generarlos. Ésta es la brecha a corregir.
- Registrar los recursos **CRUD simples** (doctors, patients, patient_clinical_items,
  consultation_diagnoses, vital_signs) **no requiere cambiar el contrato**: basta
  añadir su `ResourceDefinition` y completar metadata UI en sus schemas.
- Registrar recursos con **acciones de estado** (medical_history finalize,
  consultations finalize, prescriptions approve/void, appointments
  confirm/cancel/no-show/reschedule) **requiere extender el contrato de acciones**:
  hoy `ActionDef` sólo soporta `fixed_body` + `confirmation`, **no** `input_schema`
  (para `void_reason`, reprogramación, etc.) ni `visible_when`/`enabled_when`. Ver §5.

## 1. Flujo del contrato (nombres reales)

```text
ResourceQuery (query/resource.py) ─┐  capacidades de consulta: filtros, orden, búsqueda, paginación
  .plan → CompiledQueryPlan        │  (query/contracts.py, query/plans.py)
                                   │
ResourceDefinition ───────────────┤  contrato de recurso para el frontend
  (backend/app/resources/registry.py: RESOURCE_REGISTRY)
        │
        ▼
projection (backend/app/resources/projection.py: _build_capability)
        → ResourceCapability (backend/app/schemas/capabilities.py)
GET /api/v1/resources  (backend/app/api/v1/resources.py)  ← filtra por read_permission del usuario
        → app.openapi()  →  frontend/src/generated/openapi.ts (openapi-typescript)
        → frontend/src/core/api/contracts.ts (aliases type-only, sin interfaces a mano)
        → getResourceCatalog / getResourceCapability (frontend/src/core/resources/capabilities-client.ts)
        → app/(platform)/resources/[resourceName]/...  (UI genérica, por "key")
```

Fuente de verdad por recurso = su `ResourceDefinition`. La metadata UI de **campos**
(label/widget/visibilidad/filtro) vive en los **schemas Pydantic** vía
`json_schema_extra={"ui": {...}}`; las capacidades **técnicas**
(sortable/searchable/operadores/orden/límites) vienen del `CompiledQueryPlan`. La
projection cruza ambas.

## 2. Tabla de preguntas requerida (respuestas basadas en código)

| Pregunta | Respuesta basada en código real |
|---|---|
| ¿Cómo se registra un `ResourceDefinition`? | Añadiéndolo a la tupla `RESOURCE_REGISTRY` en `backend/app/resources/registry.py`. Campos del dataclass `ResourceDefinition`: `name`, `label`, `api_path`, `view` (`ResourceView.TABLE`/`GROUPED_CATALOG`), `read_permission`, `list_query`, `list_schema`, `create_schema`, `update_schema`, `create_permission`, `update_permission`, `detail_url_template`, `item_id_field` (default `"id"`), `actions`, `relations`. `get_resource(name)` lo resuelve por key. |
| ¿Qué metadata recibe el frontend? | El schema `ResourceCapability` (`schemas/capabilities.py`): `name`, `label`, `api_path`, `view`, `item_reference`, `detail`, `list` (`fields`, `filters`, `filterable_fields`, `pagination`, `search`, `sort`), `forms.create/update`, `actions[]`, `relations[]`. Se serializa con `response_model_exclude_none`; lo no autorizado se **omite** (nunca `allowed:false`). Nunca se serializan permisos, `SecurityControl`, SQL, ni PK internas. |
| ¿Cómo se declaran labels? | Por campo: `field_info.title` o `json_schema_extra["ui"]["label"]` (`projection._require_label`; obligatorio o lanza `CapabilityConfigError`). Por recurso: `ResourceDefinition.label`. **Todos en español.** |
| ¿Cómo se declaran columnas visibles? | `json_schema_extra["ui"]["list"] is True` en los campos del `list_schema` → `ResourceFieldCapability.visible_in_list`. Un campo declarado sólo para filtro se emite con `visible_in_list=False`. |
| ¿Cómo se declaran filtros? | Dos vías: (a) legacy `ui.filter` (un control por campo en el list_schema) → `list.filters`; (b) declarativa `list.filterable_fields`, derivada del `CompiledQueryPlan` (`filter_parameters` + `extended_filters`): operadores, `parameter_name`/`parameters{from,to}`, `value_shape`, `widget`, `options`. El frontend nunca infiere sufijos. |
| ¿Cómo se vincula un schema Create/Update/Read/List? | `ResourceDefinition` referencia `list_schema`, `create_schema`, `update_schema` y `list_query` (que envuelve el schema de listado). **No hay campo `read_schema`**: la lectura individual sólo publica una URL (`detail.url_template`) usada para **precargar el form de edición**; la metadata de campos de detalle/solo-lectura **no se proyecta hoy** (brecha, §5). Los form fields salen de `ui.form is True` en create/update_schema (`projection._form_fields`). |
| ¿Cómo se expresan enums y opciones select? | En **filtros**: `ui.filter.widget="select"` + `ui.filter.options=[{value,label}]` (validadas en `projection._filter_options`). En **formularios**: `_form_fields` emite `type=ENUM` y `widget`, pero **NO emite `options`** → el form genérico no recibe las opciones del enum (brecha, §5). |
| ¿Cómo se publican acciones y permisos? | `ActionDef` (registry) → `ResourceActionCapability`: `name`, `label`, `method`, `url_template`, `scope` (`resource`/`item`), `danger`, `request.fixed_body` opcional, `confirmation` opcional, `success_behavior`. Se proyecta **sólo si** `action.permission.check(user)`. Los permisos en sí **nunca** se serializan; son el filtro de visibilidad. |
| ¿Cómo se genera `detail_url_template`? | Campo literal en `ResourceDefinition.detail_url_template` (p. ej. `"/api/v1/users/{id}"`). Si está presente, la projection publica `detail` (GET) + `item_reference{field=item_id_field, placeholder="id", type=uuid}`. |
| ¿Cómo consume el frontend las capabilities? | `capabilities-client.ts` (`getResourceCatalog`/`getResourceCapability`, server-only, cookie + `no-store`). La UI genérica vive en `app/(platform)/resources/[resourceName]/...` y `components/resources/*` (tabla, filtros, forms, acciones, relaciones). Tipos desde `generated/openapi.ts` (sin interfaces a mano). |
| ¿Qué partes ya son dinámicas y cuáles faltan? | Dinámico: catálogo/navegación, columnas, formato de celda por tipo, filtros/búsqueda, paginación/orden, forms create/update, acciones de fila (fixed_body + confirmación), relaciones, rutas, `item_reference`. Falta/hardcode (§4): vista de **detalle de sólo lectura**, **opciones de enum en forms**, **acciones con input del usuario** y **condiciones de estado** (`visible_when`), textos de chrome en español. |
| ¿Qué recursos existentes ya están correctamente registrados? | `users`, `roles` (`view=table`, con forms/actions/relations) y `permissions` (`view=grouped_catalog`). Sólo estos tres tienen `ResourceDefinition`. |

## 3. Inventario: ResourceQuery vs ResourceDefinition

| Recurso (key) | `ResourceQuery` | `ResourceDefinition` | Registrable con contrato actual |
|---|---|---|---|
| users | ✅ `USERS` | ✅ | — (ya) |
| roles | ✅ `ROLES` | ✅ | — (ya) |
| permissions | — | ✅ (grouped_catalog) | — (ya) |
| doctors | ✅ `DOCTORS` | ❌ | **Sí** (CRUD + delete) |
| patients | ✅ `PATIENTS` | ❌ | **Sí** (CRUD + delete) |
| patient_clinical_items | ✅ `PATIENT_CLINICAL_ITEMS` | ❌ | **Sí** |
| medical_history_versions | ✅ `MEDICAL_HISTORY_VERSIONS` | ❌ | Parcial — requiere acción `finalize` |
| consultations | ✅ `CONSULTATIONS` | ❌ | Parcial — requiere acción `finalize` |
| vital_signs | ✅ `VITAL_SIGNS` | ❌ | **Sí** (subrecurso filtrado por `consultation_id`) |
| consultation_diagnoses | ✅ `CONSULTATION_DIAGNOSES` | ❌ | **Sí** |
| prescriptions | ✅ `PRESCRIPTIONS` | ❌ | Parcial — requiere acciones `approve` (vacía) y `void` (**input_schema**) |
| prescription_items | ✅ `PRESCRIPTION_ITEMS` | ❌ | **Sí** (permisos heredados `prescriptions:*`) |
| appointments | ✅ `APPOINTMENTS` | ❌ | Parcial — requiere `confirm`/`no-show` (vacías), `cancel`/`reschedule` (**input_schema**) |

Claves estables a usar (coinciden backend/capabilities/frontend): exactamente las de la
columna "Recurso (key)" — sin variantes camelCase ni guiones.

## 4. Dinámico vs hardcodeado en el frontend (resumen del mapeo real)

**Ya dinámico desde capabilities:** catálogo y navegación; columnas (`list.fields` +
`visible_in_list`) y orden; formato de celda por `FieldValueType`; filtros y búsqueda
(`list.filterable_fields`, `list.search`); paginación/orden; forms create/update
(`forms.*`: campos, widgets, método, `url_template`, `required`); acciones de fila
(`actions`: label, method, url, `fixed_body`, `confirmation`, `danger`);
`item_reference` (nunca asume `id`); detalle (URL); relaciones; todas las rutas
`/resources/{name}/...`; `view` (tabla vs catálogo agrupado).

**Hardcodeado o ausente (relevante para clínico):**
1. **No hay vista de detalle de sólo lectura**: `detail` sólo precarga el form de
   edición. Los campos read-only de detalle (folio, snapshot, fechas de auditoría,
   `bmi`) no tienen contrato de presentación.
2. **Forms no reciben opciones de enum**: `_form_fields` no emite `options`; un
   `select` de creación/edición (p. ej. `diagnosis_kind`, `item_type`) no obtiene sus
   valores del contrato.
3. **Acciones sin input del usuario**: sólo `fixed_body`. No existe `input_schema`
   para `void_reason`, motivo de cancelación o cuerpo de reprogramación.
4. **Acciones sin condición de estado**: no hay `visible_when`/`enabled_when`; la
   visibilidad por `status` (p. ej. approve sólo en draft) se decidiría en frontend.
5. Allowlist de widgets soportados en forms (`resource-form.ts`); widgets nuevos
   (date/datetime/number/select-con-opciones) requieren soporte en el render.
6. Textos de chrome en español fijos (no bloqueante).

## 5. Brechas de contrato a cubrir antes de los recursos con acciones especiales

Para registrar **todos** los recursos clínicos respetando la regla "el frontend no
duplica labels, campos, permisos ni acciones", el contrato debe extenderse de forma
**genérica y reutilizable** (no específica de MedicoPilot):

- **B1 — Opciones de enum en form fields.** `ResourceFormFieldCapability` debe poder
  llevar `options[]`; `projection._form_fields` debe derivarlas del enum del campo
  (o de `ui.options`). Necesario para selects de creación/edición.
- **B2 — `input_schema` en acciones.** `ActionDef`/`ResourceActionCapability` deben
  poder publicar un formulario de acción (campos como los de forms) para acciones con
  cuerpo del usuario: `prescriptions.void` (`PrescriptionVoid`),
  `appointments.cancel` (`AppointmentCancel`), `appointments.reschedule`
  (`AppointmentReschedule`). El backend sigue validando.
- **B3 — `visible_when`/`enabled_when` por estado.** Condición declarativa de UX
  (p. ej. `status == "draft"`). Las reglas críticas se siguen validando en backend;
  esto sólo mejora la UX y evita lógica duplicada en frontend.
- **B4 — Contrato de detalle de sólo lectura (opcional para esta fase).** Publicar
  metadata de campos de `read_schema` para una vista "ver item" y campos read-only
  (folio, snapshot, `bmi`). Puede diferirse si la fase no incluye detail-view.

Sin B1–B3, los recursos CRUD simples (doctors, patients, patient_clinical_items,
vital_signs, consultation_diagnoses, prescription_items) sí pueden registrarse y
renderizarse correctamente.

## 6. Plan de migración controlado (commits separados, tests verdes en cada uno)

Mantiene la separación **contrato backend ≠ consumo frontend ≠ flujo clínico**:

```text
Commit A  docs: this audit (sin cambios de comportamiento)                       ← este commit
Commit B  feat(resources): register doctors and patients capabilities            (backend)
Commit C  feat(resources): register clinical summary capabilities                (patient_clinical_items, vital_signs, consultation_diagnoses)
Commit D  feat(capabilities): action input_schema + visible_when + enum options  (extensión genérica B1–B3)
Commit E  feat(resources): register medical_history + consultations (finalize)   (usa D)
Commit F  feat(resources): register prescriptions/items + appointments actions   (usa D)
Commit G+ feat(frontend): consume nuevos contratos (tabla/forms/acciones)        (por lote, tras backend)
```

Cada `ResourceDefinition` conserva su `ResourceQuery` actual y completa: labels en
español, `ui.list`/`ui.form`/`ui.filter` en sus schemas, `detail_url_template`,
acciones con permiso y, donde aplique, `input_schema`/`visible_when`. `prescription_items`
declara permisos heredados (`read→prescriptions:read`, `create/update/delete→
prescriptions:update`); no se crean permisos `prescription_items:*`.

## 7. Verificación

Análisis estático sobre los archivos citados: `backend/app/resources/registry.py`,
`backend/app/resources/projection.py`, `backend/app/schemas/capabilities.py`,
`backend/app/api/v1/resources.py`, `backend/app/query/resource.py`, y el mapeo del
frontend en `frontend/src/core/resources/*`, `frontend/src/components/resources/*`,
`frontend/src/app/(platform)/resources/[resourceName]/*`. No se modificó comportamiento
en este commit (sólo documentación).
