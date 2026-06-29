"""Búsqueda y emparejamiento DETERMINISTA de pacientes (sin LLM, sin extensiones de Postgres).

Es la pieza clave de la épica conversación→expediente: dadas señales de identidad (nombre,
teléfono, CURP, fecha de nacimiento, correo) puntúa candidatos ya existentes para que el médico
ELIJA una coincidencia o cree un expediente nuevo. Nunca inventa una coincidencia: por debajo del
umbral devuelve vacío y deja que el llamador cree.
"""

from backend.app.patient_search.search import (
    CandidateInput,
    ScoredCandidate,
    SearchQuery,
    normalize_phone,
    rank_candidates,
    score_candidate,
)

__all__ = [
    "CandidateInput",
    "ScoredCandidate",
    "SearchQuery",
    "normalize_phone",
    "rank_candidates",
    "score_candidate",
]
