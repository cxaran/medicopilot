"""Reportes agregados de calidad/auditoría (G5 fase 2, sólo lectura).

Endpoints gateados por ``reports:read`` que devuelven AGREGADOS (etiquetas +
conteos/series): nunca filas con PHI del paciente. Construidos sobre la misma infra
que la cohorte de la fase 1 (expresiones ORM de SQLAlchemy, no SQL crudo) y respetando
la baja lógica (se excluyen filas eliminadas).

El bucketing por mes usa la zona horaria de aplicación de forma consistente con
``query/calendar.py``: el límite de un mes es la medianoche de pared del día 1 en esa
zona, convertida a UTC naive para comparar contra las columnas ``datetime`` (naive UTC).
Las ventanas por fecha reutilizan los helpers de límite de día de ``query/calendar.py``.

Reportes:

- ``activity``      consultas y citas por mes en un rango, opcional por médico.
- ``top_diagnoses`` ranking de diagnósticos (por código si existe, si no texto
                    normalizado) en una ventana, con límite opcional.
- ``unsigned_notes``conteo de consultas en borrador (sin firmar) por médico.
- ``attendance``    tasas de resultado de citas (asistió/no asistió/cancelada) en una
                    ventana, opcional por médico.
"""

from datetime import date, datetime, timedelta
from typing import Annotated, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from backend.app.api.resource_actions import api_error
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.models.appointment import Appointment
from backend.app.models.consultation import Consultation
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.doctor import Doctor
from backend.app.models.enums import AppointmentStatus, ConsultationStatus
from backend.app.query.calendar import day_start_utc, next_day_start_utc
from backend.app.schemas.report import (
    ActivityPoint,
    AttendanceReport,
    TopDiagnosis,
    UnsignedNotesItem,
)
from backend.app.security.groups.reports import ReportsPermissions

router = APIRouter(prefix="/reports", tags=["reports"])

# Tope defensivo: una serie de actividad no debe abarcar más de 60 meses (el reporte
# emite una consulta de conteo por mes y entidad).
_MAX_ACTIVITY_MONTHS = 60

_INVALID_RANGE = "El rango de fechas es inválido: date_to no puede ser anterior a date_from."
_RANGE_TOO_LARGE = "El rango de actividad no puede exceder 60 meses."


def _app_tz() -> ZoneInfo:
    return ZoneInfo(settings.application_timezone)


def _month_start_utc(year: int, month: int, tz: ZoneInfo) -> datetime:
    """Inicio del mes (medianoche de pared del día 1 en ``tz``) como ``datetime`` UTC naive."""
    local = datetime(year, month, 1, tzinfo=tz)
    return local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def _next_month_start_utc(year: int, month: int, tz: ZoneInfo) -> datetime:
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return _month_start_utc(next_year, next_month, tz)


