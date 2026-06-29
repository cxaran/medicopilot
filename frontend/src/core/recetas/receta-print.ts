// Modelo de vista PURO de la receta imprimible (MP-CTRL-0126, rebanada 6 del rediseño). Sin red ni
// React: mapea las lecturas del CONTRATO (prescription + items + patient + alergias + el snapshot
// del médico) a una vista SÓLO LECTURA de un documento ya existente. No inventa: lo que no viene del
// contrato se OMITE. No emite, finaliza ni firma nada (eso vive en el camino P1 de aprobación).
//
// Fuentes:
//   - prescription: internal_folio (folio), observations (indicaciones), doctor_snapshot (membrete
//     inmutable capturado al aprobar), status, approved_at/created_at (fecha).
//   - prescription-items: medication_name, presentation, dose, frequency, duration, instructions.
//   - consultation -> patient_id -> patient: full_name, record_number, birth_date, sex, phone.
//   - patient-clinical-items (item_type=allergy): title.

export interface RecetaDoctor {
  name?: string;
  title?: string;
  specialty?: string;
  licenseProfessional?: string;
  licenseSpecialty?: string;
  clinicName?: string;
  officeAddress?: string;
  officePhone?: string;
  phone?: string;
  email?: string;
  footer?: string;
}

export interface RecetaMedChip {
  label: string;
  value: string;
}

export interface RecetaMed {
  key: string;
  position: number;
  name: string;
  chips: RecetaMedChip[];
  instructions?: string;
}

export interface RecetaPatient {
  name?: string;
  ageSex?: string;
  recordNumber?: string;
  phone?: string;
}

export interface RecetaView {
  doctor: RecetaDoctor;
  folio?: string;
  fecha?: string;
  status?: string;
  patient: RecetaPatient;
  allergies: string[];
  meds: RecetaMed[];
  indicaciones?: string;
}

type Dict = Record<string, unknown> | null | undefined;

function str(source: Dict, key: string): string | undefined {
  const value = source?.[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

const SEX_LABEL: Record<string, string> = {
  male: "Masculino",
  female: "Femenino",
  other: "Otro",
  unknown: "No especificado",
};

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** Fecha larga legible (p. ej. "12 de junio de 2026") en la zona del consultorio; "" si inválida. */
export function formatLongDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (!isValidDate(date)) {
    return "";
  }
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}

/** Edad en años a partir de la fecha de nacimiento (YYYY-MM-DD) y una fecha de referencia. */
export function computeAgeYears(birthDate: string, now: Date): number | null {
  const birth = new Date(birthDate);
  if (!isValidDate(birth) || !isValidDate(now)) {
    return null;
  }
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function buildAgeSex(patient: Dict, now: Date): string | undefined {
  const birth = str(patient, "birth_date");
  const sexRaw = str(patient, "sex");
  const sexLabel = sexRaw ? (SEX_LABEL[sexRaw] ?? sexRaw) : undefined;
  const age = birth ? computeAgeYears(birth, now) : null;
  const ageText = age !== null ? `${age} años` : undefined;
  return [ageText, sexLabel].filter(Boolean).join(" · ") || undefined;
}

function chip(label: string, value: string | undefined): RecetaMedChip | null {
  return value ? { label, value } : null;
}

/** Mapea un item del contrato a un medicamento de la receta (omite campos ausentes). */
function toMed(item: Record<string, unknown>, index: number): RecetaMed {
  const positionRaw = item.position;
  const position = typeof positionRaw === "number" ? positionRaw : index + 1;
  const chips = [
    chip("Presentación", str(item, "presentation")),
    chip("Dosis", str(item, "dose")),
    chip("Frecuencia", str(item, "frequency")),
    chip("Duración", str(item, "duration")),
  ].filter((value): value is RecetaMedChip => value !== null);
  return {
    key: str(item, "id") || `med-${index}`,
    position,
    name: str(item, "medication_name") || "—",
    chips,
    instructions: str(item, "instructions"),
  };
}

/** Extrae los títulos de alergias activas de los clinical items (item_type=allergy). */
export function toAllergyTitles(items: readonly Record<string, unknown>[]): string[] {
  const titles: string[] = [];
  for (const item of items) {
    if (str(item, "item_type") !== "allergy") {
      continue;
    }
    const title = str(item, "title");
    if (title) {
      titles.push(title);
    }
  }
  return titles;
}

/** Ensambla la vista imprimible de la receta a partir de las lecturas del contrato. */
export function buildRecetaView(
  input: {
    prescription: Dict;
    items?: readonly Record<string, unknown>[];
    patient?: Dict;
    allergyItems?: readonly Record<string, unknown>[];
  },
  opts: { timeZone: string; now?: Date },
): RecetaView {
  const now = opts.now ?? new Date();
  const snapshot = (input.prescription?.doctor_snapshot ?? null) as Dict;

  const doctor: RecetaDoctor = {
    name: str(snapshot, "professional_name"),
    title: str(snapshot, "professional_title"),
    specialty: str(snapshot, "specialty"),
    licenseProfessional: str(snapshot, "professional_license_number"),
    licenseSpecialty: str(snapshot, "specialty_license_number"),
    clinicName: str(snapshot, "clinic_name"),
    officeAddress: str(snapshot, "office_address"),
    officePhone: str(snapshot, "office_phone"),
    phone: str(snapshot, "professional_phone"),
    email: str(snapshot, "professional_email"),
    footer: str(snapshot, "prescription_footer"),
  };

  const folioRaw = str(input.prescription, "internal_folio");
  const dateIso = str(input.prescription, "approved_at") ?? str(input.prescription, "created_at");
  const fecha = dateIso ? formatLongDate(dateIso, opts.timeZone) || undefined : undefined;

  const meds = (input.items ?? [])
    .map((item, index) => toMed(item, index))
    .sort((a, b) => a.position - b.position);

  return {
    doctor,
    folio: folioRaw ? `#${folioRaw}` : undefined,
    fecha,
    status: str(input.prescription, "status"),
    patient: {
      name: str(input.patient, "full_name"),
      ageSex: buildAgeSex(input.patient, now),
      recordNumber: str(input.patient, "record_number"),
      phone: str(input.patient, "phone"),
    },
    allergies: toAllergyTitles(input.allergyItems ?? []),
    meds,
    indicaciones: str(input.prescription, "observations"),
  };
}
