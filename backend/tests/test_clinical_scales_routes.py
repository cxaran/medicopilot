"""Tests de las escalas clínicas validadas (EPIC ESCALAS, fase 1).

El cómputo es determinista y SIN ESTADO (no toca la base de datos), así que estas pruebas no
requieren PostgreSQL: validan la lógica pura y las rutas con ``TestClient`` overrideando solo
la autenticación. Se verifican puntajes de ejemplos de libro con su FUENTE citada, el rechazo
estricto de insumos faltantes/ inválidos (422 nombrando el campo) y el RBAC.
"""

import os
import unittest
import uuid


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

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.clinical_scales import (  # noqa: E402
    ScaleValidationError,
    compute_scale,
    get_scale,
    list_scales,
)
from backend.app.main import app  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.security.catalog import declared_permissions  # noqa: E402


class ClinicalScalesComputeUnitTest(unittest.TestCase):
    """Lógica pura del registro: puntajes reales con su fuente citada."""

    def test_permission_declared(self) -> None:
        self.assertIn("clinical_scales:read", declared_permissions())

    def test_registry_has_exactly_the_validated_scales(self) -> None:
        ids = {scale.id for scale in list_scales()}
        self.assertEqual(ids, {"cha2ds2_vasc", "wells_dvt", "qsofa", "curb_65"})

    def test_cha2ds2_vasc_high_risk_textbook(self) -> None:
        # Mujer de 80 años con hipertensión y diabetes: edad≥75 (2) + sexo femenino (1) +
        # HTA (1) + DM (1) = 5 -> riesgo alto (ESC 2020).
        scale = get_scale("cha2ds2_vasc")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "chf": False,
                "hypertension": True,
                "age": 80,
                "diabetes": True,
                "stroke_tia_thromboembolism": False,
                "vascular_disease": False,
                "sex": "female",
            },
        )
        self.assertEqual(result.score, 5)
        self.assertEqual(result.interpretation_label, "Riesgo alto")
        self.assertTrue(any("ESC" in s for s in result.sources))

    def test_cha2ds2_vasc_low_risk_zero(self) -> None:
        # Hombre de 50 años sin factores: 0 -> riesgo bajo.
        scale = get_scale("cha2ds2_vasc")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "chf": False,
                "hypertension": False,
                "age": 50,
                "diabetes": False,
                "stroke_tia_thromboembolism": False,
                "vascular_disease": False,
                "sex": "male",
            },
        )
        self.assertEqual(result.score, 0)
        self.assertEqual(result.interpretation_label, "Riesgo bajo")

    def test_cha2ds2_vasc_age_65_to_74_scores_one(self) -> None:
        scale = get_scale("cha2ds2_vasc")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "chf": False,
                "hypertension": False,
                "age": 70,
                "diabetes": False,
                "stroke_tia_thromboembolism": False,
                "vascular_disease": False,
                "sex": "male",
            },
        )
        self.assertEqual(result.score, 1)
        self.assertEqual(result.interpretation_label, "Riesgo intermedio")

    def test_wells_dvt_high_probability_textbook(self) -> None:
        # Cáncer activo (1) + dolor localizado (1) + edema de toda la pierna (1) = 3 -> alta.
        scale = get_scale("wells_dvt")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "active_cancer": True,
                "paralysis_paresis_immobilization": False,
                "bedridden_or_major_surgery": False,
                "localized_tenderness": True,
                "entire_leg_swollen": True,
                "calf_swelling_gt_3cm": False,
                "pitting_edema": False,
                "collateral_superficial_veins": False,
                "previously_documented_dvt": False,
                "alternative_diagnosis_as_likely": False,
            },
        )
        self.assertEqual(result.score, 3)
        self.assertEqual(result.interpretation_label, "Probabilidad alta")
        self.assertTrue(any("Wells" in s for s in result.sources))

    def test_wells_dvt_alternative_diagnosis_subtracts_two(self) -> None:
        # Un solo criterio (1) y diagnóstico alternativo igual de probable (−2) = −1 -> baja.
        scale = get_scale("wells_dvt")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "active_cancer": True,
                "paralysis_paresis_immobilization": False,
                "bedridden_or_major_surgery": False,
                "localized_tenderness": False,
                "entire_leg_swollen": False,
                "calf_swelling_gt_3cm": False,
                "pitting_edema": False,
                "collateral_superficial_veins": False,
                "previously_documented_dvt": False,
                "alternative_diagnosis_as_likely": True,
            },
        )
        self.assertEqual(result.score, -1)
        self.assertEqual(result.interpretation_label, "Probabilidad baja")

    # --- fase 3: qSOFA ---

    def test_qsofa_high_risk_textbook(self) -> None:
        # Sepsis-3 (Singer, JAMA 2016): FR 24 ≥22 (1) + alteración mental (1) + TA sist 90 ≤100 (1)
        # = 3 -> riesgo alto (≥2).
        scale = get_scale("qsofa")
        assert scale is not None
        result = compute_scale(
            scale,
            {"respiratory_rate": 24, "altered_mentation": True, "systolic_bp": 90},
        )
        self.assertEqual(result.score, 3)
        self.assertEqual(result.interpretation_label, "Riesgo alto")
        self.assertTrue(any("Sepsis-3" in s or "JAMA" in s for s in result.sources))

    def test_qsofa_low_risk_below_two(self) -> None:
        # Sólo TA sist 95 ≤100 (1); FR 18 (<22) y sin alteración mental = 1 -> riesgo bajo (<2).
        scale = get_scale("qsofa")
        assert scale is not None
        result = compute_scale(
            scale,
            {"respiratory_rate": 18, "altered_mentation": False, "systolic_bp": 95},
        )
        self.assertEqual(result.score, 1)
        self.assertEqual(result.interpretation_label, "Riesgo bajo")

    def test_qsofa_boundary_values_count(self) -> None:
        # Umbrales exactos: FR 22 (≥22 -> 1) y TA sist 100 (≤100 -> 1), sin alteración = 2 -> alto.
        scale = get_scale("qsofa")
        assert scale is not None
        result = compute_scale(
            scale,
            {"respiratory_rate": 22, "altered_mentation": False, "systolic_bp": 100},
        )
        self.assertEqual(result.score, 2)
        self.assertEqual(result.interpretation_label, "Riesgo alto")

    # --- fase 3: CURB-65 ---

    def test_curb65_high_risk_textbook(self) -> None:
        # Lim et al. (Thorax 2003): Confusión (1) + urea 8>7 (1) + FR 32≥30 (1) + SBP 85<90 (1)
        # + edad 75≥65 (1) = 5 -> riesgo alto.
        scale = get_scale("curb_65")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "confusion": True,
                "urea_mmol_l": 8,
                "respiratory_rate": 32,
                "systolic_bp": 85,
                "diastolic_bp": 70,
                "age": 75,
            },
        )
        self.assertEqual(result.score, 5)
        self.assertEqual(result.interpretation_label, "Riesgo alto")
        self.assertTrue(any("Thorax" in s for s in result.sources))

    def test_curb65_intermediate_score_two(self) -> None:
        # Edad 70≥65 (1) + urea 8>7 (1); resto normal = 2 -> riesgo intermedio.
        scale = get_scale("curb_65")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "confusion": False,
                "urea_mmol_l": 8,
                "respiratory_rate": 18,
                "systolic_bp": 120,
                "diastolic_bp": 80,
                "age": 70,
            },
        )
        self.assertEqual(result.score, 2)
        self.assertEqual(result.interpretation_label, "Riesgo intermedio")

    def test_curb65_bp_criterion_fires_on_diastolic(self) -> None:
        # El criterio de TA suma 1 si DBP≤60 aunque la SBP sea normal: DBP 55 (1) = 1 -> bajo (0-1).
        scale = get_scale("curb_65")
        assert scale is not None
        result = compute_scale(
            scale,
            {
                "confusion": False,
                "urea_mmol_l": 5,
                "respiratory_rate": 18,
                "systolic_bp": 120,
                "diastolic_bp": 55,
                "age": 40,
            },
        )
        self.assertEqual(result.score, 1)
        self.assertEqual(result.interpretation_label, "Riesgo bajo")

    def test_curb65_out_of_range_input_rejected(self) -> None:
        # Edad fuera de rango (max 120) -> rechazada nombrando el campo.
        scale = get_scale("curb_65")
        assert scale is not None
        with self.assertRaises(ScaleValidationError) as ctx:
            compute_scale(
                scale,
                {
                    "confusion": False,
                    "urea_mmol_l": 5,
                    "respiratory_rate": 18,
                    "systolic_bp": 120,
                    "diastolic_bp": 80,
                    "age": 999,
                },
            )
        self.assertIn("age", {item.field for item in ctx.exception.errors})

    def test_qsofa_missing_input_names_field(self) -> None:
        scale = get_scale("qsofa")
        assert scale is not None
        with self.assertRaises(ScaleValidationError) as ctx:
            compute_scale(scale, {"respiratory_rate": 24})  # faltan los otros dos
        missing = {item.field for item in ctx.exception.errors}
        self.assertIn("altered_mentation", missing)
        self.assertIn("systolic_bp", missing)

    def test_missing_input_raises_naming_the_field(self) -> None:
        scale = get_scale("cha2ds2_vasc")
        assert scale is not None
        with self.assertRaises(ScaleValidationError) as ctx:
            compute_scale(scale, {"chf": True})  # faltan casi todos los insumos
        missing_fields = {item.field for item in ctx.exception.errors}
        self.assertIn("age", missing_fields)
        self.assertIn("sex", missing_fields)

    def test_invalid_type_raises(self) -> None:
        scale = get_scale("cha2ds2_vasc")
        assert scale is not None
        with self.assertRaises(ScaleValidationError) as ctx:
            compute_scale(
                scale,
                {
                    "chf": "yes",  # debe ser booleano
                    "hypertension": False,
                    "age": 60,
                    "diabetes": False,
                    "stroke_tia_thromboembolism": False,
                    "vascular_disease": False,
                    "sex": "female",
                },
            )
        self.assertIn("chf", {item.field for item in ctx.exception.errors})


class ClinicalScalesRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._as("clinical_scales:read")
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=uuid.uuid4(),
            name="Médico",
            last_name="Tester",
            email="medico@example.com",
            permissions=set(permissions),
        )

    def test_list_exposes_scales_with_inputs_and_source(self) -> None:
        response = self.client.get("/api/v1/clinical-scales")
        self.assertEqual(response.status_code, 200, response.text)
        scales = {s["id"]: s for s in response.json()}
        self.assertEqual(set(scales), {"cha2ds2_vasc", "wells_dvt", "qsofa", "curb_65"})
        for scale in scales.values():
            self.assertTrue(scale["source"])
            self.assertTrue(scale["inputs"])
            for spec in scale["inputs"]:
                self.assertIn(spec["type"], {"boolean", "enum", "number"})

    def test_compute_returns_score_and_cited_sources(self) -> None:
        response = self.client.post(
            "/api/v1/clinical-scales/wells_dvt/compute",
            json={
                "inputs": {
                    "active_cancer": True,
                    "paralysis_paresis_immobilization": False,
                    "bedridden_or_major_surgery": False,
                    "localized_tenderness": True,
                    "entire_leg_swollen": True,
                    "calf_swelling_gt_3cm": False,
                    "pitting_edema": False,
                    "collateral_superficial_veins": False,
                    "previously_documented_dvt": False,
                    "alternative_diagnosis_as_likely": False,
                }
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["score"], 3)
        self.assertEqual(body["interpretation_label"], "Probabilidad alta")
        self.assertTrue(body["sources"])

    def test_compute_missing_input_returns_422_naming_field(self) -> None:
        response = self.client.post(
            "/api/v1/clinical-scales/cha2ds2_vasc/compute",
            json={"inputs": {"chf": True}},
        )
        self.assertEqual(response.status_code, 422, response.text)
        body = response.json()
        detail = body.get("detail", body)
        self.assertEqual(detail["code"], "scale_inputs_invalid")
        fields = {item["field"] for item in detail["errors"]}
        self.assertIn("age", fields)
        self.assertIn("sex", fields)

    def test_compute_qsofa_route_returns_score_and_source(self) -> None:
        response = self.client.post(
            "/api/v1/clinical-scales/qsofa/compute",
            json={
                "inputs": {
                    "respiratory_rate": 24,
                    "altered_mentation": True,
                    "systolic_bp": 90,
                }
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["score"], 3)
        self.assertEqual(body["interpretation_label"], "Riesgo alto")
        self.assertTrue(any("JAMA" in s for s in body["sources"]))

    def test_compute_curb65_missing_input_returns_422_naming_field(self) -> None:
        response = self.client.post(
            "/api/v1/clinical-scales/curb_65/compute",
            json={"inputs": {"confusion": True}},
        )
        self.assertEqual(response.status_code, 422, response.text)
        detail = response.json().get("detail", response.json())
        self.assertEqual(detail["code"], "scale_inputs_invalid")
        fields = {item["field"] for item in detail["errors"]}
        self.assertIn("age", fields)
        self.assertIn("urea_mmol_l", fields)

    def test_compute_unknown_scale_returns_404(self) -> None:
        response = self.client.post(
            "/api/v1/clinical-scales/no_existe/compute",
            json={"inputs": {}},
        )
        self.assertEqual(response.status_code, 404, response.text)

    def test_read_requires_permission(self) -> None:
        self._as()  # sin permisos
        self.assertEqual(self.client.get("/api/v1/clinical-scales").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/v1/clinical-scales/cha2ds2_vasc/compute", json={"inputs": {}}
            ).status_code,
            403,
        )


if __name__ == "__main__":
    unittest.main()