def _iter_months(date_from: date, date_to: date) -> list[tuple[int, int]]:
    """Lista de (año, mes) que toca el rango, de date_from a date_to inclusive."""
    months: list[tuple[int, int]] = []
    year, month = date_from.year, date_from.month
    while (year, month) <= (date_to.year, date_to.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def _validate_window(date_from: date, date_to: date) -> None:
    if date_to < date_from:
        api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_query", _INVALID_RANGE)


@router.get("/activity", response_model=list[ActivityPoint])
def report_activity(
    session: SessionDep,
    date_from: Annotated[date, Query(description="Inicio del rango (YYYY-MM-DD), inclusivo.")],
    date_to: Annotated[date, Query(description="Fin del rango (YYYY-MM-DD), inclusivo.")],
    _: ReportsPermissions.READ.requiere,
    doctor_id: Annotated[Optional[UUID], Query(description="Filtra por médico.")] = None,
) -> list[ActivityPoint]:
    _validate_window(date_from, date_to)
    months = _iter_months(date_from, date_to)
    if len(months) > _MAX_ACTIVITY_MONTHS:
        api_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid_query", _RANGE_TOO_LARGE)

    tz = _app_tz()
    # El rango exacto pedido (recorta meses parciales en los extremos).
    range_start = day_start_utc(date_from, tz)
    range_end = next_day_start_utc(date_to, tz)

    points: list[ActivityPoint] = []
    for year, month in months:
        low = max(_month_start_utc(year, month, tz), range_start)
        high = min(_next_month_start_utc(year, month, tz), range_end)

        cons_stmt = select(func.count()).select_from(Consultation).where(
            Consultation.deleted_at.is_(None),
            Consultation.consulted_at >= low,
            Consultation.consulted_at < high,
        )
        # Las citas se agendan por FECHA civil (sin hora obligatoria): se cuentan por
        # ``scheduled_date`` en los límites de mes en fecha civil, recortados al rango pedido.
        appt_low = max(date(year, month, 1), date_from)
        appt_high = min(date(year + month // 12, month % 12 + 1, 1), date_to + timedelta(days=1))
        appt_stmt = select(func.count()).select_from(Appointment).where(
            Appointment.deleted_at.is_(None),
            Appointment.scheduled_date >= appt_low,
            Appointment.scheduled_date < appt_high,
        )
        if doctor_id is not None:
            cons_stmt = cons_stmt.where(Consultation.attending_doctor_id == doctor_id)
            appt_stmt = appt_stmt.where(Appointment.doctor_id == doctor_id)

        points.append(
            ActivityPoint(
                period=f"{year:04d}-{month:02d}",
                consultations=session.execute(cons_stmt).scalar_one(),
                appointments=session.execute(appt_stmt).scalar_one(),
            )
        )
    return points


@router.get("/top-diagnoses", response_model=list[TopDiagnosis])
def report_top_diagnoses(
    session: SessionDep,
    date_from: Annotated[date, Query(description="Inicio de la ventana (YYYY-MM-DD), inclusivo.")],
    date_to: Annotated[date, Query(description="Fin de la ventana (YYYY-MM-DD), inclusivo.")],
    _: ReportsPermissions.READ.requiere,
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de diagnósticos.")] = 10,
) -> list[TopDiagnosis]:
    _validate_window(date_from, date_to)
    tz = _app_tz()
    range_start = day_start_utc(date_from, tz)
    range_end = next_day_start_utc(date_to, tz)

    # Clave de agrupación: el código si está presente (no vacío), si no el texto
    # normalizado (minúsculas, sin espacios en los extremos).
    key = func.coalesce(
        func.nullif(func.trim(ConsultationDiagnosis.code), ""),
        func.lower(func.trim(ConsultationDiagnosis.diagnosis_text)),
    )
    stmt = (
        select(key.label("code_or_text"), func.count().label("count"))
        .select_from(ConsultationDiagnosis)
        .join(Consultation, Consultation.id == ConsultationDiagnosis.consultation_id)
        .where(
            ConsultationDiagnosis.deleted_at.is_(None),
            Consultation.deleted_at.is_(None),
            Consultation.consulted_at >= range_start,
            Consultation.consulted_at < range_end,
        )
        .group_by(key)
        .order_by(func.count().desc(), key.asc())
        .limit(limit)
    )
    return [
        TopDiagnosis(code_or_text=code_or_text, count=count)
        for code_or_text, count in session.execute(stmt).all()
    ]


@router.get("/unsigned-notes", response_model=list[UnsignedNotesItem])
def report_unsigned_notes(
    session: SessionDep,
    _: ReportsPermissions.READ.requiere,
    doctor_id: Annotated[Optional[UUID], Query(description="Filtra por médico.")] = None,
) -> list[UnsignedNotesItem]:
    # Consultas en borrador (estado real ConsultationStatus.DRAFT), agrupadas por médico.
    stmt = (
        select(
            Doctor.id.label("doctor_id"),
            Doctor.professional_name.label("doctor_name"),
            func.count().label("count"),
        )
        .select_from(Consultation)
        .join(Doctor, Doctor.id == Consultation.attending_doctor_id)
        .where(
            Consultation.deleted_at.is_(None),
            Consultation.status == ConsultationStatus.DRAFT,
        )
        .group_by(Doctor.id, Doctor.professional_name)
        .order_by(func.count().desc(), Doctor.professional_name.asc())
    )
    if doctor_id is not None:
        stmt = stmt.where(Consultation.attending_doctor_id == doctor_id)
    return [
        UnsignedNotesItem(doctor_id=doctor_id, doctor_name=doctor_name, count=count)
        for doctor_id, doctor_name, count in session.execute(stmt).all()
    ]


@router.get("/attendance", response_model=AttendanceReport)
def report_attendance(
    session: SessionDep,
    date_from: Annotated[date, Query(description="Inicio de la ventana (YYYY-MM-DD), inclusivo.")],
    date_to: Annotated[date, Query(description="Fin de la ventana (YYYY-MM-DD), inclusivo.")],
    _: ReportsPermissions.READ.requiere,
    doctor_id: Annotated[Optional[UUID], Query(description="Filtra por médico.")] = None,
) -> AttendanceReport:
    _validate_window(date_from, date_to)

    def _count(outcome: AppointmentStatus) -> int:
        # Citas por FECHA civil (sin hora obligatoria): ventana inclusiva [date_from, date_to].
        stmt = select(func.count()).select_from(Appointment).where(
            Appointment.deleted_at.is_(None),
            Appointment.scheduled_date >= date_from,
            Appointment.scheduled_date <= date_to,
            Appointment.status == outcome,
        )
        if doctor_id is not None:
            stmt = stmt.where(Appointment.doctor_id == doctor_id)
        return session.execute(stmt).scalar_one()

    attended = _count(AppointmentStatus.ATTENDED)
    no_show = _count(AppointmentStatus.NO_SHOW)
    cancelled = _count(AppointmentStatus.CANCELLED)
    total = attended + no_show + cancelled

    def _rate(value: int) -> float:
        return round(value / total, 4) if total else 0.0

    return AttendanceReport(
        attended=attended,
        no_show=no_show,
        cancelled=cancelled,
        total=total,
        attended_rate=_rate(attended),
        no_show_rate=_rate(no_show),
        cancelled_rate=_rate(cancelled),
    )
