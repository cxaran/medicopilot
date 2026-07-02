# Tareas en segundo plano con Taskiq (base mínima)

## Qué es y qué problema resuelve

MedicoPilot necesita una vía para ejecutar trabajo **fuera del ciclo request/response** de
FastAPI (en el futuro: respaldos, correos informativos, notificaciones, recordatorios,
limpiezas programadas). Esta base lo resuelve con [Taskiq](https://taskiq-python.github.io/)
sobre **PostgreSQL** — sin Redis, Celery ni infraestructura adicional: la cola vive en la
misma base de datos que ya opera el consultorio.

Es una **capacidad de plataforma**, no un módulo clínico: hoy no la consume ningún flujo de
negocio y no toca pacientes, consultas, recetas ni permisos.

## Principio arquitectónico

La API y los procesos de fondo están **separados por diseño**:

```
proceso FastAPI                 procesos Taskiq (profile "taskiq")
──────────────                  ──────────────────────────────────
(futuro productor)              taskiq-worker    → ejecuta tareas
   task.kiq() ──► PostgreSQL ◄─ taskiq-scheduler → encola las programadas (cron)
                 (tabla del broker)
```

- FastAPI **nunca** levanta el worker ni el scheduler (ni con lifespan, ni con
  `BackgroundTasks`). Son servicios Docker propios, opt-in por profile.
- El broker usa un canal y una tabla **propios** (`medicopilot_taskiq`,
  `medicopilot_taskiq_messages`). La tabla la crea el broker en su `startup()`; **no** hay
  migración Alembic ni modelo SQLAlchemy — no forma parte del esquema de la aplicación.
- El broker reutiliza el `postgres_dsn` existente convertido con `make_url`
  (`postgresql+psycopg2://…` → `postgresql://…`); usa psycopg v3 internamente y convive
  con el psycopg2 del resto del backend. El DSN contiene la contraseña: **no se loguea**.

## Piezas (todas en `backend/app/taskiq_app.py`)

| Pieza | Qué hace |
| --- | --- |
| `taskiq_dsn(dsn)` | Convierte el DSN de SQLAlchemy al que espera psycopg (drivername `postgresql`), conservando credenciales, host, base y query params. |
| `build_schedule(...)` | Schedule **estático** por label. Apagado ⇒ lista vacía (el scheduler arranca sin programar nada). |
| `broker` | `PsycopgBroker` único. Sin result backend ni serializer custom. Importar el módulo **no** abre conexiones. |
| `system.noop` | Única tarea registrada: deja un log y nada más (sin red, DB, archivos ni módulos clínicos). Existe para verificar el ciclo completo. |
| `scheduler` | `TaskiqScheduler` con `LabelScheduleSource` (lee los schedules declarados como labels de las tareas). Sin fuentes dinámicas. |

## Configuración (apagada por defecto)

```env
TASKIQ_SCHEDULE_ENABLED=false   # default: el cron NO corre hasta habilitarlo por ambiente
TASKIQ_CRON=0 2 * * *           # expresión cron de system.noop cuando se habilita
TASKIQ_TIMEZONE=America/Monterrey  # zona IANA explícita del schedule (cron_offset)
```

Garantías con los defaults:

- La API arranca y responde **exactamente igual** que antes (los settings tienen defaults
  seguros; cero cambios de OpenAPI/recursos/permisos).
- Worker y scheduler arrancan sin ejecutar nada programado.
- Los datetimes del schedule se interpretan con la zona IANA del setting, nunca con la
  hora local implícita del proceso.

## Cómo ejecutar el worker y el scheduler

Servicios Docker **opt-in** (no se levantan con `docker compose up` normal):

```bash
docker compose -f compose.dev.yml --profile taskiq up taskiq-worker taskiq-scheduler
```

- `taskiq-worker`: `taskiq worker backend.app.taskiq_app:broker --workers 1 --max-async-tasks 1`
- `taskiq-scheduler`: `taskiq scheduler backend.app.taskiq_app:scheduler --skip-first-run`
  — mantener **una sola réplica** del scheduler.

Localmente (venv activo, desde la raíz del repo) los mismos comandos funcionan sin Docker.

Nota del primer arranque: si worker y scheduler arrancan a la vez sobre una base donde la
tabla del broker aún no existe, ambos ejecutan su `CREATE TABLE IF NOT EXISTS` y PostgreSQL
puede lanzar `UniqueViolation` en `pg_type` (carrera conocida de Postgres). El
`restart: unless-stopped` del compose la absorbe: el segundo intento encuentra la tabla.

## Cómo probar el ciclo completo (sin frontend)

```bash
docker compose -f compose.dev.yml run --rm --no-deps backend python -c "
import asyncio
from backend.app.taskiq_app import broker, system_noop

async def main():
    await broker.startup()
    task = await system_noop.kiq()
    print('encolada:', task.task_id)
    await broker.shutdown()

asyncio.run(main())
"
docker logs medicopilot-dev-taskiq-worker-1 | tail -3
# → "Executing task system.noop with ID: …" y "Taskiq task executed"
```

Tests: `backend/tests/test_taskiq_app.py` (unitarios de DSN/schedule/importación aislada +
integración real de `startup`/`shutdown` del broker contra el Postgres de pruebas, con
canal y tabla temporales). Correr con la suite backend habitual; la integración requiere
`TEST_POSTGRES_URL` apuntando a una base `*_test`.

## Cómo registrar una tarea nueva

1. Añadir la función en `backend/app/taskiq_app.py` con nombre estable namespaced:

   ```python
   @broker.task(task_name="system.mi_tarea")
   async def system_mi_tarea(...) -> None:
       ...
   ```

2. Si es programada, declarar el schedule como label (`schedule=[{"cron": ...,
   "cron_offset": <zona IANA>, "schedule_id": "<nombre>.cron"}]`), idealmente detrás de un
   setting apagado por defecto, como `system.noop`.
3. Reglas de contenido: los argumentos y resultados de las tareas **no deben llevar PHI ni
   texto clínico libre** (usar referencias mínimas: ids). Nada de secretos en logs.
4. Para encolar desde la API en el futuro: `await mi_tarea.kiq(...)` — el proceso productor
   debe hacer `broker.startup()` una vez en su ciclo de vida; ese seam se decidirá cuando
   exista el primer productor real (hoy ningún endpoint encola).

## Qué queda explícitamente fuera de esta base

- Result backend y tablas de resultados (las tareas no devuelven valores consultables).
- Schedules dinámicos en base de datos (`PsycopgScheduleSource`): el schedule es estático
  por label.
- Productores reales: ningún endpoint, flujo clínico ni evento encola tareas todavía.
- Google Drive/OAuth, SMTP/correos reales, push/WebSockets, respaldos reales,
  recordatorios de citas: son fases futuras que se montarán **sobre** esta base como
  tareas registradas, sin rediseñar nada.
- Redis, Celery, RabbitMQ, `taskiq-fastapi` y cualquier acople al lifespan de FastAPI.
