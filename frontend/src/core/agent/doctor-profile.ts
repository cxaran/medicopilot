import type { DoctorRead } from "@/core/api/contracts";
import type { WireMessage } from "@/core/agent/protocol";

/**
 * Formatea el PERFIL DE MÉDICO del usuario (`GET /doctors/me`) como una capa de contexto ESTABLE
 * del copiloto: quién atiende y con qué cédula firma. Módulo PURO (sin red ni React).
 *
 * Reglas de token/PHI (mismas del resumen del paciente): sólo lo que ayuda a la consulta. Se incluye
 * la CÉDULA (es la del propio médico, necesaria para recetas/documentos que firma). Se OMITEN
 * teléfono/correo/dirección del consultorio, el pie de receta, ids y campos de auditoría, y todo
 * campo vacío. Es dato de CONFIANZA (identidad del usuario), no un bloque no confiable como memorias.
 */

const HEADER =
  "MÉDICO A CARGO (perfil del usuario que atiende; úsalo para personalizar el trato y como firmante " +
  "de los borradores clínicos —recetas, notas, referencias— que redactes)";

function clean(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function join(parts: (string | null | undefined)[], sep: string): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(sep);
}

/**
 * Construye el mensaje de cable (rol system) con el perfil del médico, o ``null`` si no hay perfil
 * (el usuario no es doctor) o si no tiene ningún dato útil. Todo lo vacío se omite.
 */
export function buildDoctorProfileMessage(doctor: DoctorRead | null | undefined): WireMessage | null {
  if (!doctor) {
    return null;
  }
  // Nombre con título (p. ej. "Dra. Ana López"); el nombre profesional es obligatorio en el modelo.
  const nombre = join([clean(doctor.professional_title), clean(doctor.professional_name)], " ");
  if (!nombre) {
    return null;
  }

  const lines = [HEADER, `Médico: ${nombre}`];
  const especialidad = clean(doctor.specialty);
  if (especialidad) {
    lines.push(`Especialidad: ${especialidad}`);
  }
  const cedula = clean(doctor.professional_license_number);
  if (cedula) {
    lines.push(`Cédula profesional: ${cedula}`);
  }
  const cedulaEsp = clean(doctor.specialty_license_number);
  if (cedulaEsp) {
    lines.push(`Cédula de especialidad: ${cedulaEsp}`);
  }
  const clinica = clean(doctor.clinic_name);
  if (clinica) {
    lines.push(`Consultorio: ${clinica}`);
  }

  return { role: "system", content: [{ type: "text", text: lines.join("\n") }] };
}
