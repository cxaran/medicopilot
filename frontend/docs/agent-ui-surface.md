# Superficie de UI del agente (UI generativa gobernada)

Documento para desarrolladores (MP-CTRL-0134). Describe la superficie de **UI generativa** del
copiloto: qué puede pintar el agente en el chat, cómo se valida y qué invariantes se sostienen. Toda
esta superficie es **frontend** y vive bajo `src/core/agent/tools/` (lógica pura) +
`src/components/copilot/GeneratedUi.tsx` (renderizado).

## Principio rector

> El agente PROPONE; la plataforma VALIDA y RENDERIZA; el médico REVISA y APRUEBA; las escrituras
> ocurren por el camino de aprobación (P1). El agente nunca inyecta interfaz ejecutable ni dispara
> escrituras arbitrarias.

## Renderizador único

`GeneratedUi` (`src/components/copilot/GeneratedUi.tsx`) es el **único** renderizador de UI generada.
Recibe una `UiSpec` (unión discriminada por `kind`) y un callback `onSendFollowup(text)`; despacha por
`kind` a un panel interno. **No hay renderizador paralelo**: añadir una superficie nueva = añadir una
`kind` a la unión `UiSpec`, su guarda en `isUiSpec` (`src/core/agent/tools/ui-spec.ts`) y su rama en
`GeneratedUi`. El contenido del modelo se pinta **siempre como texto escapado por React**; no existe
ningún `dangerouslySetInnerHTML` en la superficie del agente (el único uso del proyecto es el script
anti-parpadeo de tema en el layout raíz, contenido estático del desarrollador).

## Kinds de `UiSpec` y sus tools de lectura

Cada `kind` se produce por una tool `ui.*` de **lectura** (sin metadata de aprobación): la tool valida
la entrada, resuelve contra el contrato + RBAC y devuelve la spec; **no escribe nada**. Correspondencia
1:1:

| `UiSpec.kind`                  | Tool de lectura                  | Rebanada | Módulo puro            |
| ------------------------------ | -------------------------------- | -------- | ---------------------- |
| `form`                         | `ui.render_form`                 | B9       | `ui-spec.ts`           |
| `chart`                        | `ui.render_chart`                | B9       | `ui-spec.ts`           |
| `buttons`                      | `ui.render_buttons`              | 0130     | `button-actions.ts`    |
| `dynamic_form`                 | `ui.render_dynamic_form`         | 0117     | `dynamic-form.ts`      |
| `detected_actions`             | `ui.review_detected_actions`     | 0120     | `detected-actions.ts`  |
| `task_plan`                    | `ui.review_task_plan`            | 0129     | `task-plan.ts`         |
| `close_checklist`              | `ui.review_close_checklist`      | 0131     | `close-checklist.ts`   |
| `template_promotion_proposal`  | `ui.propose_template_promotion`  | 0132     | `template-promotion.ts`|
| `record_update`                | `ui.review_record_update`        | 0137     | `record-update.ts`     |
| `open_record`                  | `ui.open_record`                 | 0138     | `open-record.ts`       |
| `wizard`                       | `ui.review_wizard`               | 0139     | `wizard.ts`            |

Notas honestas sobre el inventario:

- **No existe** una `kind` `table` ni `info`. La visualización generativa es sólo `chart` (barras). Las
  tablas guiadas por contrato son el `ResourceTable` genérico (otra superficie, no UI generativa);
  `info_card` es un **widget** dentro de `dynamic_form`, no una `kind` de primer nivel.
- `dynamic_form` es el **compositor de UI a la medida** para casos que ninguna plantilla registrada
  cubre, acotado por una **lista blanca** estricta de widgets/props (rechaza HTML/script/URL/manejadores
  de eventos + límites de complejidad). `template_promotion_proposal` **reutiliza** esa misma validación
  (`validateDynamicForm`) antes de evaluar la promoción.

## Validación / frontera de seguridad por kind

- `form` / `chart`: `parseFormSpec` / `parseChartSpec` normalizan y validan estructura (tipos cerrados,
  números, longitudes). Sólo presentación.
- `dynamic_form`: `validateDynamicForm` = la **frontera de lista blanca** (0117). Tipos de widget y
  props cerrados; rechaza contenido ejecutable; límites de anidación/cantidad.
- `buttons` (0130): `buildButtonsModel` resuelve cada botón contra el catálogo de tools + RBAC. Un
  botón de mensaje o de tool de **lectura** es `read_only`; una tool de **escritura permitida** es
  `actionable` (al hacer clic la ejecuta el modelo pasando por **P1**, no es despacho directo); una
  tool desconocida o una escritura sin permiso queda `blocked` con motivo. Los argumentos fuera del
  esquema de la tool se **descartan** (no se inventan).
