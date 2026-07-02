"""Tests de la BÚSQUEDA/EMPAREJAMIENTO determinista de pacientes (módulo puro + rutas).

El módulo ``patient_search`` puntúa candidatos sin LLM ni extensiones de Postgres. Las pruebas de
módulo (puras, sin DB) fijan el algoritmo: CURP/teléfono exactos arriba, nombre difuso pese a
acentos/mayúsculas, fecha que corrobora, y nada por debajo del umbral. Las de ruta (sólo si
TEST_POSTGRES_URL apunta a una base *_test) verifican el endpoint: proyección segura, exclusión de
eliminados, dedup (has_strong_match), RBAC y que no muta.
"""

import os
import unittest
import uuid
from datetime import date
from typing import Optional
from urllib.parse import urlparse


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

from backend.app.patient_search import (  # noqa: E402
    CandidateInput,
    SearchQuery,
    normalize_phone,
    rank_candidates,
    score_candidate,
)


def _cand(name: str = "Juan Pérez García", birth: date = date(1980, 1, 1), sex: str = "male",
          phone: Optional[str] = "55-1234-5678", email: Optional[str] = "juan@example.com",
          curp: Optional[str] = "PEGJ800101HDFRRN01", cid: Optional[uuid.UUID] = None):
    return CandidateInput(
        id=cid or uuid.uuid4(), full_name=name, birth_date=birth, sex=sex,
        phone=phone, email=email, curp=curp,
    )


class PatientSearchScoringTest(unittest.TestCase):
    def test_normalize_phone_keeps_only_digits(self) -> None:
        self.assertEqual(normalize_phone("+52 (55) 1234-5678"), "525512345678")
        self.assertEqual(normalize_phone(None), "")

    def test_curp_exact_is_exacto_tier(self) -> None:
        c = _cand()
        s = score_candidate(SearchQuery(curp="pegj800101hdfrrn01"), c)
        assert s is not None
        self.assertEqual(s.tier, "exacto")  # CURP normalizada (mayúsculas) coincide
        self.assertGreaterEqual(s.score, 60)

    def test_phone_exact_is_exacto_tier_with_country_prefix(self) -> None:
        c = _cand(phone="55-1234-5678")
        s = score_candidate(SearchQuery(phone="+52 5512345678"), c)
        assert s is not None
        self.assertEqual(s.tier, "exacto")  # sufijo coincide pese al prefijo de país

    def test_name_fuzzy_match_despite_accents_and_case(self) -> None:
        c = _cand(name="José MARÍA de la Cruz")
        s = score_candidate(SearchQuery(name="jose maria cruz"), c)
        assert s is not None  # acentos/mayúsculas normalizados
        self.assertGreater(s.name_overlap, 0.5)

    def test_partial_single_token_name_matches_long_full_name(self) -> None:
        # Buscar SOLO el nombre de pila debe encontrar al paciente de nombre completo (cobertura,
        # no Jaccard). Antes "jordan" daba 0 contra "Jordan Michelt Aran Pérez".
        c = _cand(name="Jordan Michelt Aran Pérez", curp=None, phone=None, email=None)
        s = score_candidate(SearchQuery(name="jordan"), c)
        assert s is not None
        self.assertEqual(s.name_overlap, 1.0)  # el token buscado aparece en el nombre

    def test_full_name_excludes_sibling_sharing_surnames(self) -> None:
        # Buscar el nombre COMPLETO de A no debe sugerir a un familiar B que comparte 2 de 4 tokens
        # (mismos apellidos). Con nombre completo el umbral de cobertura es más exigente.
        sibling = _cand(name="Luna Michelt Aran Guzman", curp=None, phone=None, email=None)
        self.assertIsNone(score_candidate(SearchQuery(name="Jordan Michelt Aran Perez"), sibling))

    def test_name_typo_is_tolerated(self) -> None:
        # Un error de tipeo en el nombre no debe impedir la coincidencia (similitud difusa).
        c = _cand(name="Jordan Michelt Aran Pérez", curp=None, phone=None, email=None)
        s = score_candidate(SearchQuery(name="jordna"), c)
        assert s is not None
        self.assertGreater(s.name_overlap, 0.5)

    def test_birth_date_corroborates_name_to_fuerte(self) -> None:
        c = _cand(name="María López", curp=None, phone=None, email=None)
        s = score_candidate(
            SearchQuery(name="maria lopez", birth_date=date(1980, 1, 1)), c
        )
        assert s is not None
        self.assertEqual(s.tier, "fuerte")  # sin identificador único, pero nombre+fecha

    def test_below_threshold_returns_none(self) -> None:
        c = _cand(name="Juan Pérez", curp=None, phone=None, email=None)
        # Nombre totalmente distinto, sin otros datos -> no se fabrica coincidencia.
        self.assertIsNone(score_candidate(SearchQuery(name="Pedro Gómez"), c))

    def test_ranking_orders_exact_first(self) -> None:
        exact = _cand(name="Juan Pérez", curp="PEGJ800101HDFRRN01", cid=uuid.uuid4())
        weak = _cand(name="Juan Pérez", curp=None, phone=None, email=None, cid=uuid.uuid4())
        ranked = rank_candidates(
            SearchQuery(name="juan perez", curp="PEGJ800101HDFRRN01"),
            [weak, exact], limit=10,
        )
        self.assertEqual(ranked[0].candidate.id, exact.id)  # el de CURP va primero
        self.assertEqual(ranked[0].tier, "exacto")

    def test_limit_is_respected(self) -> None:
        cands = [_cand(name="Juan Pérez", curp=None, phone=None, email=None) for _ in range(5)]
        ranked = rank_candidates(SearchQuery(name="juan perez"), cands, limit=2)
        self.assertEqual(len(ranked), 2)


