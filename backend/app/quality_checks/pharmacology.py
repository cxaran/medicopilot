"""Resolución de farmacología para el cruce fármaco-alergia (cluster quality_checks, fase 2).

El cruce fármaco-alergia necesita resolver un nombre de fármaco o de alérgeno a sus
INGREDIENTES y CLASES para poder compararlos. Esa resolución NO es pura-python: se obtiene de
una FUENTE CONFIGURABLE y SWAPPABLE, igual que el STT (``services/audio_transcription``) y el
proxy de PubMed. No hay tabla de fármacos hardcodeada en la lógica de la regla; el conocimiento
viene de la fuente externa (el MCP de farmacología real se enchufa cambiando SOLO la URL).

Reglas de honestidad:
- Si NO hay fuente configurada (``pharma_mcp_server_url`` vacío) o la fuente no responde, la
  resolución es NO DISPONIBLE (``available=False``). El cruce fármaco-alergia entonces reporta
  "no disponible": NUNCA inventa una coincidencia ni concluye ausencia de alergias.
- Si la fuente responde pero NO cubre el fármaco, es ``available=True`` con listas vacías: se
  consultó y no hubo coincidencia (distinto de "no disponible").
- Para pruebas/QA existe un STUB local tras el MISMO contrato, seleccionado por el esquema
  sentinela ``stub://``: resuelve un PUÑADO de fármacos/alérgenos de PRUEBA (no es una base
  farmacológica real). Un servidor real lo reemplaza cambiando SOLO la URL.

Contrato del proveedor real (HTTP/JSON a mano, sin SDK):
    POST <url>  JSON {"name": "<fármaco|alérgeno>"}
    -> 200 JSON {"ingredients": ["...", ...], "classes": ["...", ...]}  (minúsculas)
"""

from dataclasses import dataclass, field

import httpx

from backend.app.core.settings import settings
from backend.app.quality_checks.base import normalize_text as normalize


@dataclass(frozen=True)
class PharmaResolution:
    """Ingredientes y clases resueltos de un nombre. ``available=False`` = fuente no disponible."""

    name: str
    available: bool
    ingredients: frozenset[str] = field(default_factory=frozenset)
    classes: frozenset[str] = field(default_factory=frozenset)


# STUB de PRUEBA (sólo se usa con el esquema sentinela ``stub://``; NO es una base real ni el
# proveedor por defecto). Un puñado de mapeos comunes para ejercitar el camino de extremo a
# extremo en QA: nombre normalizado -> (ingredientes, clases). Un servidor real lo reemplaza.
_STUB_DB: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    "ibuprofeno": (frozenset({"ibuprofeno"}), frozenset({"aine"})),
    "ibuprofen": (frozenset({"ibuprofeno"}), frozenset({"aine"})),
    "advil": (frozenset({"ibuprofeno"}), frozenset({"aine"})),
    "motrin": (frozenset({"ibuprofeno"}), frozenset({"aine"})),
    "naproxeno": (frozenset({"naproxeno"}), frozenset({"aine"})),
    "aine": (frozenset(), frozenset({"aine"})),
    "aines": (frozenset(), frozenset({"aine"})),
    "amoxicilina": (frozenset({"amoxicilina"}), frozenset({"penicilina"})),
    "amoxicillin": (frozenset({"amoxicilina"}), frozenset({"penicilina"})),
    "penicilina": (frozenset({"penicilina"}), frozenset({"penicilina"})),
    "penicillin": (frozenset({"penicilina"}), frozenset({"penicilina"})),
    "paracetamol": (frozenset({"paracetamol"}), frozenset({"analgesico"})),
    "tempra": (frozenset({"paracetamol"}), frozenset({"analgesico"})),
    "tylenol": (frozenset({"paracetamol"}), frozenset({"analgesico"})),
}


def _resolve_stub(name: str) -> PharmaResolution:
    key = normalize(name)
    # Coincidencia exacta del nombre normalizado, o que el término contenga una clave conocida
    # (p. ej. "ibuprofeno 400 mg" -> "ibuprofeno"). Conservador: sólo claves del stub.
    entry = _STUB_DB.get(key)
    if entry is None:
        for stub_key, value in _STUB_DB.items():
            if stub_key in key.split() or f" {stub_key} " in f" {key} ":
                entry = value
                break
    if entry is None:
        return PharmaResolution(name=name, available=True)
    return PharmaResolution(name=name, available=True, ingredients=entry[0], classes=entry[1])


def _resolve_remote(url: str, name: str) -> PharmaResolution:
    """Invoca la fuente real (HTTP/JSON a mano). Nunca lanza; ante error, no disponible."""
    headers = {"Content-Type": "application/json"}
    api_key = settings.pharma_mcp_api_key
    if api_key is not None and api_key.get_secret_value().strip():
        headers["Authorization"] = f"Bearer {api_key.get_secret_value()}"
    try:
        response = httpx.post(
            url,
            json={"name": name},
            headers=headers,
            timeout=httpx.Timeout(settings.pharma_mcp_timeout_seconds),
        )
        if response.status_code >= 400:
            return PharmaResolution(name=name, available=False)
        data = response.json()
    except (httpx.HTTPError, ValueError):
        # Sin detalle de la excepción para no arriesgar fugas (URL/credencial).
        return PharmaResolution(name=name, available=False)
    if not isinstance(data, dict):
        return PharmaResolution(name=name, available=False)
    ingredients = frozenset(
        normalize(x) for x in data.get("ingredients", []) if isinstance(x, str) and x.strip()
    )
    classes = frozenset(
        normalize(x) for x in data.get("classes", []) if isinstance(x, str) and x.strip()
    )
    return PharmaResolution(name=name, available=True, ingredients=ingredients, classes=classes)


def resolve_pharmacology(name: str) -> PharmaResolution:
    """Resuelve un nombre a ingredientes/clases con la fuente configurada.

    Sin fuente configurada -> ``available=False`` (no disponible). No inventa nada.
    """
    if not name or not name.strip():
        return PharmaResolution(name=name, available=True)
    url = (settings.pharma_mcp_server_url or "").strip()
    if not url:
        return PharmaResolution(name=name, available=False)
    if url.startswith("stub://"):
        return _resolve_stub(name)
    return _resolve_remote(url, name)


def pharmacology_source_available() -> bool:
    """True si hay una fuente de farmacología configurada (no garantiza que responda)."""
    return bool((settings.pharma_mcp_server_url or "").strip())
