# Auditoría de cobertura del frontend (MP-CTRL-0058 · F0)

Fecha: 2026-06-28. Mapea cada recurso/endpoint del backend (FastAPI, vía el cliente
OpenAPI generado y la capa de datos del frontend) contra la pantalla/acción del frontend
que lo consume. Ordena los huecos por impacto para guiar las siguientes rebanadas (F1, F2…).

## Cómo está construido el frontend

Casi todo el CRUD administrativo/clínico es **capability-driven**: el backend publica
`/api/v1/resources` (`RESOURCE_REGISTRY` en `backend/app/resources/registry.py`) y el
frontend renderiza pantallas genéricas a partir de esa metadata:

- Lista + filtros + paginación + orden: `app/(platform)/resources/[resourceName]/page.tsx`.
- Alta: `…/[resourceName]/new/page.tsx` → `ResourceCreateForm`.
- Edición (con detalle precargado): `…/[resourceName]/[id]/edit/page.tsx` → `ResourceUpdateForm`.
- Acciones de fila (eliminar, archivar, transiciones): `ResourceRowActions` + `resource-action-client`.
- Editores relacionales (M2M): `…/[id]/[relationName]` → `RelationEditor`.

No hay página de **detalle de solo lectura** dedicada para ningún recurso: la edición
precargada cumple ese papel (muestra todos los valores actuales).

## Causa raíz del hueco principal (alta de paciente rota)

El formulario genérico solo aceptaba **5 widgets**: `text, email, password, switch,
textarea` (`core/resources/resource-form.ts`). El renderer (`ResourceFormFields.tsx`) ya
sabía pintar `date/number/datetime/time` pero el *guard* `assertSupported*Form` los
rechazaba, y **`select` no se renderizaba en absoluto**. Como el formulario de paciente
usa `select` (sexo, estado) y `date` (fecha de nacimiento), alta y edición lanzaban
`FormContractError` → la página fallaba. Por eso en B14b el paciente hubo que crearlo por API.

Este hueco es **sistémico**: afecta a casi todos los recursos cuyos formularios usan
`select`/`date`/`datetime`/`number`. La rebanada **F1** añade `select` + `date` al
formulario genérico (más conversión de opcional vacío → `null` para no romper `EmailStr`/
`date` ni impedir limpiar en PATCH), lo que desbloquea de golpe varios recursos.

## Tabla de huecos priorizada

Leyenda UI: ✅ existe y funciona · ⚠️ existe pero rota/incompleta · ❌ no existe.

| # | Recurso | Endpoints | UI lista | UI alta | UI edición | UI borrado/acciones | Estado tras F1 | Prioridad |
|---|---------|-----------|----------|---------|------------|---------------------|----------------|-----------|
| 1 | **patients** (pacientes) | full CRUD + archive/delete | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ archive/delete | **F1 lo arregla** | **P0 (hecho)** |
| 2 | patient_clinical_items | full CRUD | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ delete | F1 (select+date) | P1 |
| 3 | doctors | full CRUD | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ delete | F1 (select) | P1 |
| 4 | medication_templates | full CRUD | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ delete | F1 (select) | P2 |
| 5 | consultation_diagnoses | full CRUD | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ delete | F1 (select) | P1 |
| 6 | medical_history_versions | CRUD + finalize | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ finalize/delete | F1 (select) | P1 |
| 7 | prescriptions | CRUD + approve/void | ✅ | ✅ | ✅ | ✅ approve/void/delete | OK (text/textarea) | P1 |
| 8 | prescription_items | full CRUD | ✅ | ✅ | ✅ | ✅ delete | OK (text/textarea) | P2 |
| 9 | users | full CRUD + roles/sesiones | ✅ | ✅ | ✅ | ✅ activate/deactivate/delete | OK | P2 |
| 10 | roles | full CRUD + permisos | ✅ | ✅ | ✅ | ✅ activate/deactivate/delete | OK | P2 |
| 11 | permissions | catálogo (solo lectura) | ✅ grouped_catalog | n/a | n/a | n/a | OK | — |
| 12 | **consultations** | CRUD + finalize | ✅ | ❌ | ❌ | ✅ finalize/delete | **bloqueado: `datetime`** | **F2** |
| 13 | **vital_signs** | full CRUD | ✅ | ❌ | ❌ | ✅ delete | **bloqueado: `datetime`+`number`** | **F2** |
| 14 | **appointments** (agenda) | CRUD + confirm/cancel/no-show/reschedule | ✅ | ❌ | ❌ | ✅ acciones | **bloqueado: `number`+`datetime`** | **F2** |
| 15 | **clinical_documents** | CRUD multipart + download/archive/restore | ✅ | ❌ | ⚠️ (metadata) | ✅ archive/restore/delete | **bloqueado: subida multipart** | **F3** |
| 16 | **ai_providers** | credenciales API key + OAuth ChatGPT | n/a | ✅ (en `/account`) | n/a (rotación = borrar+crear) | ✅ eliminar | OK (UI dedicada) | — |
| 17 | **agent_memories** | CRUD de memorias del agente | ❌ | ❌ | ❌ | ❌ | **sin UI** | **F4** |

### Huecos transversales (afectan a varias filas)

- **Widgets faltantes en el form genérico (post-F1):** `datetime`, `number`, `time`,
  `multiselect`, `daterange`. Necesarios para consultas, signos vitales y agenda. → **F2**.
- **Subida de archivos (multipart):** `ResourceCreateForm` solo hace JSON; el alta de
  documentos clínicos declara `create_transport=MULTIPART` con `create_file_field`. → **F3**.
- **Selección de relaciones (FK):** los recursos "hijos" (vital_signs→consultation_id,
  prescriptions→consultation_id, patient_clinical_items→patient_id, appointments→patient_id/
  doctor_id…) exponen esas FK como `text` que esperan un UUID escrito a mano. Falta un
  *picker* de relación (buscar/elegir el padre). → **F5** (mejora de UX, no bloquea el alta
  si se pega el UUID).
- **Página de detalle de solo lectura:** hoy se usa la edición precargada. Aceptable; un
  detalle dedicado sería mejora futura, no bloqueo. → backlog.
- **agent_memories:** el endpoint existe (cliente generado) pero ningún componente lo
  consume; no hay pantalla de gestión de memorias del agente. → **F4**.

## Plan de rebanadas

- **F1 (esta tarea):** `select` + `date` en el form genérico + opcional-vacío→`null`.
  Desbloquea pacientes (P0) y, de paso, doctors, medication_templates,
  consultation_diagnoses, medical_history_versions y patient_clinical_items.
- **F2:** widgets `datetime`/`number` (y `time`) → consultas, signos vitales, agenda.
- **F3:** alta multipart (subida de archivo) → documentos clínicos.
- **F4:** UI de memorias del agente (agent_memories).
- **F5:** picker de relación para FK (UX de recursos hijos).
