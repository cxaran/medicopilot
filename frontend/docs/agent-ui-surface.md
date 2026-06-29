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
