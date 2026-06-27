# Plan de fusión: platform-core → MedicoPilot

> Estado: propuesta. Objetivo: convertir MedicoPilot en `platform-core` (infraestructura) + dominio clínico actual + `model-gateway` (copiloto IA), fusionando **dentro** del repo MedicoPilot.

## Contexto y hallazgo clave

`platform-core` es una plantilla full-stack madura y lista para producción (FastAPI + Next.js 16, RBAC declarativo, motor de query allowlist, frontend capability-driven, suites E2E). MedicoPilot hoy solo tiene la capa de modelos SQLAlchemy + Alembic, sin runtime.

**Hallazgo decisivo:** la capa de identidad de MedicoPilot (`models/user.py`: `User`/`Role`/`UserRole`/`RoleAccess`, tablas `user`/`role`/`user_role`/`role_access`) es **idéntica** a la de platform-core. MedicoPilot fue derivado de platform-core y se le añadieron 15 modelos clínicos encima. Las FKs de auditoría de los modelos clínicos ya apuntan a `user.id`. Por tanto:

- **No hay conflicto de modelos de identidad.** Solo se trae la infraestructura de platform-core que opera sobre esas tablas.
- La fusión es **aditiva**: copiar capas de platform-core que MedicoPilot no tiene + exponer el dominio clínico como recursos.

Única micro-diferencia de identidad a alinear: `User.updated_at`/`Role.updated_at`/etc. en MedicoPilot usan `onupdate=func.now()`; platform-core no (setea `updated_at` manualmente vía `touch_entity`). Decisión: **alinear los modelos de identidad de MedicoPilot a la definición exacta de platform-core** (quitar `onupdate`) para que los helpers de `resource_actions.py` funcionen sin sorpresas.

## Decisiones ya tomadas (por el usuario)

1. **Soft-delete:** mantener `deleted_at`/`deleted_by` en el dominio clínico. ✅
2. **Dominio clínico:** conservar los 15 modelos clínicos de MedicoPilot sobre la infraestructura de platform-core. ✅
3. **model-gateway:** permanece como tercer servicio independiente. ⏸ Integración en fase posterior.
4. **Config:** agregar todas las env vars que requiere platform-core. ✅

## Reconciliación de convenciones

### Soft-delete (dos convenciones, intencional)
- **Identidad** (`user`/`role`/`role_access`): conservar `is_active` (booleano). **No tocar**: el auth, `admin_survival.py`, `session_invalidation.py` y el helper `deactivate_entity` dependen de `is_active`.
- **Clínico** (`patients`, `consultations`, etc.): conservar `deleted_at`/`deleted_by`.
- **Acción requerida:** el helper `deactivate_entity` de platform-core solo voltea `is_active`. Para recursos clínicos hace falta un helper nuevo `soft_delete_entity(entity, current_user)` que setee `deleted_at=utc_now()` + `deleted_by=current_user.id`. Añadir en `app/api/resource_actions.py`.
- **Motor de query:** los listados de recursos clínicos deben excluir `deleted_at IS NOT NULL` por defecto. Pasar un `stmt` base con ese filtro a `paginate_resource`/`ListQueryContract.paginate` (que ya acepta `stmt=`). Verificar que `count_strategies` respete el `stmt`.

### Nombres de tabla (mixto, ya coexiste hoy)
- Identidad en **singular** (`user`, `role`) — de platform-core.
- Clínico en **plural** (`patients`, `doctors`, `consultations`) — de MedicoPilot.
- Se mantiene tal cual; ya conviven en el MedicoPilot actual. No forzar uniformidad.

### Enums
- platform-core no usa enums no-nativos; MedicoPilot sí (`native_enum=False` + CHECK, vía `enum_values`). Mantener el patrón de MedicoPilot. Verificar que la **proyección de capabilities** (`app/resources/projection.py`) exponga correctamente los valores de enum como opciones de formulario/filtro `select` para el frontend.

## Plan por fases

### Fase 0 — Preparación
- Crear rama de trabajo.
- Inventariar qué tiene MedicoPilot hoy: solo `app/core/{database,settings}.py`, `app/models/*`, `alembic/*`. Todo lo demás de platform-core falta.
- Definir estrategia de migraciones: como aún no hay datos en producción, **re-baseline** de Alembic (borrar `ebf33ec14f29_initial.py` y autogenerar una migración inicial única con el metadata fusionado) es más limpio que encadenar.

