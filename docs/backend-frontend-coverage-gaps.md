# Cobertura backend ↔ frontend: análisis de brechas

> Fecha del análisis: 2026-06-29. Generado cruzando tres inventarios (rutas FastAPI,
> resource registry con filtros/acciones, y consumo real del frontend). Documenta qué
> expone el backend que el frontend **no** usa/expone hoy. Relacionado con la épica
> "cobertura del frontend" (exponer UI para TODA la API).

## Marco: cómo consume el frontend

El front toca el backend por **tres** vías, y la cobertura se mide contra las tres:

1. **UI genérica contract-driven** — `/resources/[name]`, `/[id]`, `/new`, `/edit`. Renderiza
   automáticamente cualquier recurso del catálogo `/api/v1/resources` con sus filtros (incluidos
   operadores extendidos), orden, acciones de fila y formularios. **Solo es alcanzable si hay un
   enlace de navegación.**
2. **Tools del agente** (`frontend/src/core/agent/tools/registry.ts`) — ~60 tools que pegan a rutas
   REST (lectura + creación de **borradores P1**; el agente nunca hace update/delete/transición).
3. **Páginas a medida** — dashboard `/`, `/agenda`, expediente del paciente (record panel), cuenta,
   login, copiloto.

**Hallazgo estructural:** la navegación humana del sidebar (`AppSidebar.tsx`) es una **lista curada
hardcodeada** de 6 recursos — `patients`, `consultations`, `appointments` (→ `/agenda`),
`prescriptions`, `users`, `roles` — más las pestañas del expediente (`record-tabs.ts`):
`medical_history_versions`, `patient_history_items`, `vital_signs`, `clinical_documents`,
`consultations`, `appointments`. **Todo lo demás solo lo toca el agente o queda huérfano**
(alcanzable únicamente tecleando la URL genérica).

## 1. Recursos sin UI humana (solo agente o huérfanos)

CRUD completo en backend; la UI genérica funcionaría pero **no hay enlace de navegación ni pestaña**.

| Recurso | Backend | En el front hoy | Gap |
|---|---|---|---|
| `lab_results` | CRUD + filtros ricos | Solo agente (list/get/create draft) | Sin UI humana de laboratorios |
| `patient_clinical_items` (alergias, medicación actual, problemas) | CRUD | Solo agente + `patient_summary` | Sin pestaña en el expediente |
| `patient_immunizations` | CRUD | Solo agente | Sin UI humana |
| `clinical_events` | CRUD | Solo agente | Sin UI humana |
| `study_orders` | CRUD | Solo agente | Sin UI humana |
| `clinical_tasks` | CRUD | Solo agente | Sin bandeja de tareas |
| `clinical_notes` (SOAP, constancias…) | CRUD + 3 endpoints especiales | Solo agente (drafts) | La pestaña "Archivos" es `clinical_documents`, no notas |
| `scale_results` | CRUD | Solo agente | Sin UI humana |
| `consultation_diagnoses` | CRUD | Agente; humano vía detalle de consulta (relación) | Parcial |
| `audit_events` | Solo lectura | Solo agente (`list_audit_events`) | Sin visor de auditoría |
| `doctors` | CRUD | Agente solo lectura; CRUD genérico huérfano | Sin nav; sin escritura por agente |
| `medication_templates` | CRUD | Agente solo lectura; CRUD huérfano | Sin nav |
| `clinical_codes` | CRUD | Agente solo búsqueda; CRUD huérfano | Sin nav |
| `institutional_settings` | CRUD | Agente solo lectura; CRUD huérfano | Sin UI de configuración |

`prescription_items` y `permissions` sí se usan vía relaciones (prescriptions/roles).
`conversations`/`messages` respaldan el chat (no son gaps).

## 2. Flujos/endpoints que solo consume el agente (cero UI humana)

Verificado por grep: ningún componente/página los llama, solo las tools del copiloto.

