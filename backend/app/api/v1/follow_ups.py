"""Pendientes de seguimiento del médico: ``GET /follow-ups/summary`` (sólo lectura).

Gateado por ``follow_ups:read``. Reúne tres grupos accionables a partir de modelos YA existentes
(sin modelo/migración nuevos): tareas clínicas abiertas/vencidas, citas recientes a las que el
paciente no asistió (no_show) o que se cancelaron, y resultados de laboratorio anormales sin
revisar. Consulta y cómputo PUROS: no persiste, no escribe, no muta y no inventa. Respeta el
borrado lógico (excluye ``deleted_at`` no nulo). Cada elemento cita el id (y la etiqueta) del
registro para que el médico pueda actuar; toda salida es para su REVISIÓN, nunca una acción.
"""

from datetime import timedelta
from typing import Annotated, Literal, Optional, cast
from uuid import UUID

from fastapi import APIRouter, Query
from sqlmodel import Session, select

from backend.app.core.database import SessionDep
from backend.app.models.appointment import Appointment
from backend.app.models.clinical_task import ClinicalTask
from backend.app.models.enums import (
    AppointmentStatus,
    ClinicalTaskPriority,
    ClinicalTaskStatus,
    LabResultAbnormalFlag,
)
from backend.app.models.lab_result import LabResult
from backend.app.models.patient import Patient
from backend.app.schemas.follow_up import (
    FollowUpSummaryResponse,
    MissedAppointmentRead,
    PendingTaskRead,
    UnreviewedAbnormalLabRead,
)
from backend.app.security.groups.follow_ups import FollowUpPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/follow-ups", tags=["follow-ups"])

# Ventana por defecto (días) para las citas no asistidas/canceladas recientes.
_DEFAULT_APPOINTMENT_LOOKBACK_DAYS = 30

# Resultados de laboratorio que cuentan como "anormales" (fuera de rango): no 'normal' ni
# 'unknown' (este último es 'sin clasificar', no implica anormalidad).
_ABNORMAL_FLAGS = (
    LabResultAbnormalFlag.LOW,
    LabResultAbnormalFlag.HIGH,
    LabResultAbnormalFlag.CRITICAL,
)

# Citas que indican que el paciente no acudió (para seguimiento del médico).
_MISSED_STATUSES = (AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED)

# Orden de prioridad clínica (alto primero); el valor del enum no ordena clínicamente.
_PRIORITY_RANK = {
    ClinicalTaskPriority.HIGH: 0,
    ClinicalTaskPriority.MEDIUM: 1,
    ClinicalTaskPriority.LOW: 2,
}


def _patient_labels(session: Session, patient_ids: set[UUID]) -> dict[UUID, str]:
    """Mapa id->nombre de los pacientes referidos (una sola consulta; no filtra por borrado)."""
    ids = {pid for pid in patient_ids if pid is not None}
    if not ids:
        return {}
    rows = session.execute(
        select(Patient.id, Patient.full_name).where(Patient.id.in_(ids))
    ).all()
    return {row[0]: row[1] for row in rows}


