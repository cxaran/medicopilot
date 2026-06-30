"""Schemas de los pendientes de seguimiento del médico (sólo lectura).

Reúne tres grupos accionables a partir de modelos YA existentes: tareas clínicas abiertas/
vencidas, citas a las que el paciente no asistió, y resultados de laboratorio anormales sin
revisar. Cada elemento cita el id (y la etiqueta) del registro subyacente para que el médico
pueda actuar. No persiste nada ni muta el expediente.
"""

import uuid
from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema


class PendingTaskRead(ApiReadSchema):
    """Una tarea clínica abierta (pendiente o vencida) para revisión."""

    task_id: uuid.UUID
    title: str
    patient_id: Optional[uuid.UUID] = Field(
        default=None, description="Paciente relacionado con la tarea, si aplica."
    )
    patient_label: Optional[str] = Field(
        default=None, description="Nombre del paciente relacionado, si aplica."
    )
    priority: Literal["low", "medium", "high"]
    status: Literal["open"] = Field(description="Sólo se listan tareas abiertas.")
    due_at: Optional[datetime] = Field(default=None, description="Vencimiento, si aplica.")
    overdue: bool = Field(description="True si tiene vencimiento y ya pasó.")


class MissedAppointmentRead(ApiReadSchema):
    """Una cita reciente a la que el paciente no asistió (no_show) o que se canceló."""

    appointment_id: uuid.UUID
    patient_id: uuid.UUID
    patient_label: Optional[str] = Field(default=None)
    doctor_id: uuid.UUID
    scheduled_date: date
    scheduled_time: Optional[time] = Field(
        default=None, description="Hora de la cita, si se había fijado una concreta."
    )
    status: Literal["no_show", "cancelled"]
    reason: str


class UnreviewedAbnormalLabRead(ApiReadSchema):
    """Un resultado de laboratorio anormal (fuera de rango) aún sin revisar."""

    lab_result_id: uuid.UUID
    patient_id: uuid.UUID
    patient_label: Optional[str] = Field(default=None)
    analyte_name: str
    abnormal_flag: Literal["low", "high", "critical"]
    value_numeric: Optional[float] = Field(default=None)
    value_text: Optional[str] = Field(default=None)
    unit: Optional[str] = Field(default=None)
    measured_at: datetime


class FollowUpSummaryResponse(ApiReadSchema):
    """Resumen de pendientes de seguimiento: tres grupos con su conteo y los registros citados.

    Toda salida es para la REVISIÓN del médico; no es una acción ni una corrección automática.
    """

    generated_at: datetime
    appointment_lookback_days: int = Field(
        description="Ventana (días) usada para las citas no asistidas/canceladas."
    )
    pending_tasks_count: int
    pending_tasks: list[PendingTaskRead]
    missed_appointments_count: int
    missed_appointments: list[MissedAppointmentRead]
    unreviewed_abnormal_labs_count: int
    unreviewed_abnormal_labs: list[UnreviewedAbnormalLabRead]
