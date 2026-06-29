import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base


class ScaleResult(Base):
    """Resultado de una escala clínica computada y APROBADA por el médico (borrador P1).

    La fase 1 (registro ``clinical_scales``) calcula escalas de forma determinista y SIN
    estado. Esta tabla persiste un resultado que el médico aprobó, ligado al paciente (y
    opcionalmente a una consulta) para que aparezca en la línea de tiempo. El puntaje, la
    interpretación y la fuente NO se confían al cliente: el servidor RE-COMPUTA desde
    ``scale_id`` + ``inputs`` con el motor determinista de la fase 1 y guarda el valor
    autoritativo, de modo que lo almacenado siempre es consistente con la fórmula citada.

    ``inputs`` se guarda como JSON portable (JSONB en PostgreSQL, JSON en otros motores)
    para preservar exactamente los insumos con los que se computó. La baja es lógica.
    """

    __tablename__ = "scale_results"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece el resultado de la escala.",
    )
    consultation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Consulta en la que se computó la escala, si aplica.",
    )
    scale_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Id de la escala en el registro de código (p. ej. 'cha2ds2_vasc').",
    )
    inputs: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=False,
        comment="Insumos con los que se computó la escala (validados; JSON portable).",
    )
    score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Puntaje autoritativo re-computado por el servidor desde scale_id + inputs.",
    )
    interpretation_label: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Etiqueta de interpretación de la banda del puntaje (p. ej. 'Riesgo alto').",
    )
    source: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Cita de la fuente/guía que sustenta la escala y la banda interpretada.",
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        comment="Fecha y hora en que se computó y guardó el resultado de la escala.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de registro del resultado.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró el resultado.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        onupdate=func.now(),
        nullable=True,
        comment="Fecha y hora de la última edición.",
    )
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que actualizó el resultado.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica del resultado.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente el resultado.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_scale_results_patient", "patient_id"),
        Index("ix_scale_results_scale_id", "scale_id"),
        Index("ix_scale_results_computed_at", "computed_at"),
        Index("ix_scale_results_patient_computed_at", "patient_id", "computed_at"),
    )
