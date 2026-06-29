"""Catálogo de plantillas para el agente (arquitectura de UI híbrida).

Proyección READ-ONLY sobre el RESOURCE_REGISTRY: expone, filtradas por RBAC del usuario, las
plantillas REGISTRADAS (recurso + modos create/edit/review), su contrato de prellenado (campos
sugeribles y obligatorios, reflejados del esquema ya declarado) y las acciones permitidas. No
duplica esquemas ni define modelos nuevos; nunca muta.
"""

from backend.app.agent_templates.catalog import build_template_catalog

__all__ = ["build_template_catalog"]
