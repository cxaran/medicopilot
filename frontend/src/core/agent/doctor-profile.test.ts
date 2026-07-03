import test from "node:test";
import assert from "node:assert/strict";

import { buildDoctorProfileMessage } from "./doctor-profile.ts";
import type { DoctorRead } from "@/core/api/contracts";

function text(msg: ReturnType<typeof buildDoctorProfileMessage>): string {
  assert.ok(msg, "esperaba un mensaje");
  const part = msg.content[0];
  assert.ok(part && part.type === "text");
  return part.text;
}

test("sin perfil (null/undefined) -> no inyecta capa", () => {
  assert.equal(buildDoctorProfileMessage(null), null);
  assert.equal(buildDoctorProfileMessage(undefined), null);
});

test("perfil completo -> título+nombre, especialidad, cédulas y consultorio", () => {
  const doctor = {
    professional_title: "Dra.",
    professional_name: "Ana López",
    professional_license_number: "12345678",
    specialty: "Cardiología",
    specialty_license_number: "SP-99",
    clinic_name: "Clínica del Centro",
  } as DoctorRead;
  const out = text(buildDoctorProfileMessage(doctor));
  assert.match(out, /MÉDICO A CARGO/);
  assert.match(out, /Médico: Dra\. Ana López/);
  assert.match(out, /Especialidad: Cardiología/);
  assert.match(out, /Cédula profesional: 12345678/);
  assert.match(out, /Cédula de especialidad: SP-99/);
  assert.match(out, /Consultorio: Clínica del Centro/);
});

test("omite campos administrativos y vacíos", () => {
  const doctor = {
    professional_name: "Juan Pérez",
    professional_license_number: "555",
    specialty: null,
    professional_phone: "5512345678",
    professional_email: "j@x.com",
    office_address: "Calle 1",
    prescription_footer: "Gracias por su visita",
  } as unknown as DoctorRead;
  const out = text(buildDoctorProfileMessage(doctor));
  assert.match(out, /Médico: Juan Pérez/);
  assert.match(out, /Cédula profesional: 555/);
  // No hay especialidad (null) ni datos administrativos.
  assert.doesNotMatch(out, /Especialidad/);
  for (const leak of ["5512345678", "j@x.com", "Calle 1", "Gracias por su visita"]) {
    assert.doesNotMatch(out, new RegExp(leak));
  }
});

test("sin nombre profesional -> no inyecta capa", () => {
  const doctor = { professional_name: "", professional_license_number: "1" } as unknown as DoctorRead;
  assert.equal(buildDoctorProfileMessage(doctor), null);
});