- `detected_actions` (0120) / `task_plan` (0129) / `close_checklist` (0131): paneles de **revisión**
  read-only sobre el camino P1. Validan cada ítem contra el catálogo (`reviewContextFromCatalog`,
  proyectado por permiso = señal RBAC) + el esquema de creación. La estructura del panel es fija (el
  agente sólo aporta **datos**, no estructura de UI); React escapa los textos.
- `template_promotion_proposal` (0132): SÓLO PROPUESTA. Recomienda convertir una UI dinámica en
  plantilla registrada; **nunca** registra una `ResourceDefinition` ni muta el backend (eso es un
  cambio de código del desarrollador).
- `record_update` (0137): comparación **antes/después** dedicada para EDITAR un registro existente
  (ajustar la dosis de una receta vigente, corregir un dato del paciente, conciliar medicación). A
  diferencia de `detected_actions` (orientado a ALTAS, gateado por `creatable`), valida contra el
  permiso de **EDICIÓN** (`updatable` = `forms.update` presente; recurso desconocido o sin permiso →
  `blocked` con motivo), descarta los campos fuera del **esquema de edición** y reusa la misma aritmética
  de diff (`computeDiff`). Read-only: al confirmar, el agente aplica la edición con la tool de
  actualización del recurso, con aprobación **P1**.
- `open_record` (0138): acción gobernada **"abrir expediente"**. Valida que el médico puede VER pacientes
  (el recurso aparece en el catálogo proyectado; si no → `blocked` con motivo) y pinta una tarjeta con un
  botón. Abrir el expediente **no** es una escritura clínica: sólo cambia el **contexto activo** del shell
  (que monta el panel del paciente) cuando el médico hace clic. **Nada navega automáticamente** desde la
  salida del modelo; el render usa el callback `onOpenRecord` del host (ausente en uso independiente = botón
  inerte). Por eso esta `kind` no aparece en la tubería e2e de cierre (no es revisión sobre P1, es navegación).
- `wizard` (0139): asistente **multi-paso ORDENADO** para flujos guiados de varias entidades (registrar
  paciente → historia → abrir consulta; admisión; primera consulta pediátrica/prenatal). Es un hermano
  ordenado de `task_plan`: valida cada paso contra el catálogo + RBAC (desconocido/sin permiso → `blocked`),
  descarta campos fuera del esquema, marca requeridos faltantes y respeta **dependencias entre pasos**
  (`depends_on`) para resolver el **paso actual** (el primero pendiente con dependencias hechas). Read-only:
  el agente avanza **un paso a la vez** con la tool de escritura de ese paso (cada uno con aprobación **P1**,
  nunca en lote ni salteando el orden).

## Invariantes que se sostienen en toda la cadena

Verificados por unidad (un test por rebanada) y de extremo a extremo
(`agent-ui-pipeline.test.ts`, que ejercita acciones detectadas → plan de tareas → checklist de cierre →
propuesta de promoción bajo **un mismo** catálogo/RBAC):

1. **P1 — nada se guarda solo.** Las tools `ui.*` son de lectura; ninguna escribe. Las escrituras
   reales van por las tools `clinical.create_*` (tarea por tarea), cada una con aprobación del médico.
   El e2e prueba que en toda la tubería sólo hubo `GET /api/v1/resources` (cero POST/PATCH/DELETE).
2. **RBAC desde el contrato.** Lo creable/conocido sale de `/api/v1/resources` (ya proyectado por
   permiso). Sin permiso o recurso desconocido → `blocked` con motivo, **no** se descarta en silencio.
3. **Reparto determinista por confianza** (task-plan / extracción→prefill): `>= 0.8` listo / `>= 0.5`
   sugerido / `< 0.5` descartado. Mismos umbrales en todo el frontend.
4. **Fuera de esquema se descarta, nunca se inventa.** Los campos propuestos que no existen en el
   esquema de creación caen en `dropped_fields`/`dropped_args`.
5. **Ausencia ≠ negativo.** Un campo/ítem ausente queda vacío/pendiente; nunca se asume un valor (p.
   ej. la checklist no asume "hecho"; el diff no toca lo no propuesto).

## Cómo añadir una superficie nueva (checklist)

1. Módulo puro en `src/core/agent/tools/<nombre>.ts` (validación determinista + tipo `*Spec` con
   `kind` nuevo). Reutiliza `reviewContextFromCatalog` para RBAC; **no** dupliques el parseo del
   catálogo.
2. Añade la `kind` a la unión `UiSpec` y a `isUiSpec` (`ui-spec.ts`).
3. Añade la rama de render en `GeneratedUi` con primitivos seguros (sin HTML crudo).
4. Registra la tool `ui.*` de **lectura** en `registry.ts` (sin `approval`).
5. Test unitario + encadénalo en `check:canonical`; si toca la tubería, extiende el e2e.