# ---------------------------------------------------------------------------
# Rutas (Postgres real *_test)
# ---------------------------------------------------------------------------

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, delete, func, select  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.enums import Sex  # noqa: E402
from backend.app.models.patient import Patient  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


_TEST_PG_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _is_test_url(url: str) -> bool:
    if not url:
        return False
    db_name = (urlparse(url).path or "/").lstrip("/")
    return db_name.endswith("_test")


@unittest.skipUnless(
    _is_test_url(_TEST_PG_URL),
    "TEST_POSTGRES_URL no definida o no apunta a una base *_test.",
)
class PatientSearchRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_TEST_PG_URL)
        Base.metadata.create_all(cls.engine)
        cls.actor_id = uuid.uuid4()
        cls.p_juan = uuid.uuid4()
        cls.p_jose = uuid.uuid4()
        cls.p_deleted = uuid.uuid4()
        with Session(cls.engine) as session:
            session.add(Patient(id=cls.p_juan, full_name="Juan Pérez García",
                                birth_date=date(1980, 5, 10), sex=Sex.MALE,
                                phone="55-1234-5678", email="juan@example.com",
                                curp="PEGJ800510HDFRRN01"))
            session.add(Patient(id=cls.p_jose, full_name="José María de la Cruz",
                                birth_date=date(1975, 3, 2), sex=Sex.MALE,
                                phone="55-9999-0000"))
            # Eliminado lógicamente: nunca debe aparecer.
            session.add(Patient(id=cls.p_deleted, full_name="Juan Pérez Borrado",
                                birth_date=date(1980, 5, 10), sex=Sex.MALE,
                                curp="XEXX010101HNEXXXA4",
                                deleted_at=func.now()))
            session.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        with Session(cls.engine) as session:
            session.execute(delete(Patient))
            session.commit()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self._as("patients:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.actor_id, name="Médico", last_name="Tester",
            email="medico@example.com", permissions=set(permissions),
        )

    def test_exact_curp_ranks_first_and_safe_fields_only(self) -> None:
        body = self.client.get("/api/v1/patients/search?curp=PEGJ800510HDFRRN01").json()
        self.assertGreaterEqual(body["count"], 1)
        top = body["candidates"][0]
        self.assertEqual(top["id"], str(self.p_juan))
        self.assertEqual(top["tier"], "exacto")
        self.assertTrue(body["has_strong_match"])
        # Proyección SEGURA: nada de PHI completa.
        self.assertEqual(top["birth_year"], 1980)
        self.assertEqual(top["phone_masked"], "******5678")
        for forbidden in ("curp", "email", "address", "birth_date"):
            self.assertNotIn(forbidden, top)

    def test_phone_exact_match(self) -> None:
        body = self.client.get("/api/v1/patients/search?phone=5512345678").json()
        self.assertEqual(body["candidates"][0]["id"], str(self.p_juan))
        self.assertEqual(body["candidates"][0]["tier"], "exacto")

    def test_name_fuzzy_despite_accents(self) -> None:
        body = self.client.get("/api/v1/patients/search?name=jose maria cruz").json()
        ids = [c["id"] for c in body["candidates"]]
        self.assertIn(str(self.p_jose), ids)  # acentos normalizados en Python

    def test_below_threshold_returns_no_match(self) -> None:
        body = self.client.get("/api/v1/patients/search?name=Wenceslao Inexistente").json()
        self.assertEqual(body["count"], 0)
        self.assertFalse(body["has_strong_match"])

    def test_soft_deleted_excluded(self) -> None:
        # La CURP del expediente eliminado no debe traerlo.
        body = self.client.get("/api/v1/patients/search?curp=XEXX010101HNEXXXA4").json()
        ids = [c["id"] for c in body["candidates"]]
        self.assertNotIn(str(self.p_deleted), ids)

    def test_dedup_flags_existing_near_duplicate(self) -> None:
        # Datos propuestos para alta: mismo nombre + fecha + teléfono de Juan -> duplicado.
        body = self.client.get(
            "/api/v1/patients/search?name=Juan Perez Garcia&birth_date=1980-05-10&phone=5512345678"
        ).json()
        self.assertTrue(body["has_strong_match"])
        self.assertEqual(body["candidates"][0]["id"], str(self.p_juan))

    def test_requires_at_least_one_criterion(self) -> None:
        self.assertEqual(self.client.get("/api/v1/patients/search").status_code, 422)

    def test_requires_permission(self) -> None:
        self._as("consultations:read")  # sin patients:read
        self.assertEqual(
            self.client.get("/api/v1/patients/search?curp=PEGJ800510HDFRRN01").status_code, 403
        )

    def test_search_does_not_mutate(self) -> None:
        with Session(self.engine) as session:
            before = session.execute(select(func.count()).select_from(Patient)).scalar_one()
        self.client.get("/api/v1/patients/search?name=juan")
        self.client.get("/api/v1/patients/search?phone=5512345678")
        with Session(self.engine) as session:
            after = session.execute(select(func.count()).select_from(Patient)).scalar_one()
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
