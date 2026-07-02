"""Conciliación de medicación: ``GET /patients/{id}/medication-reconciliation`` (sólo lectura).

Gateado por ``medication_reconciliation:read``. Consolida la medicación ACTIVA del paciente desde
lo PRESCRITO (recetas no anuladas/no eliminadas) y lo REPORTADO (PatientClinicalItem
'medicamento actual' activo), de-duplica por ingrediente/clase con el resolutor de farmacología
configurable, y MARCA discrepancias para revisión del médico. No persiste, no escribe, no muta y
no inventa. Valida que el paciente exista y no esté eliminado (404).
"""

from uuid import UUID

from fastapi import APIRouter
from sqlmodel import select

from backend.app.api.resource_actions import get_active_or_404
from backend.app.core.database import SessionDep
from backend.app.models.consultation import Consultation
from backend.app.models.enums import (
    ClinicalItemStatus,
    PatientClinicalItemType,
    PrescriptionStatus,
)
from backend.app.models.patient import Patient
from backend.app.models.patient_clinical_item import PatientClinicalItem
from backend.app.models.prescription import Prescription, PrescriptionItem
from backend.app.medication_reconciliation import (
    ResolvedMedication,
    reconcile_medications,
)
from backend.app.quality_checks import pharmacology_source_available, resolve_pharmacology
from backend.app.schemas.medication_reconciliation import (
    ConsolidatedMedicationRead,
    MedicationReconciliationResponse,
    ReconciliationFlagRead,
)
from backend.app.security.groups.medication_reconciliation import (
    MedicationReconciliationPermissions,
)

router = APIRouter(prefix="/patients", tags=["medication-reconciliation"])

_PATIENT_NOT_FOUND = "Paciente no encontrado"


@router.get(
    "/{patient_id}/medication-reconciliation",
    response_model=MedicationReconciliationResponse,
)
def reconcile_patient_medications(
    patient_id: UUID,
    session: SessionDep,
    _: MedicationReconciliationPermissions.READ.requiere,
) -> MedicationReconciliationResponse:
    """Concilia la medicación del paciente. Sólo lectura; no muta nada."""
    patient = get_active_or_404(session, Patient, patient_id, _PATIENT_NOT_FOUND)

    # PRESCRITO: medicamentos de recetas ACTIVAS (no anuladas ni eliminadas) del paciente.
    prescription_ids = list(
        session.execute(
            select(Prescription.id)
            .join(Consultation, Consultation.id == Prescription.consultation_id)
            .where(
                Consultation.patient_id == patient.id,
                Consultation.deleted_at.is_(None),
                Prescription.status != PrescriptionStatus.VOIDED,
                Prescription.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    prescribed: list[PrescriptionItem] = []
    if prescription_ids:
        prescribed = list(
            session.execute(
                select(PrescriptionItem).where(
                    PrescriptionItem.prescription_id.in_(prescription_ids),
                    PrescriptionItem.deleted_at.is_(None),
                )
            ).scalars().all()
        )

    # REPORTADO: medicamentos que el paciente reporta tomar ('medicamento actual' activo).
    reported = list(
        session.execute(
            select(PatientClinicalItem).where(
                PatientClinicalItem.patient_id == patient.id,
                PatientClinicalItem.item_type == PatientClinicalItemType.CURRENT_MEDICATION,
                PatientClinicalItem.status == ClinicalItemStatus.ACTIVE,
                PatientClinicalItem.deleted_at.is_(None),
            )
        ).scalars().all()
    )

    configured = pharmacology_source_available()
    responded = False
    resolved: list[ResolvedMedication] = []

    def _resolve(ref: str, name: str, source: str) -> ResolvedMedication:
        nonlocal responded
        res = resolve_pharmacology(name)
        if res.available:
            responded = True
        covered = res.available and bool(res.ingredients or res.classes)
        return ResolvedMedication(
            ref=ref,
            name=name,
            source=source,  # type: ignore[arg-type]
            ingredients=res.ingredients,
            classes=res.classes,
            covered=covered,
        )

    for item in prescribed:
        resolved.append(_resolve(f"prescription_item:{item.id}", item.medication_name, "prescribed"))
    for item in reported:
        resolved.append(_resolve(f"patient_clinical_item:{item.id}", item.title, "reported"))

    source_available = configured and (not resolved or responded)

    consolidated, flags = reconcile_medications(resolved, source_available=source_available)

    return MedicationReconciliationResponse(
        patient_id=patient.id,
        consolidated=[
            ConsolidatedMedicationRead(
                key=c.key,
                display_name=c.display_name,
                ingredient_or_class=c.ingredient_or_class,
                resolver_status=c.resolver_status,  # type: ignore[arg-type]
                prescribed_refs=list(c.prescribed_refs),
                reported_refs=list(c.reported_refs),
            )
            for c in consolidated
        ],
        flags=[
            ReconciliationFlagRead(
                kind=f.kind,  # type: ignore[arg-type]
                message=f.message_es,
                source_refs=list(f.source_refs),
                ingredient_or_class=f.ingredient_or_class,
                resolver_status=f.resolver_status,  # type: ignore[arg-type]
            )
            for f in flags
        ],
        flag_count=len(flags),
        resolver_available=source_available,
    )