def _pending_tasks(session: Session) -> list[ClinicalTask]:
    """Tareas clínicas ABIERTAS (no hechas ni canceladas) y no eliminadas."""
    tasks = list(
        session.execute(
            select(ClinicalTask).where(
                ClinicalTask.status == ClinicalTaskStatus.OPEN,
                ClinicalTask.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    # Orden: prioridad alta primero; luego por vencimiento (los que tienen due_at antes; los
    # sin due_at al final).
    far_future = utc_now() + timedelta(days=365 * 100)
    tasks.sort(key=lambda t: (_PRIORITY_RANK.get(t.priority, 99), t.due_at or far_future))
    return tasks


def _missed_appointments(session: Session, lookback_days: int) -> list[Appointment]:
    """Citas no asistidas (no_show) o canceladas dentro de la ventana reciente, no eliminadas."""
    since = utc_now() - timedelta(days=lookback_days)
    return list(
        session.execute(
            select(Appointment)
            .where(
                Appointment.status.in_(_MISSED_STATUSES),
                Appointment.scheduled_at >= since,
                Appointment.deleted_at.is_(None),
            )
            .order_by(Appointment.scheduled_at.desc())
        ).scalars().all()
    )


def _unreviewed_abnormal_labs(session: Session) -> list[LabResult]:
    """Resultados anormales (low/high/critical) SIN revisar (reviewed_at nulo), no eliminados."""
    return list(
        session.execute(
            select(LabResult)
            .where(
                LabResult.reviewed_at.is_(None),
                LabResult.abnormal_flag.in_(_ABNORMAL_FLAGS),
                LabResult.deleted_at.is_(None),
            )
            .order_by(LabResult.measured_at.desc())
        ).scalars().all()
    )


@router.get("/summary", response_model=FollowUpSummaryResponse)
def get_follow_ups_summary(
    session: SessionDep,
    _: FollowUpPermissions.READ.requiere,
    appointment_lookback_days: Annotated[int, Query(ge=1, le=365)] = (
        _DEFAULT_APPOINTMENT_LOOKBACK_DAYS
    ),
) -> FollowUpSummaryResponse:
    """Reúne los pendientes de seguimiento del médico. Sólo lectura; no muta nada."""
    now = utc_now()
    tasks = _pending_tasks(session)
    appointments = _missed_appointments(session, appointment_lookback_days)
    labs = _unreviewed_abnormal_labs(session)

    patient_ids: set[UUID] = set()
    for task in tasks:
        if task.patient_id is not None:
            patient_ids.add(task.patient_id)
    for appt in appointments:
        patient_ids.add(appt.patient_id)
    for lab in labs:
        patient_ids.add(lab.patient_id)
    labels = _patient_labels(session, patient_ids)

    def _label(pid: Optional[UUID]) -> Optional[str]:
        return labels.get(pid) if pid is not None else None

    pending_tasks = [
        PendingTaskRead(
            task_id=task.id,
            title=task.title,
            patient_id=task.patient_id,
            patient_label=_label(task.patient_id),
            priority=task.priority.value,
            status="open",
            due_at=task.due_at,
            overdue=task.due_at is not None and task.due_at < now,
        )
        for task in tasks
    ]
    missed_appointments = [
        MissedAppointmentRead(
            appointment_id=appt.id,
            patient_id=appt.patient_id,
            patient_label=_label(appt.patient_id),
            doctor_id=appt.doctor_id,
            scheduled_at=appt.scheduled_at,
            # El query ya restringe a no_show/cancelled (ver _MISSED_STATUSES).
            status=cast(Literal["no_show", "cancelled"], appt.status.value),
            reason=appt.reason,
        )
        for appt in appointments
    ]
    unreviewed_abnormal_labs = [
        UnreviewedAbnormalLabRead(
            lab_result_id=lab.id,
            patient_id=lab.patient_id,
            patient_label=_label(lab.patient_id),
            analyte_name=lab.analyte_name,
            # El query ya restringe a low/high/critical (ver _ABNORMAL_FLAGS).
            abnormal_flag=cast(Literal["low", "high", "critical"], lab.abnormal_flag.value),
            value_numeric=float(lab.value_numeric) if lab.value_numeric is not None else None,
            value_text=lab.value_text,
            unit=lab.unit,
            measured_at=lab.measured_at,
        )
        for lab in labs
    ]

    return FollowUpSummaryResponse(
        generated_at=now,
        appointment_lookback_days=appointment_lookback_days,
        pending_tasks_count=len(pending_tasks),
        pending_tasks=pending_tasks,
        missed_appointments_count=len(missed_appointments),
        missed_appointments=missed_appointments,
        unreviewed_abnormal_labs_count=len(unreviewed_abnormal_labs),
        unreviewed_abnormal_labs=unreviewed_abnormal_labs,
    )
