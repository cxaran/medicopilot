"""Proxy server-side de investigación PubMed (E-utilities de NCBI).

SEPARACIÓN DE AUTORIDAD: PubMed es INVESTIGACIÓN/evidencia y NO toca el expediente
clínico, por eso se resuelve server-side (a diferencia del acceso clínico estilo FHIR,
que va por el navegador→FastAPI con la cookie del médico). Requiere sesión válida para
no exponer un proxy abierto. La API key de NCBI (si se configura) NUNCA se loguea.

Equivalente nativo a un MCP-server de PubMed (p.ej. cyanheads/pubmed): el servidor MCP
real puede enchufarse después detrás de este mismo contrato. El HTTP a NCBI va por un
único punto (``_http_get``) que los tests mockean (sin llamadas reales).
"""

from typing import Any

import httpx
from fastapi import APIRouter, Query, status

from backend.app.api.resource_actions import api_error
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.settings import settings
from backend.app.schemas.research import PubMedArticle, PubMedSearchResponse

router = APIRouter(prefix="/research", tags=["research"])


def _http_get(url: str, params: dict[str, str]) -> httpx.Response:
    """Único punto HTTP hacia NCBI (mockeable en tests). No loguea params ni respuesta."""
    return httpx.get(url, params=params, timeout=httpx.Timeout(settings.ncbi_timeout_seconds))


def _with_api_key(params: dict[str, str]) -> dict[str, str]:
    key = settings.ncbi_api_key
    if key is not None and key.get_secret_value().strip():
        params = {**params, "api_key": key.get_secret_value()}
    return params


def _eutils(endpoint: str, params: dict[str, str]) -> httpx.Response:
    url = f"{settings.ncbi_base_url.rstrip('/')}/{endpoint}"
    try:
        response = _http_get(url, _with_api_key(params))
    except httpx.HTTPError as exc:
        # No se incluye detalle de la excepción para no arriesgar fugas (p.ej. la URL
        # con la api_key en query). Mensaje estable para el modelo/médico.
        raise _PubMedError() from exc
    if response.status_code >= 400:
        raise _PubMedError()
    return response


class _PubMedError(Exception):
    """Fallo al consultar NCBI; se traduce a 502 sin filtrar secretos."""


def _format_citation(
    authors: list[str], title: str, source: str | None, year: str | None
) -> str:
    """Cita compacta estilo Vancouver-lite a partir de los campos del resumen."""
    parts: list[str] = []
    if authors:
        shown = ", ".join(authors[:3])
        if len(authors) > 3:
            shown += ", et al"
        parts.append(f"{shown}.")
    if title:
        parts.append(f"{title.rstrip('.')}.")
    tail = " ".join(p for p in (source, year) if p)
    if tail:
        parts.append(f"{tail}.")
    return " ".join(parts).strip()


def _article_from_summary(uid: str, entry: dict[str, Any], *, abstract: str | None = None) -> PubMedArticle:
    raw_authors = entry.get("authors") or []
    authors = [
        str(a.get("name"))
        for a in raw_authors
        if isinstance(a, dict) and a.get("name")
    ]
    pubdate = str(entry.get("pubdate") or "")
    year = pubdate.split(" ")[0] if pubdate else None
    title = str(entry.get("title") or "").strip()
    source = entry.get("source") or entry.get("fulljournalname")
    source_str = str(source) if source else None
    return PubMedArticle(
        pmid=uid,
        title=title,
        authors=authors,
        year=year or None,
        source=source_str,
        abstract=abstract,
        citation=_format_citation(authors, title, source_str, year or None),
    )


def _esearch(query: str, limit: int) -> tuple[list[str], int]:
    response = _eutils(
        "esearch.fcgi",
        {"db": "pubmed", "term": query, "retmode": "json", "retmax": str(limit)},
    )
    data = response.json()
    result = data.get("esearchresult", {}) if isinstance(data, dict) else {}
    idlist = [str(pmid) for pmid in result.get("idlist", []) if pmid]
    try:
        count = int(result.get("count", len(idlist)))
    except (TypeError, ValueError):
        count = len(idlist)
    return idlist, count


def _esummary(pmids: list[str]) -> dict[str, Any]:
    if not pmids:
        return {}
    response = _eutils(
        "esummary.fcgi",
        {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"},
    )
    data = response.json()
    result = data.get("result", {}) if isinstance(data, dict) else {}
    return result if isinstance(result, dict) else {}


def _efetch_abstract(pmid: str) -> str | None:
    response = _eutils(
        "efetch.fcgi",
        {"db": "pubmed", "id": pmid, "rettype": "abstract", "retmode": "text"},
    )
    text = response.text.strip()
    return text or None


@router.get("/pubmed", response_model=PubMedSearchResponse)
def search_pubmed(
    current_user: CurrentUser,
    query: str = Query(min_length=1, max_length=400, description="Términos de búsqueda."),
    limit: int = Query(default=10, ge=1, le=50, description="Máximo de artículos (1-50)."),
) -> PubMedSearchResponse:
    try:
        pmids, count = _esearch(query, limit)
        summaries = _esummary(pmids)
    except _PubMedError:
        api_error(status.HTTP_502_BAD_GATEWAY, "pubmed_unavailable", "No se pudo consultar PubMed.")

    articles: list[PubMedArticle] = []
    for pmid in pmids:
        entry = summaries.get(pmid)
        if isinstance(entry, dict):
            articles.append(_article_from_summary(pmid, entry))
    return PubMedSearchResponse(query=query, count=count, articles=articles)


@router.get("/pubmed/{pmid}", response_model=PubMedArticle)
def get_pubmed_article(
    pmid: str,
    current_user: CurrentUser,
) -> PubMedArticle:
    if not pmid.isdigit():
        api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_pmid", "El PMID debe ser numérico.")
    try:
        summaries = _esummary([pmid])
        entry = summaries.get(pmid)
        if not isinstance(entry, dict) or entry.get("error"):
            api_error(status.HTTP_404_NOT_FOUND, "article_not_found", "Artículo de PubMed no encontrado.")
        abstract = _efetch_abstract(pmid)
        return _article_from_summary(pmid, entry, abstract=abstract)
    except _PubMedError:
        api_error(status.HTTP_502_BAD_GATEWAY, "pubmed_unavailable", "No se pudo consultar PubMed.")
