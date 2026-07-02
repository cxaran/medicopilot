# Respaldos configurables cifrados hacia Google Drive

## Qué hace

Respaldo **diario configurable** de la base de datos PostgreSQL del consultorio,
**cifrado en el dispositivo** antes de salir, subido a **una** cuenta de Google Drive
del administrador, con retención diaria/mensual/anual y rotación que nunca borra
copias protegidas. Apagado por defecto (`BACKUPS_ENABLED=false` y el singleton se
siembra con `enabled=false`).

## Arquitectura en una vista

```
Taskiq scheduler ── cada minuto (cron FIJO, UTC) ──► backups.tick
                                                        │
                              PostgreSQL = fuente de verdad funcional
                              backup_settings.next_run_at   (horario editable)
                              backup_runs.next_attempt_at   (reintentos)
                                                        │
                                            sólo procesa trabajo VENCIDO
                                                        │
        pg_dump -Fc ─► pg_restore --list ─► manifest ─► tar ─► age ─► Drive
```

- **Taskiq no guarda el horario del usuario.** El tick por minuto consulta la tabla;
  cambiar hora/zona/retención o reconectar Drive **no** requiere reiniciar nada.
- El worker reclama ejecuciones con `SELECT … FOR UPDATE SKIP LOCKED` + **lease**
  (`BACKUP_RUN_LEASE_MINUTES`): dos workers no procesan el mismo respaldo y un worker
  muerto se recupera al expirar el lease.
- La API sólo **registra intenciones** (editar configuración, encolar respaldo
  manual) y su lifespan inicia el broker únicamente para *publicar* el kick del tick.

## Cifrado (dos capas, dos propósitos)

| Qué | Con qué | Dónde vive la clave |
| --- | --- | --- |
| El **archivo** del respaldo | binario `age`, clave PÚBLICA (`age_recipient`) | La identidad privada la conserva el administrador **fuera del sistema** (jamás se acepta ni se guarda) |
| El **refresh token** de Google en reposo | Fernet (`BACKUP_TOKEN_ENCRYPTION_KEY`) | Sólo en el `.env` del despliegue; nunca en PostgreSQL |

El recipient se valida invocando `age` con entrada vacía. El archivo final es
`{prefix}-{timestampUTC}-{run8}.tar.age` (sin plantillas libres) y contiene
`database.dump` (pg_dump formato custom, restaurable con `pg_restore`) y
`manifest.json` (versión de formato, run id, fecha, sha del dump — **sin** datos
clínicos, usuarios, tokens ni rutas).

**Restauración (manual, fuera de la UI en esta fase):** descargar el `.tar.age`,
`age --decrypt -i <identidad-privada>`, extraer el tar y `pg_restore` del dump.

## Google Drive

- OAuth con scope **`drive.file`** únicamente (acceso a archivos creados por la app;
  nunca a todo el Drive). `access_type=offline` + `prompt=consent` para obtener
  refresh token. El `state` se guarda **hasheado** (SHA-256), expira en 10 minutos y
  se consume una sola vez.
- Carpeta **visible** "MediCopilot Backups" creada por la app (no `appDataFolder`);
  en reconexión se valida la carpeta guardada y se crea una nueva si ya no existe.
- Subida **resumible** con `appProperties` (`medicopilot_backup_run_id` + sha256):
  si una carga terminó en Google pero la respuesta se perdió, el reintento
  **reconcilia** por run id + checksum en vez de duplicar.

## Estados y reintentos

`backup_runs.status`: `queued → running → succeeded | retrying | failed`, más
`skipped` (ventana saltada visiblemente, p. ej. Drive desconectado) y `pruned`
(archivo remoto rotado por retención; la fila del historial se conserva).

- Error **temporal** (red, 5xx/429, pg_dump caído): `retrying` con backoff
  **+5 min → +30 min**; al agotar `BACKUP_MAX_ATTEMPTS` (3) → `failed`.
