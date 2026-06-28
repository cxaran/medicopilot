from typing import Optional

from backend.app.schemas.base import ApiSchema


class PubMedArticle(ApiSchema):
    """Artículo de PubMed normalizado desde las E-utilities de NCBI.

    Es material de INVESTIGACIÓN/evidencia, no datos del expediente. El ``abstract``
    puede venir vacío en los listados (solo se trae en el detalle por ``efetch``).
    """

    pmid: str
    title: str
    authors: list[str] = []
    year: Optional[str] = None
    source: Optional[str] = None
    abstract: Optional[str] = None
    citation: str


class PubMedSearchResponse(ApiSchema):
    """Resultado de búsqueda en PubMed: la consulta, el conteo y los artículos."""

    query: str
    count: int
    articles: list[PubMedArticle] = []
