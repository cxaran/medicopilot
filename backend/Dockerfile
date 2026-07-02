ARG PYTHON_VERSION=3.12-slim

FROM python:${PYTHON_VERSION} AS deps

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Herramientas de RESPALDO (misma imagen para API, worker y scheduler):
# - postgresql-client-16 (pg_dump/pg_restore compatibles con el Postgres 16 del stack;
#   el de bookworm es 15 y pg_dump exige versión >= a la del servidor) vía repo PGDG.
# - age: cifrado del archivo de respaldo con la clave PÚBLICA del administrador (la
#   privada nunca entra a la imagen ni al repositorio).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl age \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM deps AS dev
COPY . backend/
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM deps AS prod
COPY . backend/
EXPOSE 8000
CMD ["gunicorn", "backend.app.main:app", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "4"]
