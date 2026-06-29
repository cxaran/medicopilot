"""Administración del expediente administrativo de pacientes.

CRUD bajo permisos de administración (``patients:*``). La baja es lógica
(``deleted_at``/``deleted_by``), no física; el estado funcional del paciente
(``active``/``inactive``/``archived``) se gestiona por ``status`` vía PATCH y es
independiente de la eliminación. Los listados excluyen los expedientes eliminados.
"""

from datetime import date
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import or_
from sqlmodel import Session, select

from backend.app.api.resource_actions import (
    api_error,
    create_entity,
    get_or_404,
    paginate_resource,
    patch_entity,
    serialize,
    soft_delete_entity,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.patient import Patient
from backend.app.patient_search import (
    CandidateInput,
    SearchQuery,
    normalize_phone,
    rank_candidates,
)
from backend.app.resources.registry import PATIENTS
from backend.app.schemas.patient import (
    PatientCreate,
    PatientListItem,
    PatientRead,
    PatientUpdate,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.patient_search import (
    PatientSearchCandidate,
    PatientSearchResponse,
)
from backend.app.security.groups.patients import PatientPermissions
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/patients", tags=["patients"])

_NOT_FOUND = "Paciente no encontrado"
_CONFLICT = "Ya existe un paciente con ese número de expediente o esa CURP"

# Cota de seguridad de filas a puntuar en Python cuando se busca SÓLO por nombre (sin
# identificador exacto que acote en SQL). A escala de consultorio nunca se alcanza; evita un
# escaneo no acotado. La puntuación es insensible a acentos/mayúsculas (por eso no se depende de
# ILIKE para el nombre, que en Postgres es sensible a acentos).
_SEARCH_SCAN_CAP = 2000
# Niveles que cuentan como posible DUPLICADO para advertir antes de crear.
_STRONG_TIERS = frozenset({"exacto", "fuerte"})


def _compute_age(birth_date: date) -> int:
    """Edad en años cumplidos a hoy (UTC)."""
    today = utc_now().date()
    return today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )


def _mask_phone(phone: Optional[str]) -> Optional[str]:
    """Enmascara el teléfono dejando visibles sólo los últimos 4 dígitos (p. ej. ******1234)."""
    digits = normalize_phone(phone)
    if not digits:
        return None
    if len(digits) <= 4:
        return "*" * len(digits)
    return "*" * (len(digits) - 4) + digits[-4:]


def _get_active_patient(session: Session, patient_id: UUID) -> Patient:
    """Obtiene un paciente no eliminado; un expediente con baja lógica responde 404."""
    patient = get_or_404(session, Patient, patient_id, _NOT_FOUND)
    if patient.deleted_at is not None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return patient


@router.get("", response_model=OffsetPage[PatientListItem])
def list_patients(
    session: SessionDep,
    query: Annotated[PATIENTS.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: PatientPermissions.READ.requiere,
) -> OffsetPage[PatientListItem]:
    # Scope base: solo expedientes vigentes (excluye los eliminados lógicamente).
    # Los estados inactive/archived NO se ocultan: se filtran explícitamente por ``status``.
    stmt = select(Patient).where(Patient.deleted_at.is_(None))
    return paginate_resource(PATIENTS, session, query, stmt=stmt)


@router.get("/search", response_model=PatientSearchResponse)
def search_patients(
    session: SessionDep,
    _: PatientPermissions.READ.requiere,
    name: Annotated[Optional[str], Query(description="Nombre o parte del nombre (difuso).")] = None,
    phone: Annotated[Optional[str], Query(description="Teléfono (se compara por dígitos).")] = None,
    curp: Annotated[Optional[str], Query(description="CURP exacta.")] = None,
    birth_date: Annotated[Optional[date], Query(description="Fecha de nacimiento (AAAA-MM-DD).")] = None,
    email: Annotated[Optional[str], Query(description="Correo exacto.")] = None,
    limit: Annotated[int, Query(ge=1, le=50, description="Máximo de candidatos.")] = 10,
) -> PatientSearchResponse:
    """Busca pacientes existentes por señales de identidad y devuelve candidatos ORDENADOS por un
    puntaje determinista, para que el médico ELIJA una coincidencia o cree un expediente nuevo.

    Sirve también para DEDUPLICAR antes de crear: pasando los datos propuestos (nombre + fecha +
    teléfono/CURP), ``has_strong_match`` indica si ya existe un posible duplicado. Sólo lectura:
    nunca crea ni modifica, y por debajo del umbral devuelve vacío (no fabrica coincidencias).
    Excluye expedientes eliminados y expone únicamente campos seguros para la tarjeta de selección.
    """
    query = SearchQuery(
        name=name, phone=phone, curp=curp, birth_date=birth_date, email=email
    )
    if not query.has_any():
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "validation_error",
            "Se requiere al menos un criterio de búsqueda.",
        )

    # Scope base: sólo expedientes vigentes. Se acota por SQL con los identificadores exactos
    # (CURP/correo/fecha) y un prefiltro de teléfono/nombre; el orden y la puntuación finos se
    # hacen en Python (insensible a acentos/mayúsculas, portable, sin pg_trgm).
    # Se carga la entidad y se proyecta SÓLO a campos seguros más abajo (nunca se devuelve el
    # expediente completo). A escala de consultorio (acotado por _SEARCH_SCAN_CAP) es suficiente.
    stmt = select(Patient).where(Patient.deleted_at.is_(None))

    conditions = []
    if curp:
        conditions.append(Patient.curp == curp.strip().upper())
    if email:
        conditions.append(Patient.email.ilike(email.strip()))
    if birth_date is not None:
        conditions.append(Patient.birth_date == birth_date)
    phone_digits = normalize_phone(phone)
    if len(phone_digits) >= 4:
        conditions.append(Patient.phone.ilike(f"%{phone_digits[-4:]}%"))
    if name:
        # Prefiltro por token (capta el caso ASCII común); el caso con acentos lo cubre el
        # escaneo acotado + la puntuación en Python.
        for token in name.split():
            conditions.append(Patient.full_name.ilike(f"%{token}%"))

    # Con identificadores se acota por SQL; buscando SÓLO por nombre se escanea acotado para no
    # perder coincidencias con acentos que ILIKE (sensible a acentos en Postgres) no atraparía.
    if conditions and (curp or email or birth_date is not None or phone_digits):
        stmt = stmt.where(or_(*conditions))
    stmt = stmt.limit(_SEARCH_SCAN_CAP)

    candidates = [
        CandidateInput(
            # ``sex`` es un enum no-nativo: se proyecta su valor ('male'/...), no 'Sex.MALE'.
            id=p.id, full_name=p.full_name, birth_date=p.birth_date,
            sex=getattr(p.sex, "value", p.sex),
            phone=p.phone, email=p.email, curp=p.curp,
        )
        for p in session.execute(stmt).scalars().all()
    ]
    ranked = rank_candidates(query, candidates, limit)

    cards = [
        PatientSearchCandidate(
            id=s.candidate.id,
            full_name=s.candidate.full_name,
            birth_year=s.candidate.birth_date.year,
            age=_compute_age(s.candidate.birth_date),
            sex=s.candidate.sex,
            phone_masked=_mask_phone(s.candidate.phone),
            score=s.score,
            tier=s.tier,
            reasons=list(s.reasons),
        )
        for s in ranked
    ]
    return PatientSearchResponse(
        count=len(cards),
        has_strong_match=any(s.tier in _STRONG_TIERS for s in ranked),
        candidates=cards,
    )


@router.get("/{patient_id}", response_model=PatientRead)
def get_patient(
    patient_id: UUID,
    session: SessionDep,
    _: PatientPermissions.READ.requiere,
) -> PatientRead:
    return serialize(PatientRead, _get_active_patient(session, patient_id))


@router.post("", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.CREATE.requiere,
) -> PatientRead:
    # ``record_number`` no viene en el payload: lo genera la base de datos (identity).
    patient = create_entity(
        session,
        Patient,
        payload,
        values={"created_by": current_user.id, "updated_by": current_user.id},
        conflict_message=_CONFLICT,
    )
    return serialize(PatientRead, patient)


@router.patch("/{patient_id}", response_model=PatientRead)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.UPDATE.requiere,
) -> PatientRead:
    patient = _get_active_patient(session, patient_id)
    patient = patch_entity(
        session,
        patient,
        payload,
        actor_id=current_user.id,
        conflict_message=_CONFLICT,
    )
    return serialize(PatientRead, patient)


@router.delete("/{patient_id}", response_model=PatientRead)
def delete_patient(
    patient_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: PatientPermissions.DELETE.requiere,
) -> PatientRead:
    patient = _get_active_patient(session, patient_id)
    patient = soft_delete_entity(
        session,
        patient,
        actor_id=current_user.id,
        already_deleted_message="El paciente ya fue eliminado",
    )
    return serialize(PatientRead, patient)
