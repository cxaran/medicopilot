"""Puntuación determinista de candidatos de paciente. Módulo PURO (sin ORM ni framework).

Estrategia: el llamador acota candidatos por SQL (exclusión de eliminados + identificadores) y
aquí se PUNTÚA en Python de forma determinista:

  - CURP exacta (normalizada) o teléfono coincidente = identificador único → máxima confianza.
  - Fecha de nacimiento coincidente y/o correo coinciden = corroboración fuerte.
  - Solapamiento de tokens del nombre (normalizado, sin acentos, insensible a mayúsculas) = afinidad.

El resultado trae un puntaje entero y un nivel (``exacto``/``fuerte``/``posible``). Por debajo del
umbral de inclusión NO se devuelve el candidato (no se fabrica una coincidencia falsa).
"""

from dataclasses import dataclass
from datetime import date
from typing import Optional
from uuid import UUID

from backend.app.quality_checks.base import normalize_text

# Pesos deterministas del puntaje (enteros, sin azar). Documentados para que el médico pueda
# entender por qué un candidato quedó arriba.
_W_CURP = 60
_W_PHONE = 45
_W_DOB = 25
_W_EMAIL = 15
_W_NAME = 40  # se multiplica por el solapamiento de tokens (0..1)

# Umbral de inclusión por nombre: al menos ~1 token compartido de 2-3 (Jaccard ≥ 0.34).
_NAME_INCLUDE_THRESHOLD = 0.34
# Umbral de nombre "bueno" para elevar a nivel ``fuerte`` junto con fecha/correo.
_NAME_STRONG_THRESHOLD = 0.5
# Mínimo de dígitos para considerar comparable un teléfono (evita falsos por sufijos cortos).
_PHONE_MIN_DIGITS = 7


def normalize_phone(value: Optional[str]) -> str:
    """Deja sólo los dígitos del teléfono (descarta espacios, guiones, paréntesis, '+')."""
    if not value:
        return ""
    return "".join(ch for ch in value if ch.isdigit())


def _normalize_curp(value: Optional[str]) -> str:
    return value.strip().upper() if value else ""


def _name_tokens(value: Optional[str]) -> frozenset[str]:
    if not value:
        return frozenset()
    return frozenset(tok for tok in normalize_text(value).split() if tok)


def _phones_match(a: str, b: str) -> bool:
    """Dos teléfonos coinciden si, normalizados a dígitos, son iguales o uno es sufijo del otro
    (tolera prefijo de país). Requiere un mínimo de dígitos para evitar falsos positivos."""
    if len(a) < _PHONE_MIN_DIGITS or len(b) < _PHONE_MIN_DIGITS:
        return False
    return a == b or a.endswith(b) or b.endswith(a)


def _name_overlap(a: frozenset[str], b: frozenset[str]) -> float:
    """Índice de Jaccard de los tokens del nombre (0..1). 0 si alguno está vacío."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


@dataclass(frozen=True)
class SearchQuery:
    """Señales de identidad de la búsqueda (todas opcionales; al menos una para buscar)."""

    name: Optional[str] = None
    phone: Optional[str] = None
    curp: Optional[str] = None
    birth_date: Optional[date] = None
    email: Optional[str] = None

    def has_any(self) -> bool:
        return any((self.name, self.phone, self.curp, self.birth_date, self.email))


@dataclass(frozen=True)
class CandidateInput:
    """Valores planos tomados de un expediente existente (sin ORM)."""

    id: UUID
    full_name: str
    birth_date: date
    sex: str
    phone: Optional[str] = None
    email: Optional[str] = None
    curp: Optional[str] = None


@dataclass(frozen=True)
class ScoredCandidate:
    """Candidato puntuado. ``tier`` resume la confianza; ``reasons`` cita qué coincidió."""

    candidate: CandidateInput
    score: int
    tier: str  # "exacto" | "fuerte" | "posible"
    name_overlap: float
    reasons: tuple[str, ...]


def score_candidate(query: SearchQuery, candidate: CandidateInput) -> Optional[ScoredCandidate]:
    """Puntúa un candidato contra la búsqueda. Devuelve ``None`` si no alcanza el umbral de
    inclusión (no se fabrica una coincidencia)."""
    reasons: list[str] = []
    score = 0

    q_curp = _normalize_curp(query.curp)
    curp_match = bool(q_curp) and q_curp == _normalize_curp(candidate.curp)
    if curp_match:
        score += _W_CURP
        reasons.append("CURP coincide")

    q_phone = normalize_phone(query.phone)
    phone_match = bool(q_phone) and _phones_match(q_phone, normalize_phone(candidate.phone))
    if phone_match:
        score += _W_PHONE
        reasons.append("teléfono coincide")

    dob_match = query.birth_date is not None and query.birth_date == candidate.birth_date
    if dob_match:
        score += _W_DOB
        reasons.append("fecha de nacimiento coincide")

    email_match = bool(query.email) and bool(candidate.email) and (
        query.email.strip().lower() == candidate.email.strip().lower()
    )
    if email_match:
        score += _W_EMAIL
        reasons.append("correo coincide")

    overlap = _name_overlap(_name_tokens(query.name), _name_tokens(candidate.full_name))
    if overlap > 0:
        score += round(_W_NAME * overlap)
        reasons.append(f"nombre similar ({int(round(overlap * 100))}%)")

    included = (
        curp_match
        or phone_match
        or dob_match
        or email_match
        or overlap >= _NAME_INCLUDE_THRESHOLD
    )
    if not included:
        return None

    if curp_match or phone_match:
        tier = "exacto"
    elif (dob_match or email_match) and overlap >= _NAME_STRONG_THRESHOLD:
        tier = "fuerte"
    else:
        tier = "posible"

    return ScoredCandidate(
        candidate=candidate,
        score=score,
        tier=tier,
        name_overlap=overlap,
        reasons=tuple(reasons),
    )


def rank_candidates(
    query: SearchQuery, candidates: list[CandidateInput], limit: int
) -> list[ScoredCandidate]:
    """Puntúa y ordena los candidatos por confianza (puntaje desc, luego nombre e id para que el
    orden sea ESTABLE/determinista). Recorta al ``limit``."""
    scored = [s for c in candidates if (s := score_candidate(query, c)) is not None]
    scored.sort(key=lambda s: (-s.score, normalize_text(s.candidate.full_name), str(s.candidate.id)))
    return scored[:limit]
