# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repositorio

MedicoPilot es un Expediente Clínico Electrónico local para consultorio médico con copiloto de IA. Ver `README.md` para el alcance funcional completo (en español). Principio rector del producto: **toda salida de IA es un borrador que el médico debe revisar y aprobar**; la IA nunca diagnostica, receta ni guarda información final de forma autónoma.

Monorepo con dos servicios independientes (distinto lenguaje y toolchain, sin código compartido):

- `backend/` — Python. Modelos de datos (SQLAlchemy ORM) + migraciones Alembic sobre PostgreSQL. En estado baseline: solo capa de modelos y migración inicial, aún sin API/runtime.
- `model-gateway/` — TypeScript/Node ≥22. Runtime de inferencia provider-neutral (MG-001): valida sesión de navegador, negocia capacidades de modelo, valida presupuesto de contexto y hace relay de tool calls vía WebSocket. Ver `model-gateway/README.md` para los límites de MG-001.

## model-gateway (TypeScript)

Comandos (ejecutar dentro de `model-gateway/`):

- `npm run dev` — servidor con recarga (`tsx watch src/main.ts`), escucha en :8081.
- `npm run build` — bundle con tsup a `dist/`.
- `npm start` — corre `dist/main.js` (requiere build previo).
- `npm test` — suite completa con Vitest (`vitest run`).
- `npm run typecheck` — `tsc --noEmit`.
- Un solo test: `npx vitest run tests/unit/redact.test.ts` o filtrar por nombre con `-t "<patrón>"`.

Arquitectura hexagonal; las dependencias apuntan hacia adentro. Capas en `src/`:

- `domain/` — tipos puros del dominio (turn, message, model, tool, usage, provider). Sin dependencias de framework.
- `ports/` — interfaces que el dominio/aplicación necesitan (`*.port.ts`): control-plane, model-catalog, provider-adapter/registry, rate-limiter, telemetry, turn-store.
- `application/` — casos de uso: `turns/` (start-turn, resume-turn-after-tool, y la máquina de estados `turn-state-machine.ts`), `capabilities/` (negociación, normalización, presupuesto de contexto), `browser-sessions/`.
- `infrastructure/` — implementaciones concretas de los ports. En MG-001 son **in-memory y dev-only** (catálogo, turn-store, rate-limiter noop, telemetría pino, fake control-plane).
- `providers/` — adaptadores de proveedor. Solo existe `fake/`; se registran en `registry.ts`.
- `transport/` — `http/app.ts` (rutas Fastify: `/healthz`, `/readyz`, `/metrics`, browser-sessions, WS) y `websocket/` (handler + parser/schema del protocolo).
- `bootstrap/container.ts` — composición/DI: ensambla settings + todos los adaptadores en un `GatewayContainer`. Para cambiar una implementación, edita aquí.
- `config/settings.ts` — toda la config viene de env vars (ver `.env.example`); cada límite del protocolo tiene su variable `GATEWAY_*`.
- `kernel/` — utilidades transversales: `errors.ts` (`GatewayError` con código), `ids.ts`, `redact.ts`.

Flujo de un turn: el navegador abre WS (autenticado por cookie de sesión creada con `GATEWAY_DEV_TICKET`) → `turn.start` → `StartTurn` negocia capacidades y arranca el proveedor → si el modelo pide una tool, el turn pasa a `waiting_for_tool` y se devuelve la tool call al navegador → el navegador responde con el resultado → `ResumeTurnAfterTool`. Las transiciones válidas están centralizadas en `turn-state-machine.ts`; respétalas al tocar el ciclo de vida. Los turns son en memoria y no sobreviven a un reinicio.

Reglas MG-001 a respetar: nada de credenciales reales de proveedor, nada de Redis/FastAPI/Anthropic/OpenAI real. **Los logs no deben incluir prompts, resultados de tools, cookies, headers de autorización, API keys ni argumentos completos de tools** (usar `kernel/redact.ts`). `/metrics` es interno, nunca exponer públicamente.

## backend (Python)

No hay venv ni runner de tests versionados; pyright espera el venv en `backend/venv` (`pyrightconfig.json`). El paquete se importa como `backend.app.*` desde la raíz del repo (no desde `backend/`).

Setup y comandos (ejecutar desde la **raíz del repo**, con el venv activo):

- Instalar deps: `pip install -r backend/requirements.txt`.
- Type-check: `pyright` (config en `pyrightconfig.json`).
- Migraciones (Alembic lee `backend/alembic.ini`, que hace `prepend_sys_path = .`):
  - Aplicar: `alembic -c backend/alembic.ini upgrade head`
  - Autogenerar: `alembic -c backend/alembic.ini revision --autogenerate -m "mensaje"`
- Config por env vars (`POSTGRES_*`, `ENVIRONMENT`); ver `.env.example`. La DSN se compone en `backend/app/core/settings.py`.

Arquitectura y convenciones de los modelos (`backend/app/models/`):

- Los modelos son clases **SQLAlchemy ORM** (`Mapped` / `mapped_column`) que heredan de `Base` (`models/base.py`, un `DeclarativeBase` con `NAMING_CONVENTION` de constraints). Nota: aunque `requirements.txt` incluye `sqlmodel`, los modelos actuales usan SQLAlchemy puro, no clases `SQLModel`.
- **Todo modelo nuevo debe importarse en `models/__init__.py`**; ese módulo es el que `alembic/env.py` carga como `target_metadata`, así que un modelo no listado ahí no aparece en autogenerate.
- Patrones que se repiten en cada tabla y deben mantenerse: PK `uuid` (`PG_UUID`), columnas de auditoría (`created_at/created_by`, `updated_at/updated_by`) y **soft-delete** (`deleted_at/deleted_by`); las FK de auditoría apuntan a `user.id` con `ondelete="RESTRICT"`.
- Los enums (`models/enums.py`) se persisten como **enums no nativos** (`native_enum=False`, `create_constraint=True`, `values_callable=enum_values`) → se materializan como `VARCHAR` + CHECK constraint, no como tipos ENUM de Postgres.
- Comentarios, docstrings y `comment=` de columnas se escriben **en español** (dominio clínico); mantener ese estilo.
