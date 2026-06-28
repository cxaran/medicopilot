import logging
import os
import unittest
import uuid
from unittest import mock


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "MedicoPilot Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "medicopilot",
}

os.environ.update(DEV_ENV)

import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pydantic import SecretStr  # noqa: E402

from backend.app.api.v1 import research as research_mod  # noqa: E402
from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


SEARCH_URL = "/api/v1/research/pubmed"


def _session_user() -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Médica",
        last_name="Tester",
        email="medica@example.com",
        permissions=set(),
    )


def _esearch_response(idlist: list[str], count: int | None = None) -> httpx.Response:
    return httpx.Response(
        200,
        json={"esearchresult": {"idlist": idlist, "count": str(count if count is not None else len(idlist))}},
    )


def _esummary_response(entries: dict[str, dict]) -> httpx.Response:
    result: dict[str, object] = {"uids": list(entries.keys())}
    result.update(entries)
    return httpx.Response(200, json={"result": result})


def _efetch_response(text: str) -> httpx.Response:
    return httpx.Response(200, text=text)


def _router(esearch=None, esummary=None, efetch=None):
    """Despacha _http_get por endpoint para simular las E-utilities de NCBI."""

    def _dispatch(url: str, params: dict[str, str]) -> httpx.Response:
        if "esearch" in url:
            return esearch
        if "esummary" in url:
            return esummary
        if "efetch" in url:
            return efetch
        raise AssertionError(f"endpoint inesperado: {url}")

    return _dispatch


class PubMedProxyTest(unittest.TestCase):
    def setUp(self) -> None:
        app.dependency_overrides[get_current_user] = _session_user
        self.client = TestClient(app)
        from backend.app.core.settings import settings

        self.settings = settings
        self.settings.ncbi_api_key = None

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.settings.ncbi_api_key = None

    def test_search_returns_parsed_articles(self) -> None:
        esearch = _esearch_response(["111", "222"], count=2)
        esummary = _esummary_response(
            {
                "111": {
                    "title": "Aspirin for prevention.",
                    "authors": [{"name": "Smith J"}, {"name": "Lee K"}],
                    "pubdate": "2020 Jan",
                    "source": "NEJM",
                },
                "222": {
                    "title": "Statins review",
                    "authors": [{"name": "Doe A"}],
                    "pubdate": "2019",
                    "fulljournalname": "Lancet",
                },
            }
        )
        with mock.patch.object(research_mod, "_http_get", side_effect=_router(esearch=esearch, esummary=esummary)):
            response = self.client.get(SEARCH_URL, params={"query": "aspirin", "limit": 5})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["query"], "aspirin")
        self.assertEqual(body["count"], 2)
        self.assertEqual(len(body["articles"]), 2)
        first = body["articles"][0]
        self.assertEqual(first["pmid"], "111")
        self.assertEqual(first["title"], "Aspirin for prevention.")
        self.assertEqual(first["authors"], ["Smith J", "Lee K"])
        self.assertEqual(first["year"], "2020")
        self.assertEqual(first["source"], "NEJM")
        self.assertIsNone(first["abstract"])
        self.assertIn("Smith J", first["citation"])
        self.assertIn("NEJM", first["citation"])

    def test_search_empty_results(self) -> None:
        with mock.patch.object(
            research_mod, "_http_get",
            side_effect=_router(esearch=_esearch_response([], count=0), esummary=_esummary_response({})),
        ):
            response = self.client.get(SEARCH_URL, params={"query": "xyzzy-no-results"})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["articles"], [])

    def test_get_article_includes_abstract(self) -> None:
        esummary = _esummary_response(
            {"333": {"title": "Diabetes care", "authors": [{"name": "Roe B"}], "pubdate": "2021 Mar", "source": "BMJ"}}
        )
        efetch = _efetch_response("Background: this is the abstract text.")
        with mock.patch.object(research_mod, "_http_get", side_effect=_router(esummary=esummary, efetch=efetch)):
            response = self.client.get(f"{SEARCH_URL}/333")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["pmid"], "333")
        self.assertEqual(body["abstract"], "Background: this is the abstract text.")

    def test_get_article_not_found(self) -> None:
        esummary = _esummary_response({"999": {"error": "cannot get document summary"}})
        with mock.patch.object(research_mod, "_http_get", side_effect=_router(esummary=esummary)):
            response = self.client.get(f"{SEARCH_URL}/999")
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["code"], "article_not_found")

    def test_get_article_rejects_non_numeric_pmid(self) -> None:
        response = self.client.get(f"{SEARCH_URL}/not-a-pmid")
        self.assertEqual(response.status_code, 422, response.text)

    def test_ncbi_error_maps_to_502(self) -> None:
        with mock.patch.object(research_mod, "_http_get", return_value=httpx.Response(500, text="boom")):
            response = self.client.get(SEARCH_URL, params={"query": "aspirin"})
        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(response.json()["code"], "pubmed_unavailable")

    def test_network_error_maps_to_502(self) -> None:
        with mock.patch.object(research_mod, "_http_get", side_effect=httpx.ConnectError("down")):
            response = self.client.get(SEARCH_URL, params={"query": "aspirin"})
        self.assertEqual(response.status_code, 502, response.text)

    def test_api_key_is_not_written_to_logs(self) -> None:
        self.settings.ncbi_api_key = SecretStr("ncbi-secret-key-do-not-log-7777")
        esearch = _esearch_response(["111"], count=1)
        esummary = _esummary_response({"111": {"title": "T", "authors": [], "pubdate": "2020", "source": "S"}})

        records: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                records.append(self.format(record))

        handler = _Capture()
        handler.setFormatter(logging.Formatter("%(message)s"))
        root = logging.getLogger()
        previous_level = root.level
        root.setLevel(logging.DEBUG)
        root.addHandler(handler)
        try:
            with mock.patch.object(research_mod, "_http_get", side_effect=_router(esearch=esearch, esummary=esummary)):
                response = self.client.get(SEARCH_URL, params={"query": "aspirin"})
        finally:
            root.removeHandler(handler)
            root.setLevel(previous_level)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("ncbi-secret-key-do-not-log-7777", "\n".join(records))

    def test_api_key_added_to_request_params_when_configured(self) -> None:
        self.settings.ncbi_api_key = SecretStr("my-ncbi-key")
        seen: list[dict[str, str]] = []

        def _spy(url: str, params: dict[str, str]) -> httpx.Response:
            seen.append(params)
            if "esearch" in url:
                return _esearch_response(["111"], count=1)
            return _esummary_response({"111": {"title": "T", "authors": [], "pubdate": "2020", "source": "S"}})

        with mock.patch.object(research_mod, "_http_get", side_effect=_spy):
            response = self.client.get(SEARCH_URL, params={"query": "aspirin"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(all(p.get("api_key") == "my-ncbi-key" for p in seen))


if __name__ == "__main__":
    unittest.main()
