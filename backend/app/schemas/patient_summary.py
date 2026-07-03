"""Schema del RESUMEN DEL PACIENTE para el contexto del copiloto (sólo lectura).

Vista transversal COMPACTA del expediente pensada para inyectarse como contexto del agente:
reúne, ya filtrado, lo clínicamente relevante de un paciente. Reglas de diseño (para ahorrar
tokens y no filtrar PHI innecesaria al proveedor del modelo):

- Se EXCLUYEN campos que no ayudan a la consulta: teléfono, dirección, CURP, correo, contactos de
  emergencia, folios, y toda columna de AUDITORÍA (created_by/at, updated_*), salvo la fecha
  clínicamente significativa de cada registro.
- El ÚNICO identificador es ``patient_id``. Los elementos anidados NO llevan sus UUID: si el
  agente necesita el id de una receta/consulta/etc. para actuar, lo obtiene llamando a las tools
  (que además validan permiso y vigencia).
- NADA de campos binarios (bytes de archivos): sólo nombre, tipo y fecha del archivo.
- Los campos NULOS o vacíos se OMITEN del JSON (``response_model_exclude_none``): un campo ausente
  simplemente no aparece, sin gastar el token de su etiqueta.

Es una proyección de SÓLO LECTURA: no persiste, no muta y no inventa.
"""

import uuid
from datetime import date, datetime, time
from typing import Optional

from backend.app.schemas.base import ApiReadSchema


class SummaryGeneral(ApiReadSchema):
    """Datos generales relevantes para la consulta (sin datos administrativos irrelevantes)."""

    nombre: str
    edad: Optional[int] = None
    sexo: str
    ocupacion: Optional[str] = None
    embarazo: Optional[str] = None  # sólo si el estado no es "none"


class SummaryClinicalItem(ApiReadSchema):
    """Dato clínico importante del resumen: alergia, condición crónica, medicación actual…"""

    tipo: str
    titulo: str
    detalle: Optional[str] = None
    severidad: Optional[str] = None


class SummaryHistoryItem(ApiReadSchema):
    """Antecedente estructurado (familiar, quirúrgico, obstétrico, patológico, no patológico)."""

    categoria: str
    descripcion: str
    parentesco: Optional[str] = None
    notas: Optional[str] = None


class SummaryMedicalHistory(ApiReadSchema):
    """Historia clínica vigente (versión ``current``). Sólo los bloques con contenido."""

    antecedentes_familiares: Optional[str] = None
    antecedentes_patologicos: Optional[str] = None
    antecedentes_no_patologicos: Optional[str] = None
    cirugias_previas: Optional[str] = None
    hospitalizaciones: Optional[str] = None
    habitos: Optional[str] = None
    gineco_obstetricos: Optional[str] = None
    observaciones: Optional[str] = None


class SummaryDiagnosis(ApiReadSchema):
    tipo: str
    texto: str
    codigo: Optional[str] = None


class SummaryConsultation(ApiReadSchema):
    """Consulta reciente: fecha, estado, motivo, evaluación y diagnósticos."""

    fecha: datetime
    estado: str
    motivo: str
    evaluacion: Optional[str] = None
    diagnosticos: list[SummaryDiagnosis] = []


class SummaryNote(ApiReadSchema):
    """Nota clínica (SOAP u otra): tipo, estado y su evaluación/plan si los tiene."""

    tipo: str
    estado: str
    fecha: datetime
    evaluacion: Optional[str] = None
    plan: Optional[str] = None


class SummaryVitals(ApiReadSchema):
    """Últimos signos vitales (atados a su fecha de medición; sólo mediciones presentes)."""

    fecha: datetime
    peso_kg: Optional[float] = None
    talla_cm: Optional[float] = None
    temperatura_c: Optional[float] = None
    presion_sistolica: Optional[int] = None
    presion_diastolica: Optional[int] = None
    frecuencia_cardiaca: Optional[int] = None
    frecuencia_respiratoria: Optional[int] = None
    saturacion_o2: Optional[float] = None
    glucosa_capilar: Optional[float] = None
    dolor: Optional[int] = None


class SummaryMedication(ApiReadSchema):
    medicamento: str
    dosis: Optional[str] = None
    frecuencia: Optional[str] = None
    duracion: Optional[str] = None


class SummaryPrescription(ApiReadSchema):
    """Receta reciente (no anulada): estado, fecha y sus medicamentos."""

    estado: str
    fecha: Optional[datetime] = None
    medicamentos: list[SummaryMedication] = []


class SummaryLab(ApiReadSchema):
    """Resultado de laboratorio: analito, valor, unidad, marca de anormalidad y fecha."""

    analito: str
    valor: Optional[str] = None
    unidad: Optional[str] = None
    marca: Optional[str] = None  # normal/low/high/critical/unknown
    fecha: datetime


class SummaryStudy(ApiReadSchema):
    estudio: str
    estado: str
    fecha: datetime


class SummaryTask(ApiReadSchema):
    """Tarea de seguimiento abierta."""

    titulo: str
    prioridad: str
    vence: Optional[datetime] = None


class SummaryFile(ApiReadSchema):
    """Archivo clínico: sólo metadatos (NUNCA los bytes)."""

    nombre: str
    tipo: str
    fecha: Optional[date] = None


class SummaryAppointment(ApiReadSchema):
    fecha: date
    hora: Optional[time] = None
    motivo: str
    estado: str


class PatientSummaryRead(ApiReadSchema):
    """Resumen compacto del paciente para el contexto del copiloto.

    ``patient_id`` es el ÚNICO identificador; los elementos anidados no llevan ids.
    """

    patient_id: uuid.UUID
    generado_en: datetime
    datos_generales: SummaryGeneral
    resumen_clinico: list[SummaryClinicalItem] = []
    antecedentes: list[SummaryHistoryItem] = []
    historia_clinica: Optional[SummaryMedicalHistory] = None
    consultas: list[SummaryConsultation] = []
    notas: list[SummaryNote] = []
    signos_vitales: Optional[SummaryVitals] = None
    recetas: list[SummaryPrescription] = []
    laboratorios: list[SummaryLab] = []
    estudios: list[SummaryStudy] = []
    seguimiento: list[SummaryTask] = []
    archivos: list[SummaryFile] = []
    citas: list[SummaryAppointment] = []