- **`needs_reauth`** (Google revocó/invalidó la credencial): la ejecución falla
  terminal, `drive_status=needs_reauth` y **no hay más reintentos ni ventanas** hasta
  que el administrador reconecte. Las ventanas siguientes quedan `skipped` en el
  historial.
- Error **permanente** (configuración incompleta, recipient inválido): `failed`
  directo.
- **Alerta persistente**: todo desenlace fallido escribe
  `backup_settings.last_error_code/summary/at` (y el estado de Drive); el primer
  éxito posterior la despeja. La UI genérica del recurso la muestra — no hay centro
  de notificaciones en esta fase.

Los resúmenes de error son SEGUROS: jamás tokens, contraseñas, rutas, argumentos de
`pg_dump` ni texto crudo de Google (el detalle técnico vive sólo en logs internos).

## Retención

Cada éxito recibe roles en **fechas locales** (zona configurada): `daily` siempre;
`monthly` si es el primero exitoso de su mes; `yearly` si es el primero de su año.
Tras cada éxito se rota: se protegen los N más recientes de cada rol
(`retention_daily_count`/`monthly`/`yearly`) y sólo se borra de Drive lo que **ningún
rol** protege. Desconectar Drive nunca borra archivos remotos.

## Superficie de administración

Recursos declarativos (UI genérica existente, sin pantallas a medida):

- **`backup_settings`** (singleton editable con `backups:configure`): hora diaria,
  zona IANA, prefijo, retenciones, recipient de age, interruptor `enabled` (sólo se
  puede activar con Drive activo + carpeta + recipient + claves del despliegue).
  Acciones: **Conectar Google Drive** (devuelve `authorization_url`; el frontend
  redirige), **Desconectar** (apaga y olvida token/carpeta; conserva historial y
  archivos) y **Respaldar ahora** (encola manual y despierta el tick).
- **`backup_runs`** (solo lectura con `backups:read`): historial con estado, origen,
  ventana, archivo, tamaño, roles de retención, intentos y error.

Callback OAuth: `GET /api/v1/backups/google-drive/callback` (exige la sesión del
administrador) → redirige a `/resources/backup_settings?drive=connected|error`.

## Configuración del despliegue

```env
BACKUPS_ENABLED=false            # interruptor global del tick
BACKUP_TEMP_DIR=/tmp/medicopilot-backups
BACKUP_RUN_LEASE_MINUTES=120
BACKUP_MAX_ATTEMPTS=3

GOOGLE_DRIVE_CLIENT_ID=          # app OAuth "web" de Google Cloud
GOOGLE_DRIVE_CLIENT_SECRET=      # sólo .env; nunca en PostgreSQL
GOOGLE_DRIVE_REDIRECT_URI=       # …/api/v1/backups/google-drive/callback

BACKUP_TOKEN_ENCRYPTION_KEY=     # Fernet: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

La imagen backend incluye `postgresql-client-16` (pg_dump/pg_restore) y `age`;
API, worker y scheduler usan la **misma imagen** (profile `taskiq` del compose).

## Puesta en marcha

1. Configurar el `.env` (bloque de arriba) y `BACKUPS_ENABLED=true`.
2. Aplicar la migración (`docker compose --profile migrate run --rm migrate`).
3. Levantar worker y scheduler: `docker compose --profile taskiq up -d taskiq-worker taskiq-scheduler`.
4. En la UI (`/resources/backup_settings`): pegar el **recipient público de age**,
   Conectar Google Drive (consent), ajustar hora/retención y activar.
5. Probar con **Respaldar ahora** y revisar `/resources/backup_runs`.

## Fuera de alcance de esta fase

Correos y push, centro de notificaciones, múltiples destinos/cuentas, restauración
desde UI, selección libre de carpeta (Google Picker), cron editable, respaldos
incrementales/PITR (`pg_basebackup`/WAL), `pg_dumpall` (se respalda **una** base, sin
roles globales del clúster) y schedulers dinámicos de Taskiq.
