"""Schemas de los reportes agregados (G5 fase 2, sólo lectura).

Todos los reportes devuelven AGREGADOS (etiquetas + conteos/series): nunca filas con
PHI del paciente. Se gatean con ``reports:read`` y respetan la baja lógica (excluyen
filas eliminadas). El bucketing por mes usa la zona horaria de aplicación, consistente
con ``query/calendar.py``.
"""

from enum import Enum
from uuid import UUID

from backend.app.schemas.base import ApiReadSchema


class ReportType(str, Enum):
    """Tipo de reporte agregado solicitado."""

    ACTIVITY = "activity"
    TOP_DIAGNOSES = "top_diagnoses"
    UNSIGNED_NOTES = "unsigned_notes"
    ATTENDANCE = "attendance"


class ActivityPoint(ApiReadSchema):
    """Actividad de un mes: consultas y citas en el periodo (``YYYY-MM``)."""

    period: str
    consultations: int
    appointments: int


class TopDiagnosis(ApiReadSchema):
    """Frecuencia de un diagnóstico (por código si existe, si no texto normalizado)."""

    code_or_text: str
    count: int


class UnsignedNotesItem(ApiReadSchema):
    """Consultas en borrador (sin firmar) agrupadas por médico tratante."""

    doctor_id: UUID
    doctor_name: str
    count: int


class AttendanceReport(ApiReadSchema):
    """Resultados de citas en una ventana: asistencia vs inasistencia vs cancelación.

    Las tasas son fracciones (0..1) sobre el total de citas resueltas
    (``attended + no_show + cancelled``); 0 cuando no hay citas resueltas.
    """

    attended: int
    no_show: int
    cancelled: int
    total: int
    attended_rate: float
    no_show_rate: float
    cancelled_rate: float
