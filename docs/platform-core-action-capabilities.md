# Contrato genérico de acciones de capabilities

Este documento describe la extensión genérica del contrato de capabilities introducida
en el commit `feat(capabilities): expose dynamic action schemas and state conditions`
(Commit D del plan de registro de recursos de platform-core).

El objetivo es que el **backend sea la única fuente de verdad** también para las acciones
no-CRUD de estado: el frontend nunca infiere opciones de un select, ni qué campos pide
una acción, ni cuándo una acción es visible o está habilitada. Todo se declara en el
registro (`backend/app/resources/registry.py`) y se proyecta a la capability pública
(`backend/app/schemas/capabilities.py` vía `backend/app/resources/projection.py`).

Tres extensiones, todas **aditivas y retrocompatibles** (los recursos ya registrados
—users, roles, doctors, patients, patient_clinical_items, vital_signs,
consultation_diagnoses— conservan exactamente el mismo contrato; los campos nuevos se
omiten por `response_model_exclude_none`):

- **B1 — Opciones de selección en formularios.**
- **B2 — `input_schema`: formularios de entrada para acciones.**
- **B3 — `visible_when` / `enabled_when`: condiciones de estado.**

> Recordatorio transversal: las capabilities son **guía de UI**. El backend revalida
> siempre cada mutación (permiso, supervivencia administrativa, invalidación de sesiones,
> reglas clínicas). Si el frontend no puede evaluar una condición, debe comportarse de
> forma conservadora; jamás reemplaza la autoridad del backend.

---

## B1 — Opciones de selección en formularios

`ResourceFormFieldCapability` publica un campo opcional `options`, con la misma forma
`{value, label}` que los filtros (`ResourceFilterOption`):

```jsonc
{
  "name": "status",
  "label": "Estado",
  "type": "enum",
  "required": false,
  "editable": true,
  "widget": "select",
  "options": [
    { "value": "active", "label": "Activo" },
    { "value": "inactive", "label": "Inactivo" },
    { "value": "suspended", "label": "Suspendido" }
  ]
}
```

Reglas:

- **Misma proyección que create/update.** Las opciones se derivan en `_form_fields`
  (la misma función que produce los formularios de creación/actualización), de modo que
  cualquier campo de formulario —de un recurso o de una acción (B2)— las obtiene igual.
- **Fuente de las opciones**, en orden de prioridad:
  1. `ui.options` declarado en el `json_schema_extra` del campo (lista `{value, label}`
     con labels en español). Es la fuente preferida porque lleva los labels del dominio.
  2. Si no hay `ui.options` pero el campo es un `Enum`, se derivan de los miembros del
     enum (`value` y `label` = valor del enum). Evita selects sin universo sin inventar
     labels nuevos.
  3. En cualquier otro caso (texto, número, fecha, UUID libre): `options` ausente
     (`null`, omitido por `exclude_none`).
- **Tipo del valor.** El `value` se serializa siempre como string, aun cuando el tipo
  real sea entero o booleano: es la misma convención que los filtros, para que el
  frontend trate las opciones de forma uniforme.
- **Validación.** La validación de las opciones declaradas (value string no vacío, label
  explícito, sin duplicados) es la misma de los filtros: `_declared_options`, fuente
  única compartida por `ui.filter.options` y `ui.options`. Una declaración inválida falla
  al construir la capability (`CapabilityConfigError`).

No se asume que todo select sea un enum, ni se hardcodean catálogos: los selects cuyo
universo es dinámico (p. ej. un médico) no declaran `options` aquí; se modelan como
relaciones u otros mecanismos.

---

## B2 — `input_schema`: formularios de entrada para acciones

Una acción puede declarar un **formulario de entrada** en lugar de un cuerpo fijo. En el
registro, `ActionDef` acepta `input_schema: type[BaseModel] | None`; la capability
`ResourceActionCapability` publica `input_schema: ActionInputSchema | None`, donde
`ActionInputSchema` es simplemente `{ "fields": ResourceFormFieldCapability[] }`.

```jsonc
{
  "name": "reschedule",
  "label": "Reagendar",
  "method": "POST",
  "url_template": "/api/v1/appointments/{id}/reschedule",
  "scope": "item",
  "danger": false,
  "input_schema": {
    "fields": [
      { "name": "scheduled_date", "label": "Nueva fecha", "type": "date",
        "required": true, "widget": "date" },
      { "name": "scheduled_time", "label": "Nueva hora", "type": "time",
        "required": false, "widget": "time" },
      { "name": "duration_minutes", "label": "Duración (min)", "type": "integer",
        "required": false, "widget": "number" },
      { "name": "reason", "label": "Motivo", "type": "string",
        "required": false, "widget": "text" }
    ]
  }
}
```

Reglas:

- **Reusa la misma proyección** de create/update (`_form_fields`): cada campo del
  `input_schema` se publica como `ResourceFormFieldCapability`, con label, tipo, widget,
  obligatoriedad y opciones (B1). Por lo tanto el `input_schema` también soporta selects
  con opciones, fechas, horas, números y textareas. Los campos deben declarar
  `ui.form: true` (misma convención que los formularios CRUD).
