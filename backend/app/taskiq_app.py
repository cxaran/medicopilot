"""Módulo Taskiq del backend: broker PostgreSQL, tarea inocua y scheduler estático.

Base MÍNIMA de tareas en segundo plano. El worker y el scheduler corren en procesos
PROPIOS (servicios Docker con profile "taskiq"); FastAPI NO los levanta ni conoce este
módulo. La cola vive en PostgreSQL (canal/tabla dedicados del broker), sin Redis ni
Celery, y reutiliza el ``postgres_dsn`` existente (el broker usa psycopg v3; el resto
del backend sigue en psycopg2).

Única tarea registrada: ``system.noop`` — no toca base de datos, archivos, red ni
módulos clínicos; sólo deja un log. Su schedule por cron viene APAGADO por defecto
(``TASKIQ_SCHEDULE_ENABLED=false``): worker y scheduler arrancan sin ejecutar nada
programado hasta habilitarlo explícitamente por ambiente.

Ejecución (ver compose, profile "taskiq"):
    taskiq worker backend.app.taskiq_app:broker --workers 1 --max-async-tasks 1
    taskiq scheduler backend.app.taskiq_app:scheduler --skip-first-run
"""

import logging

from sqlalchemy.engine import make_url
from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_pg.psycopg import PsycopgBroker

from backend.app.core.settings import settings

logger = logging.getLogger(__name__)


def taskiq_dsn(postgres_dsn: str) -> str:
    """DSN para el broker a partir del DSN de SQLAlchemy del proyecto.

    Cambia sólo el drivername a ``postgresql`` (psycopg no acepta el sufijo
    ``+psycopg2`` de SQLAlchemy) conservando usuario, contraseña, host, puerto, base
    y parámetros. Vía ``make_url`` — nunca reemplazos manuales de strings. El DSN
    contiene la contraseña: no loguearlo.
    """
    url = make_url(postgres_dsn)
    return url.set(drivername="postgresql").render_as_string(
        hide_password=False,
    )


def build_schedule(
    *,
    enabled: bool,
    cron: str,
    timezone: str,
) -> list[dict[str, str]]:
    """Schedule ESTÁTICO por label de la tarea. Apagado -> lista vacía (el scheduler
    arranca pero no programa nada). La zona horaria es IANA explícita por schedule
    (``cron_offset``); nunca la hora local implícita del proceso."""
    if not enabled:
        return []

    return [
        {
            "cron": cron,
            "cron_offset": timezone,
            "schedule_id": "system.noop.cron",
        },
    ]


# Broker único sobre PostgreSQL, con canal y tabla EXPLÍCITOS y propios (no toca tablas
# clínicas ni de la app). Sin result backend ni serializer custom. El ciclo de vida
# (startup/shutdown) lo maneja el CLI de taskiq en el proceso del worker/scheduler;
# importar este módulo NO abre conexiones.
broker = PsycopgBroker(
    dsn=taskiq_dsn(str(settings.postgres_dsn)),
    channel_name="medicopilot_taskiq",
    table_name="medicopilot_taskiq_messages",
)


@broker.task(
    task_name="system.noop",
    schedule=build_schedule(
        enabled=settings.taskiq_schedule_enabled,
        cron=settings.taskiq_cron,
        timezone=settings.taskiq_timezone,
    ),
)
async def system_noop() -> None:
    """Tarea inocua para verificar el ciclo completo (encolar -> worker -> log).

    Sin parámetros, sin base de datos, sin archivos, sin red, sin módulos clínicos y
    sin información sensible en el log.
    """
    logger.info("Taskiq task executed", extra={"task_name": "system.noop"})


# Scheduler estático: lee los schedules declarados como LABELS de las tareas de este
# broker. Sin fuentes dinámicas ni tablas de schedules.
scheduler = TaskiqScheduler(
    broker=broker,
    sources=[LabelScheduleSource(broker)],
)
