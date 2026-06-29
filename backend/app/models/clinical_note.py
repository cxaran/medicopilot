import uuid
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base
from backend.app.models.enums import ClinicalNoteKind, ClinicalNoteStatus, enum_values


class ClinicalNote(Base):
    """Nota clínica estructurada (fase 1: nota SOAP) compuesta de una consulta.

    Una nota SOAP final se COMPONE a partir de los datos REALES de una consulta del
    expediente (Subjetivo/Objetivo/Análisis/Plan) y se persiste como BORRADOR que el
    médico aprueba (P1). NUNCA se finaliza de forma autónoma: nace en estado ``draft`` y
    sólo el médico la pasa a ``approved``. El copiloto redacta la narrativa fundamentada
    en la consulta; si una sección no tiene datos de origen, se deja vacía (no se inventa).

    Es un modelo dedicado y ligero: a diferencia de ``ClinicalDocument`` (un ARCHIVO
    binario con mime/tamaño/sha256), aquí el contenido es TEXTO estructurado en cuatro
    secciones. La baja es lógica.
    """

    __tablename__ = "clinical_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Paciente al que pertenece la nota (derivado de la consulta).",
    )
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("consultations.id", ondelete="RESTRICT"),
        nullable=False,
        comment="Consulta de la que se compone la nota SOAP.",
    )
    kind: Mapped[ClinicalNoteKind] = mapped_column(
        SAEnum(
            ClinicalNoteKind,
            name="clinical_note_kind",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalNoteKind.NOTA_SOAP,
        server_default=ClinicalNoteKind.NOTA_SOAP.value,
        comment="Tipo de documento: nota_soap, constancia o incapacidad.",
    )
    subjective: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección S (Subjetivo): motivo, padecimiento, interrogatorio."
    )
    objective: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección O (Objetivo): exploración física y hallazgos."
    )
    assessment: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección A (Análisis): valoración/impresión diagnóstica."
    )
    plan: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Sección P (Plan): tratamiento, indicaciones, seguimiento."
    )
    details: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        nullable=True,
        comment=(
            "Datos snapshot por tipo (JSON portable): constancia/incapacidad guardan aquí "
            "nombre del paciente, médico y cédula, fecha de asistencia, diagnóstico/motivo y, "
            "para incapacidad, inicio y número de días de reposo. La nota SOAP no lo usa."
        ),
    )
    status: Mapped[ClinicalNoteStatus] = mapped_column(
        SAEnum(
            ClinicalNoteStatus,
            name="clinical_note_status",
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            values_callable=enum_values,
        ),
        nullable=False,
        default=ClinicalNoteStatus.DRAFT,
        comment="Estado de la nota: draft (borrador) o approved (aprobada por el médico).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
        comment="Fecha de creación de la nota.",
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que registró la nota.",
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
        comment="Usuario que actualizó la nota.",
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        comment="Fecha de eliminación lógica de la nota.",
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que eliminó lógicamente la nota.",
    )

    created_by_user = relationship("User", foreign_keys=[created_by])
    updated_by_user = relationship("User", foreign_keys=[updated_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])

    __table_args__ = (
        Index("ix_clinical_notes_patient", "patient_id"),
        Index("ix_clinical_notes_consultation", "consultation_id"),
        Index("ix_clinical_notes_status", "status"),
        Index("ix_clinical_notes_patient_created_at", "patient_id", "created_at"),
    )

    @property
    def content_markdown(self) -> str:
        """Renderiza el documento a Markdown según su tipo. Lo ausente se marca; no se inventa."""
        if self.kind == ClinicalNoteKind.CONSTANCIA:
            return self._render_constancia()
        if self.kind == ClinicalNoteKind.INCAPACIDAD:
            return self._render_incapacidad()
        if self.kind == ClinicalNoteKind.REFERENCIA:
            return self._render_referencia()
        if self.kind == ClinicalNoteKind.CONTRARREFERENCIA:
            return self._render_contrarreferencia()
        return self._render_soap()

    def _render_soap(self) -> str:
        empty = "_(sin información registrada)_"
        sections = (
            ("S — Subjetivo", self.subjective),
            ("O — Objetivo", self.objective),
            ("A — Análisis", self.assessment),
            ("P — Plan", self.plan),
        )
        parts = ["# Nota SOAP (borrador)"]
        for title, body in sections:
            text = body.strip() if body and body.strip() else empty
            parts.append(f"## {title}\n\n{text}")
        return "\n\n".join(parts)

    def _render_constancia(self) -> str:
        d = self.details or {}
        paciente = d.get("patient_name") or "_(paciente no especificado)_"
        fecha = d.get("attended_on") or "_(fecha no especificada)_"
        medico = d.get("physician_name") or "_(médico no especificado)_"
        cedula = d.get("physician_license") or "_(sin cédula)_"
        parts = [
            "# Constancia médica (borrador)",
            f"Se hace constar que **{paciente}** asistió a consulta médica el **{fecha}**.",
        ]
        motivo = (d.get("motivo") or "").strip()
        if motivo:
            parts.append(f"Motivo de la atención: {motivo}.")
        parts.append(f"Atendió: **{medico}**, cédula profesional {cedula}.")
        return "\n\n".join(parts)

    def _render_incapacidad(self) -> str:
        d = self.details or {}
        paciente = d.get("patient_name") or "_(paciente no especificado)_"
        diagnostico = (d.get("diagnosis") or "").strip() or "_(diagnóstico no especificado)_"
        medico = d.get("physician_name") or "_(médico no especificado)_"
        cedula = d.get("physician_license") or "_(sin cédula)_"
        inicio = d.get("rest_start_date")
        dias = d.get("rest_days")
        if isinstance(dias, int) and inicio:
            try:
                fin = (date.fromisoformat(str(inicio)) + timedelta(days=dias - 1)).isoformat()
            except ValueError:
                fin = inicio
            reposo = f"Se indica reposo por **{dias} día(s)**, del **{inicio}** al **{fin}**."
        else:
            # El número de días de reposo es una decisión médica explícita; jamás se inventa.
            reposo = "_(periodo de reposo no especificado)_"
        return "\n\n".join(
            [
                "# Incapacidad / Justificante médico (borrador)",
                f"Paciente: **{paciente}**.",
                f"Diagnóstico/motivo: {diagnostico}.",
                reposo,
                f"Atendió: **{medico}**, cédula profesional {cedula}.",
            ]
        )

    def _render_referencia(self) -> str:
        d = self.details or {}
        paciente = d.get("patient_name") or "_(paciente no especificado)_"
        medico = d.get("physician_name") or "_(médico no especificado)_"
        cedula = d.get("physician_license") or "_(sin cédula)_"
        destino = (d.get("destination") or "").strip() or "_(destino no especificado)_"
        motivo = (d.get("reason") or "").strip()
        resumen = (d.get("clinical_summary") or "").strip() or "_(sin resumen clínico)_"
        parts = [
            "# Referencia médica (borrador)",
            f"Paciente: **{paciente}**.",
            f"Se refiere a: **{destino}**.",
        ]
        if motivo:
            parts.append(f"Motivo de la referencia: {motivo}.")
        parts.append(f"Resumen clínico: {resumen}")
        parts.append(f"Refiere: **{medico}**, cédula profesional {cedula}.")
        return "\n\n".join(parts)

    def _render_contrarreferencia(self) -> str:
        d = self.details or {}
        paciente = d.get("patient_name") or "_(paciente no especificado)_"
        medico = d.get("physician_name") or "_(médico no especificado)_"
        cedula = d.get("physician_license") or "_(sin cédula)_"
        hallazgos = (d.get("findings") or "").strip() or "_(no especificado)_"
        recomendaciones = (d.get("recommendations") or "").strip() or "_(no especificado)_"
        return "\n\n".join(
            [
                "# Contrarreferencia médica (borrador)",
                f"Paciente: **{paciente}**.",
                f"Hallazgos / lo realizado: {hallazgos}",
                f"Recomendaciones / plan: {recomendaciones}",
                f"Responde: **{medico}**, cédula profesional {cedula}.",
            ]
        )