### Fase 1 — Infraestructura backend (copiar de platform-core)
Copiar estas capas tal cual (operan sobre las tablas de identidad idénticas):
- `app/core/`: traer `redis.py`, `csrf.py`, `error_handlers.py`, `request_logging.py`, `bootstrap.py`. **Fusionar `settings.py`**: la de platform-core es superset (añade SECRET_KEY/JWT/SMTP/Redis/bootstrap a los `POSTGRES_*` actuales). Reemplazar `database.py` por la de platform-core (`SessionDep` de `sqlmodel.Session`).
- `app/auth/` completo (auth, dependencies, security, token_store, account_lock, register, forgot_password).
- `app/security/` completo (catalog, security_control, security_group, groups/, admin_survival, session_invalidation, rate_limit).
- `app/query/` completo (reutilizable tal cual).
- `app/api/` completo (`main` router chain, `v1/router.py`, `resource_actions.py`, `health.py`, routers de auth/bootstrap/permissions/roles/users/users_admin/resources).
- `app/schemas/` base (`base`, `error`, `pagination`, `capabilities`) + de identidad (`auth`, `role`, `user`, `user_admin`, `user_profile`, `bootstrap`, `health`).
- `app/resources/` (`registry.py`, `projection.py`).
- `app/bootstrap/` + `app/utils/` + `app/main.py`.
- Traer `models/setup.py` (`PlatformSetup`) — requerido por el bootstrap; MedicoPilot no lo tiene.
- **Alinear** `models/user.py` de MedicoPilot a la definición exacta de platform-core (quitar `onupdate`).
- **Fusionar** `models/__init__.py`: mantener el superset (identidad + clínico) y añadir `PlatformSetup`. Confirmar que `alembic/env.py` siga cargando `Base.metadata` con todo.
- `backend/requirements.txt`: fusionar (añadir fastapi, uvicorn, gunicorn, redis, PyJWT[crypto], passlib[bcrypt], argon2-cffi, fastapi-mail, python-multipart, tzdata a lo existente).
- `backend/Dockerfile` (multi-stage deps/dev/prod).
- `backend/tests/` (canonical_suite + módulos) — adaptar imports.

### Fase 2 — Reconciliar soft-delete (ver sección arriba)
- Añadir `soft_delete_entity` en `resource_actions.py`.
- Filtro base de exclusión de borrados lógicos en listados clínicos.
- Mantener `is_active` en identidad sin cambios.

### Fase 3 — Exponer dominio clínico como recursos
Para cada modelo clínico (patients, doctors, consultations, prescriptions, vital_signs, medical_history, clinical_documents, appointments, patient_clinical_items, medication_templates, consultation_ai_output, audit_event), siguiendo la convención de platform-core:
1. **Schemas** (`app/schemas/<recurso>.py`): `XCreate`/`XRead`/`XListItem`/`XUpdate`/`XReplace` sobre `ApiWriteSchema`/`ApiReadSchema`/`ApiPatchSchema`.
2. **QueryOptions/ResourceQuery**: allowlist de `filter_fields`/`sort_fields`/`search_fields` (solo lo declarado es consultable).
3. **Permisos**: nuevo grupo en `app/security/groups/` (p.ej. `PatientPermissions`, `ConsultationPermissions`...) → registrar en `app/security/catalog.py` (`SECURITY_GROUPS`) → actualizar `tests/test_security_catalog.py` (lista ordenada/única de permisos).
4. **Registro de recurso**: `ResourceDefinition` (+ acciones/relaciones) en `app/resources/registry.py`.
5. **Router**: usar los helpers de `resource_actions.py`; montar en `app/api/v1/router.py`. Endpoints de listado vía `ResourceQuery`.
6. Mapear roles del README (Doctor / Asistente / Administrador) a permisos: el Doctor con acceso clínico completo, la Asistente limitada a datos administrativos/citas/alta de pacientes, el Administrador a config + usuarios.

**Principio de producto a respetar:** las salidas de IA (`consultation_ai_output`) son borradores; el endpoint de aprobación debe requerir revisión de un `Doctor` activo (no autoguardado). Reflejarlo en permisos y estados (`AiOutputStatus`).