- **Reportes**: `GET /reports/activity|top-diagnoses|unsigned-notes|attendance` → sin página de analítica.
- **Cohortes**: `POST /population/cohort` → sin constructor humano.
- **Calidad/seguridad**: `POST /quality/check` → sin panel humano.
- **Conciliación de medicación**: `GET /patients/{id}/medication-reconciliation` → sin UI humana.
- **Escalas**: `GET /clinical-scales`, `POST /clinical-scales/{id}/compute` → sin calculadora humana.
- **PubMed**: `GET /research/pubmed`, `/{pmid}` → sin búsqueda bibliográfica humana.
- **Documentos especializados**: `POST /clinical-notes/medical-certificate|sick-leave|referral` → sin
  formularios humanos dedicados (solo drafts del agente).
- **Contenido/transcripción de documentos**: `GET /clinical-documents/{id}/content|transcript` → solo
  agente (la transcripción también por el panel local de audio).

## 3. Acciones de ciclo de vida (cobertura)

Estas **sí** se surfacean (acciones de fila de la UI genérica en páginas navegables / expediente, y/o
agente): appointments confirm/cancel/no-show/reschedule; consultations finalize; prescriptions
approve/void; patients archive; medical_history_versions finalize; clinical_documents
archive/restore/download; users revoke-sessions, roles/permissions, users/roles.

**Brecha transversal:** para los recursos del bloque 1 (lab_results, clinical_events, study_orders,
clinical_tasks, etc.) las transiciones/edición/borrado **no son alcanzables** porque sus páginas no
son navegables, y el agente **solo crea borradores**. No hay forma humana de editar/borrar/transicionar
casi ningún recurso clínico salvo tecleando la URL genérica.

## 4. Filtros y operadores permitidos pero no ejercidos

La UI genérica renderiza todos los operadores del contrato (eq, contains/starts_with/ends_with, ne,
on/before/after/between, gte/lte, in, isnull). El gap:

- **Recursos no navegables**: sus filtros ricos no se usan porque nadie llega a su listado
  (p. ej. `lab_results.analyte_name` contains, `measured_at` rango; `clinical_events.started_at` rango).
- **Tools del agente con subconjunto curado**, NO usan:
  - Operadores de fecha de un extremo `on`/`before`/`after` (solo `between` vía `_from`/`_to`).
  - Texto `starts_with`/`ends_with`/`ne` (solo `contains`).
  - `isnull` (`_isnull`) — sin uso en ninguna parte.
  - `in` salvo `lab_results.abnormal_flag_in`.
  - Búsqueda `q=` salvo en `institutional_settings`/`clinical_codes`.

## 5. Backlog priorizado

**Alto valor / bajo costo** (la UI genérica ya existe; falta solo el punto de entrada):
1. Pestañas de expediente para recursos clínicos por-paciente faltantes: `lab_results`,
   `patient_clinical_items`, `patient_immunizations`, `clinical_events`, `study_orders`,
   `clinical_tasks`, `clinical_notes`, `scale_results`.
2. Sección de **Administración** en el sidebar: `doctors`, `medication_templates`, `clinical_codes`,
   `institutional_settings`.

**Funciones potentes hoy solo en el copiloto** (requieren UI humana nueva — features grandes):
3. Reportes/analítica, cohortes, calidad, conciliación de medicación, escalas.
4. Visor de auditoría (`audit_events`).
5. Formularios humanos para documentos especializados (constancia/incapacidad/referencia).

## Notas de implementación

- Añadir un recurso al expediente = editar `frontend/src/core/chat-shell/record-tabs.ts` (módulo PURO
  con tests) declarando `{ resourceName, scope }`. `scope: "patient"` requiere que el recurso tenga
  `patient_id` como filtro EQ en el registry; si solo filtra por `consultation_id`, usar
  `scope: "consultation"` (la UI muestra el aviso de "se registran por consulta").
- Añadir nav humana = editar `MAIN_NAV`/`ADMIN_NAV` en `frontend/src/components/layout/AppSidebar.tsx`
  (cada item se filtra por catálogo: solo aparece si el recurso está en `/api/v1/resources` del rol).
- Las UIs analíticas (reportes/cohortes/calidad) NO son contract-driven: requieren páginas a medida que
  consuman los endpoints agregados (hoy solo los toca el agente).
