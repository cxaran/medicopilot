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

Fase 3 — INTERACCIONES (extensión honesta del MISMO contrato/URL):
    POST <url>  JSON {"interaction": {"a": "<fármaco>", "b": "<fármaco>"}}
    -> 200 JSON {"interacts": true|false, "severity": "<texto>", "source": "<cita>"}
El conocimiento de interacciones VIENE de la fuente: la lógica NO tiene tabla de interacciones.
Si la fuente NO implementa esta consulta (responde error o sin la clave ``interacts``) o no hay
fuente configurada, la verificación de interacciones es NO DISPONIBLE (``available=False``):
NUNCA se inventa una interacción ni se adivina una severidad. A día de hoy NINGÚN proveedor real
está conectado; sólo el STUB de prueba (``stub://``) responde interacciones, para ejercitar el
camino de extremo a extremo en QA.
"""

from dataclasses import dataclass, field
from typing import Optional

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


@dataclass(frozen=True)
class InteractionResolution:
    """Resultado de consultar una interacción entre dos fármacos a la fuente de farmacología.

    ``available=False`` significa que la fuente NO puede verificar interacciones (no configurada,
    no responde o no implementa la consulta): se reporta 'no disponible', nunca se infiere nada.
    ``interacts``/``severity``/``source`` vienen ÍNTEGRAMENTE de la fuente.
    """

    name_a: str
    name_b: str
    available: bool
    interacts: bool = False
    severity: Optional[str] = None
    source: Optional[str] = None


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
    "warfarina": (frozenset({"warfarina"}), frozenset({"anticoagulante"})),
    "warfarin": (frozenset({"warfarina"}), frozenset({"anticoagulante"})),
    "metformina": (frozenset({"metformina"}), frozenset({"biguanida"})),
    "metformin": (frozenset({"metformina"}), frozenset({"biguanida"})),
    "gabapentina": (frozenset({"gabapentina"}), frozenset({"anticonvulsivante"})),
}

# STUB de INTERACCIONES de PRUEBA (sólo ``stub://``; NO es una base de interacciones real). Un
# puñado de pares ingrediente-ingrediente conocidos para ejercitar el camino en QA. La lógica de
# la regla NO contiene esta tabla: el conocimiento vive en la fuente (aquí, el stub de prueba). Un
# proveedor real lo reemplaza implementando la consulta de interacciones por URL. Clave: par
# (frozenset de dos ingredientes normalizados) -> (severidad, cita).
_STUB_INTERACTIONS: dict[frozenset[str], tuple[str, str]] = {
    frozenset({"warfarina", "ibuprofeno"}): (
        "grave",
        "AINE + anticoagulante oral (warfarina): mayor riesgo de hemorragia "
        "(interacción de prueba del stub).",
    ),
    frozenset({"warfarina", "naproxeno"}): (
        "grave",
        "AINE + anticoagulante oral (warfarina): mayor riesgo de hemorragia "
        "(interacción de prueba del stub).",
    ),
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


def _interaction_stub(name_a: str, name_b: str) -> InteractionResolution:
    """Resuelve una interacción con el STUB de prueba (resuelve ingredientes y consulta pares)."""
    res_a = _resolve_stub(name_a)
    res_b = _resolve_stub(name_b)
    for ing_a in res_a.ingredients:
        for ing_b in res_b.ingredients:
            entry = _STUB_INTERACTIONS.get(frozenset({ing_a, ing_b}))
            if entry is not None:
                return InteractionResolution(
                    name_a=name_a, name_b=name_b, available=True, interacts=True,
                    severity=entry[0], source=entry[1],
                )
    # La fuente respondió pero no conoce una interacción entre estos dos (distinto de 'no
    # disponible'): disponible, sin interacción.
    return InteractionResolution(name_a=name_a, name_b=name_b, available=True)


def _interaction_remote(url: str, name_a: str, name_b: str) -> InteractionResolution:
    """Consulta la interacción a la fuente real. Nunca lanza; ante error o falta de soporte,
    devuelve ``available=False`` (no disponible): jamás infiere una interacción."""
    headers = {"Content-Type": "application/json"}
    api_key = settings.pharma_mcp_api_key
    if api_key is not None and api_key.get_secret_value().strip():
        headers["Authorization"] = f"Bearer {api_key.get_secret_value()}"
    try:
        response = httpx.post(
            url,
            json={"interaction": {"a": name_a, "b": name_b}},
            headers=headers,
            timeout=httpx.Timeout(settings.pharma_mcp_timeout_seconds),
        )
        if response.status_code >= 400:
            return InteractionResolution(name_a=name_a, name_b=name_b, available=False)
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return InteractionResolution(name_a=name_a, name_b=name_b, available=False)
    # La fuente debe declarar explícitamente la clave ``interacts``; si no, NO soporta interacciones.
    if not isinstance(data, dict) or "interacts" not in data:
        return InteractionResolution(name_a=name_a, name_b=name_b, available=False)
    severity = data.get("severity")
    source = data.get("source")
    return InteractionResolution(
        name_a=name_a,
        name_b=name_b,
        available=True,
        interacts=bool(data.get("interacts")),
        severity=severity if isinstance(severity, str) and severity.strip() else None,
        source=source if isinstance(source, str) and source.strip() else None,
    )


def check_interaction(name_a: str, name_b: str) -> InteractionResolution:
    """Consulta a la fuente configurada si dos fármacos interactúan.

    Sin fuente configurada o sin soporte de interacciones -> ``available=False`` (no disponible).
    No inventa interacciones ni adivina severidad.
    """
    if not name_a or not name_a.strip() or not name_b or not name_b.strip():
        return InteractionResolution(name_a=name_a, name_b=name_b, available=False)
    url = (settings.pharma_mcp_server_url or "").strip()
    if not url:
        return InteractionResolution(name_a=name_a, name_b=name_b, available=False)
    if url.startswith("stub://"):
        return _interaction_stub(name_a, name_b)
    return _interaction_remote(url, name_a, name_b)