### Fase 4 — Frontend
- Copiar `frontend/` completo (Next.js 16 + React 19 + Tailwind v4, CRUD declarativo).
- Regenerar tipos OpenAPI (`npm run generate:api`) **después** de exponer los recursos clínicos.
- Las páginas `resources/[resourceName]/...` renderizan el CRUD clínico automáticamente desde las capabilities; idealmente **sin código por recurso**. Verificar render de campos clínicos (fechas, enums select, texto largo) y editores de relaciones (p.ej. consulta↔receta, paciente↔documentos).

### Fase 5 — Infraestructura raíz
- `compose.yml`, `compose.dev.yml`, `compose.e2e.yml` (nginx → frontend+backend, redis, postgres, mailpit).
- `nginx/nginx.conf`.
- **`.env.example`**: fusionar todas las variables (ver sección siguiente).
- `.opencode/skills/` (`platform-api-conventions`, `platform-query-schemas`) — portar y adaptar el nombre del proyecto.
- `pyrightconfig.json` (ya equivalente).

### Fase 6 — Integración model-gateway (⏸ PENDIENTE)
- Conservar `model-gateway/` como tercer servicio.
- Añadirlo a compose; nginx/frontend abre WebSocket hacia el gateway (`GATEWAY_PUBLIC_PATH_PREFIX=/model-gateway`).
- El frontend usa el flujo de turns para dictado/transcripción/generación de nota borrador (Fase 2 del README de producto).
- Mantener reglas MG-001 (sin proveedores reales aún; redacción de logs).
- *Detalle de cómo el frontend consume el gateway y dónde encaja el ticket de sesión: definir en su propio plan.*

### Fase 7 — Migraciones y verificación
- Re-baseline Alembic: `alembic -c backend/alembic.ini revision --autogenerate -m "fusion platform-core + dominio clinico"` y aplicar `upgrade head` sobre Postgres limpio.
- Backend: `python -m backend.tests.canonical_suite`.
- Frontend: `npm run check:canonical` + `npm run test:e2e:bootstrap`.
- `pyright` en verde.

## Env vars a agregar (de platform-core, sobre los `POSTGRES_*` actuales)

```
PROJECT_NAME=MedicoPilot
ENVIRONMENT=local
TRUSTED_BROWSER_ORIGINS=http://localhost:3000

SECRET_KEY=<secreto largo aleatorio>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
EMAIL_TOKEN_EXPIRE_MINUTES=30
TRYS_BEFORE_LOCK=5

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_SERVER / POSTGRES_PORT / POSTGRES_DB   # ya existen

SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM_EMAIL / SMTP_FROM_NAME / SMTP_TLS / SMTP_SSL / SMTP_USE_CREDENTIALS

BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_LAST_NAME / BOOTSTRAP_ADMIN_ROLE_NAME / BOOTSTRAP_USER_ROLE_NAME
BOOTSTRAP_SETUP_TOKEN=<token largo aleatorio>   # obligatorio en production
```
Más adelante (Fase 6), las `GATEWAY_*` de `model-gateway/.env.example`.

## Riesgos / puntos de atención

- **Re-baseline de Alembic** descarta la migración inicial actual; solo viable porque no hay datos productivos. Confirmar antes de borrar `ebf33ec14f29_initial.py`.
- **Filtro de soft-delete clínico**: si algún listado clínico olvida el `stmt` base, expondría registros borrados. Centralizar el scope.
- **`test_security_catalog`** asserta la lista exacta de permisos: cada permiso clínico nuevo debe actualizarse ahí o el suite falla (intencional).
- **Capabilities + enums no-nativos**: validar que `projection.py` traduzca los enums clínicos a opciones de formulario; es la diferencia principal con los datos de platform-core.
- **`CLAUDE.md`**: tras la fusión, reescribirlo (la estructura cambia radicalmente: tres servicios, stack FastAPI+Next, no "baseline solo-modelos").

## Orden de ejecución recomendado

Fase 0 → 1 → 2 → 7 (verificar que la base de platform-core arranca con identidad) → 3 (recurso por recurso, empezando por `patients`) → 4 → 5 → 6.