- **Nunca se serializa la clase Python**, ni defaults, ni validadores, ni lógica: solo la
  representación de campos.
- **`extra="forbid"` obligatorio.** El schema de entrada debe rechazar campos no
  declarados. Se valida al definir la acción (`ActionDef.__post_init__`): un schema sin
  `extra="forbid"` falla de inmediato.
- **`fixed_body` e `input_schema` son excluyentes.** Las combinaciones válidas son:

  | `fixed_body` | `input_schema` | Resultado |
  |--------------|----------------|-----------|
  | ausente      | ausente        | La acción no envía cuerpo. |
  | presente     | ausente        | La acción envía exactamente `fixed_body` (comportamiento actual). |
  | ausente      | presente       | La acción presenta el formulario y envía lo capturado. |
  | presente     | presente       | **No soportado**: `ActionDef.__post_init__` lanza error de configuración (falla temprano, al registrar el recurso, no al proyectar). |

- No se publican secretos ni se exponen valores por defecto del backend.

---

## B3 — `visible_when` / `enabled_when`: condiciones de estado

Las acciones pueden declarar condiciones sobre el **estado del item** mediante un DSL
**serializable** (datos, no código). `ActionDef` acepta `visible_when` y `enabled_when`
(ambos `ActionCondition | None`), que se publican tal cual en la capability.

```jsonc
{
  "name": "void",
  "label": "Anular",
  "visible_when": { "all": [ { "field": "status", "operator": "eq", "value": "approved" } ] },
  "enabled_when": {
    "all": [
      { "field": "voided_at", "operator": "is_null" },
      { "field": "status", "operator": "in", "value": ["approved", "active"] }
    ]
  }
}
```

Semántica:

- `visible_when`: si **no** se cumple, la acción no se muestra.
- `enabled_when`: si **no** se cumple, la acción se muestra **deshabilitada**.

Forma del DSL:

- Una condición es una **conjunción**: `{ "all": [ <predicado>, ... ] }`. Sólo se soporta
  `all` (todos los predicados deben cumplirse). Se añadirá `any` solo si una necesidad
  real lo justifica.
- Un predicado es `{ "field": <str>, "operator": <op>, "value": <?> }`.
- Operadores soportados (`ActionConditionOperator`):

  | Operador   | `value`                       | Significado |
  |------------|-------------------------------|-------------|
  | `eq`       | escalar (requerido)           | `field == value` |
  | `neq`      | escalar (requerido)           | `field != value` |
  | `in`       | lista no vacía (requerido)    | `field ∈ value` |
  | `not_in`   | lista no vacía (requerido)    | `field ∉ value` |
  | `is_null`  | ausente                       | `field` es nulo |
  | `not_null` | ausente                       | `field` no es nulo |

Reglas:

- **No es un lenguaje evaluable.** Nunca se publican expresiones, JavaScript, Python ni
  lambdas; sólo datos con la forma anterior.
- **El permiso es una propiedad aparte.** La autorización vive en `ActionDef.permission`
  y se filtra **antes** de proyectar la acción (si el actor no tiene permiso, la acción
  ni siquiera aparece). El permiso nunca se expresa como condición y nunca se serializa.
- **Validación temprana.** Las condiciones se validan al construirse (es decir, al
  registrar la acción): `field` no vacío; operador válido; `value` requerido para
  `eq`/`neq`/`in`/`not_in` (lista no vacía para `in`/`not_in`); `value` ausente para
  `is_null`/`not_null`; `all` no vacío. Una configuración inválida falla de inmediato.
- **El backend es la autoridad final.** Estas condiciones son guía de UI; el backend
  revalida la operación. Si el frontend no puede evaluar una condición (campo ausente en
  el item, operador desconocido), debe comportarse de forma conservadora.

---

## Notas de implementación

- Schemas del contrato: `backend/app/schemas/capabilities.py`
  (`ResourceFormFieldCapability.options`, `ActionInputSchema`, `ActionConditionOperator`,
  `ActionConditionPredicate`, `ActionCondition`, y los campos `input_schema` /
  `visible_when` / `enabled_when` en `ResourceActionCapability`).
- Declaración: `backend/app/resources/registry.py` (`ActionDef.input_schema`,
  `ActionDef.visible_when`, `ActionDef.enabled_when`, validación en `__post_init__`).
- Proyección: `backend/app/resources/projection.py` (`_form_field_options`,
  `_declared_options`, `_action_capability`).
- Tipos de valor nuevos para soportar campos de hora en formularios de acción:
  `FieldValueType.TIME` y `WidgetType.TIME`.
- Tests: `backend/tests/test_action_capabilities.py` (B2/B3 con schemas locales del
  test, sin registrar acciones clínicas reales) y un caso B1 en
  `backend/tests/test_resources_capabilities.py`.

Este commit es **solo backend** (más documentación y tests). El consumo en el frontend
—regeneración de los tipos OpenAPI compartidos y wiring de los nuevos props— se realiza
en la fase de integración frontend (G+), donde además se sincroniza el resto del
contrato del backend. No se registran acciones clínicas reales (void/approve/cancel/
reschedule/finalize) aquí: eso corresponde a los commits E y F.
