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
from sqlmodel import select

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

    # Tareas clínicas ABIERTAS (no hechas ni canceladas) y no eliminadas. Orden:
    # prioridad alta primero; luego por vencimiento (con due_at antes; sin due_at al final).
    tasks = list(
        session.execute(
            select(ClinicalTask).where(
                ClinicalTask.status == ClinicalTaskStatus.OPEN,
                ClinicalTask.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    far_future = now + timedelta(days=365 * 100)
    tasks.sort(key=lambda t: (_PRIORITY_RANK.get(t.priority, 99), t.due_at or far_future))

    # Citas no asistidas (no_show) o canceladas dentro de la ventana reciente, no eliminadas.
    # La cita se agenda por FECHA civil (la hora es opcional): la ventana se aplica sobre
    # ``scheduled_date``. El orden desc deja primero las más recientes; dentro del mismo día,
    # las que tienen hora antes que las sin hora (nulls last en desc de PostgreSQL).
    since_date = (now - timedelta(days=appointment_lookback_days)).date()
    appointments = list(
        session.execute(
            select(Appointment)
            .where(
                Appointment.status.in_(_MISSED_STATUSES),
                Appointment.scheduled_date >= since_date,
                Appointment.deleted_at.is_(None),
            )
            .order_by(Appointment.scheduled_date.desc(), Appointment.scheduled_time.desc())
        ).scalars().all()
    )

    # Resultados anormales (low/high/critical) SIN revisar (reviewed_at nulo), no eliminados.
    labs = list(
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

    # Etiquetas id->nombre de los pacientes referidos (una sola consulta; no filtra por borrado).
    patient_ids: set[UUID] = {task.patient_id for task in tasks if task.patient_id is not None}
    patient_ids |= {appt.patient_id for appt in appointments}
    patient_ids |= {lab.patient_id for lab in labs}
    labels: dict[UUID, str] = {}
    if patient_ids:
        labels = {
            row[0]: row[1]
            for row in session.execute(
                select(Patient.id, Patient.full_name).where(Patient.id.in_(patient_ids))
            ).all()
        }

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
            scheduled_date=appt.scheduled_date,
            scheduled_time=appt.scheduled_time,
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
