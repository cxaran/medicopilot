"""Consulta de cohorte poblacional (G5 fase 1, sólo lectura).

Endpoint agregado y gateado por ``population:read`` que CUENTA y lista una muestra
de pacientes que cumplen criterios estructurados combinados con AND. No expone PHI
más allá de lo que el RBAC ya permite y nunca incluye pacientes con baja lógica
(``deleted_at IS NOT NULL``).

Por qué no se usa el sistema de operadores por query-string del registro de
recursos: esos filtros operan sobre columnas directas de UNA tabla y no pueden
expresar subconsultas ``EXISTS`` entre tablas (diagnósticos, laboratorio, signos
vitales y citas viven en tablas distintas, y dos de ellas sólo se relacionan con el
paciente a través de la consulta) ni derivar la edad desde la fecha de nacimiento.
Se construyen por tanto con el lenguaje de expresiones de SQLAlchemy (no SQL
crudo). Las ventanas de fecha reutilizan los helpers de límite de día de
``query/calendar.py`` para conservar la misma semántica inclusiva y con zona horaria
de aplicación que el resto de los filtros de fecha del sistema.

El resultado es un CONTEO de cohorte para revisión del médico: no es una lista para
contactar pacientes ni se actúa sobre ella automáticamente.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, status
from sqlalchemy import ColumnElement, func, literal, or_, select
from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlmodel import Session

from backend.app.api.resource_actions import api_error
from backend.app.core.database import SessionDep
from backend.app.core.settings import settings
from backend.app.models.appointment import Appointment
from backend.app.models.consultation import Consultation
from backend.app.models.consultation_diagnosis import ConsultationDiagnosis
from backend.app.models.enums import AppointmentStatus, LabResultAbnormalFlag
from backend.app.models.lab_result import LabResult
from backend.app.models.patient import Patient
from backend.app.models.vital_sign import VitalSign
from backend.app.query.calendar import day_start_utc, next_day_start_utc
from backend.app.query.search import escape_like
from backend.app.schemas.cohort import (
    AppointmentNoShowCriterion,
    CohortCriteria,
    CohortPatient,
    CohortResult,
    Comparator,
    HasDiagnosisCriterion,
    LabAbnormalCriterion,
    VitalMetric,
    VitalThresholdCriterion,
)
from backend.app.security.groups.population import PopulationPermissions
from backend.app.services.institutional_settings import resolve_vital_threshold

router = APIRouter(prefix="/population", tags=["population"])

# Marcas de laboratorio que cuentan como "anormal" para una cohorte clínica.
_ABNORMAL_FLAGS = (
    LabResultAbnormalFlag.LOW,
    LabResultAbnormalFlag.HIGH,
    LabResultAbnormalFlag.CRITICAL,
)

# Columnas permitidas para el umbral de signo vital (lista blanca: el cliente sólo
# elige de este conjunto, nunca un nombre de columna arbitrario).
_VITAL_COLUMNS: dict[VitalMetric, InstrumentedAttribute] = {
    VitalMetric.SYSTOLIC_BP: VitalSign.systolic_bp,
    VitalMetric.DIASTOLIC_BP: VitalSign.diastolic_bp,
    VitalMetric.HEART_RATE_BPM: VitalSign.heart_rate_bpm,
    VitalMetric.RESPIRATORY_RATE_RPM: VitalSign.respiratory_rate_rpm,
    VitalMetric.OXYGEN_SATURATION: VitalSign.oxygen_saturation,
    VitalMetric.TEMPERATURE_C: VitalSign.temperature_c,
    VitalMetric.WEIGHT_KG: VitalSign.weight_kg,
    VitalMetric.HEIGHT_CM: VitalSign.height_cm,
    VitalMetric.CAPILLARY_GLUCOSE: VitalSign.capillary_glucose,
    VitalMetric.PAIN_SCALE: VitalSign.pain_scale,
}


def _subtract_years(value: date, years: int) -> date:
    """Resta ``years`` años a una fecha; el 29 de febrero cae al 28 en años no bisiestos."""
    try:
        return value.replace(year=value.year - years)
    except ValueError:
        return value.replace(year=value.year - years, day=28)


def _date_window(
    column: InstrumentedAttribute,
    date_from: date | None,
    date_to: date | None,
    tz: ZoneInfo,
) -> list[ColumnElement[bool]]:
    """Ventana de fechas inclusiva sobre una columna ``datetime`` (límites de día)."""
    clauses: list[ColumnElement[bool]] = []
    if date_from is not None:
        clauses.append(column >= day_start_utc(date_from, tz))
    if date_to is not None:
        clauses.append(column < next_day_start_utc(date_to, tz))
    return clauses


def _has_diagnosis_exists(criterion: HasDiagnosisCriterion) -> ColumnElement[bool]:
    """EXISTS: el paciente tiene un diagnóstico de consulta que coincide.

    Se une con la consulta (los diagnósticos no referencian al paciente directamente)
    y se excluyen consultas y diagnósticos eliminados lógicamente.
    """
    clauses: list[ColumnElement[bool]] = [
        Consultation.patient_id == Patient.id,
        Consultation.deleted_at.is_(None),
        ConsultationDiagnosis.deleted_at.is_(None),
    ]
    if criterion.code:
        clauses.append(func.lower(ConsultationDiagnosis.code) == criterion.code.lower())
    if criterion.text:
        pattern = f"%{escape_like(criterion.text)}%"
        clauses.append(ConsultationDiagnosis.diagnosis_text.ilike(pattern, escape="\\"))
    return (
        select(literal(1))
        .select_from(ConsultationDiagnosis)
        .join(Consultation, Consultation.id == ConsultationDiagnosis.consultation_id)
        .where(*clauses)
        .exists()
    )


def _lab_abnormal_exists(
    criterion: LabAbnormalCriterion, tz: ZoneInfo
) -> ColumnElement[bool]:
    """EXISTS: el paciente tiene un resultado anormal del analito en la ventana."""
    pattern = f"%{escape_like(criterion.analyte)}%"
    clauses: list[ColumnElement[bool]] = [
        LabResult.patient_id == Patient.id,
        LabResult.deleted_at.is_(None),
        LabResult.abnormal_flag.in_(_ABNORMAL_FLAGS),
        or_(
            LabResult.analyte_name.ilike(pattern, escape="\\"),
            func.lower(LabResult.analyte_code) == criterion.analyte.lower(),
        ),
    ]
    clauses += _date_window(
        LabResult.measured_at, criterion.date_from, criterion.date_to, tz
    )
    return select(literal(1)).select_from(LabResult).where(*clauses).exists()


def _vital_threshold_exists(
    vital: VitalMetric, comparator: Comparator, value: float
) -> ColumnElement[bool]:
    """EXISTS: el paciente tiene una medición de signo vital que cruza el umbral."""
    column = _VITAL_COLUMNS[vital]
    comparisons: dict[Comparator, ColumnElement[bool]] = {
        Comparator.GTE: column >= value,
        Comparator.LTE: column <= value,
        Comparator.GT: column > value,
        Comparator.LT: column < value,
        Comparator.EQ: column == value,
    }
    return (
        select(literal(1))
        .select_from(VitalSign)
        .join(Consultation, Consultation.id == VitalSign.consultation_id)
        .where(
            Consultation.patient_id == Patient.id,
            Consultation.deleted_at.is_(None),
            VitalSign.deleted_at.is_(None),
            column.is_not(None),
            comparisons[comparator],
        )
        .exists()
    )


def _appointment_no_show_exists(
    criterion: AppointmentNoShowCriterion, tz: ZoneInfo
) -> ColumnElement[bool]:
    """EXISTS: el paciente tuvo una cita con inasistencia (no_show) en la ventana."""
    clauses: list[ColumnElement[bool]] = [
        Appointment.patient_id == Patient.id,
        Appointment.deleted_at.is_(None),
        Appointment.status == AppointmentStatus.NO_SHOW,
    ]
    clauses += _date_window(
        Appointment.scheduled_at, criterion.date_from, criterion.date_to, tz
    )
    return select(literal(1)).select_from(Appointment).where(*clauses).exists()


def _resolve_vital_threshold(
    session: Session, criterion: VitalThresholdCriterion
) -> ColumnElement[bool]:
    """Resuelve el umbral de signo vital: valor explícito o configuración institucional.

    Si el criterio trae comparador+valor, se usan tal cual (camino explícito, sin cambios).
    Si no, se lee el umbral de bandera roja configurado para ese signo vital; si no hay
    configuración, responde 422.
    """
    if criterion.comparator is not None and criterion.value is not None:
        return _vital_threshold_exists(
            criterion.vital, criterion.comparator, criterion.value
        )
    resolved = resolve_vital_threshold(session, criterion.vital)
    if resolved is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "missing_threshold",
            f"No hay un umbral configurado para '{criterion.vital.value}'; "
            "indique 'comparator' y 'value' explícitos.",
        )
    comparator, value = resolved
    return _vital_threshold_exists(criterion.vital, comparator, value)


def build_cohort_conditions(
    criteria: CohortCriteria, *, today: date, tz: ZoneInfo, session: Session
) -> list[ColumnElement[bool]]:
    """Traduce los criterios a predicados ORM sobre ``Patient`` (todos AND).

    Siempre se excluye a los pacientes con baja lógica. ``today`` y ``tz`` se inyectan
    para que la edad y las ventanas de fecha sean deterministas y comprobables. La
    ``session`` permite resolver umbrales desde la configuración institucional cuando el
    criterio de signo vital no trae un valor explícito.
    """
    conditions: list[ColumnElement[bool]] = [Patient.deleted_at.is_(None)]

    if criteria.pregnancy_status is not None:
        conditions.append(Patient.pregnancy_status == criteria.pregnancy_status)

    if criteria.age_range is not None:
        age = criteria.age_range
        if age.min_age is not None:
            # edad >= min  <=>  nació en o antes de (hoy - min años).
            conditions.append(Patient.birth_date <= _subtract_years(today, age.min_age))
        if age.max_age is not None:
            # edad <= max  <=>  nació después de (hoy - (max + 1) años).
            conditions.append(Patient.birth_date > _subtract_years(today, age.max_age + 1))

    if criteria.has_diagnosis is not None:
        conditions.append(_has_diagnosis_exists(criteria.has_diagnosis))

    if criteria.lab_abnormal is not None:
        conditions.append(_lab_abnormal_exists(criteria.lab_abnormal, tz))

    if criteria.vital_threshold is not None:
        conditions.append(_resolve_vital_threshold(session, criteria.vital_threshold))

    if criteria.appointment_no_show is not None:
        conditions.append(_appointment_no_show_exists(criteria.appointment_no_show, tz))

    return conditions


@router.post("/cohort", response_model=CohortResult)
def query_cohort(
    payload: CohortCriteria,
    session: SessionDep,
    _: PopulationPermissions.READ.requiere,
) -> CohortResult:
    tz = ZoneInfo(settings.application_timezone)
    today = datetime.now(tz).date()
    conditions = build_cohort_conditions(payload, today=today, tz=tz, session=session)

    count = session.execute(
        select(func.count()).select_from(Patient).where(*conditions)
    ).scalar_one()

    rows = session.execute(
        select(Patient.id, Patient.full_name)
        .where(*conditions)
        .order_by(Patient.full_name, Patient.id)
        .offset(payload.offset)
        .limit(payload.limit)
    ).all()
    sample = [
        CohortPatient(patient_id=row.id, full_name=row.full_name) for row in rows
    ]
    return CohortResult(count=count, sample=sample)
