import test from "node:test";
import assert from "node:assert/strict";

import { buildPatientSummaryMessage } from "./patient-summary.ts";
import type { PatientSummaryRead } from "@/core/api/contracts";

function text(msg: ReturnType<typeof buildPatientSummaryMessage>): string {
  assert.ok(msg, "esperaba un mensaje");
  const part = msg.content[0];
  assert.ok(part && part.type === "text");
  return part.text;
}

test("resumen null -> no inyecta bloque", () => {
  assert.equal(buildPatientSummaryMessage(null), null);
  assert.equal(buildPatientSummaryMessage(undefined), null);
});

test("resumen mínimo -> encabezado + línea del paciente, sin secciones vacías", () => {
  const summary = {
    patient_id: "11111111-1111-1111-1111-111111111111",
    generado_en: "2026-07-03T00:00:00",
    datos_generales: { nombre: "Ana Ruiz", edad: 41, sexo: "female" },
  } as PatientSummaryRead;
  const out = text(buildPatientSummaryMessage(summary));
  assert.match(out, /RESUMEN DEL PACIENTE/);
  assert.match(out, /Paciente: Ana Ruiz · 41 años · female/);
  // No hay secciones de lista si vienen vacías.
  assert.doesNotMatch(out, /Consultas recientes:/);
  assert.doesNotMatch(out, /Laboratorio:/);
});

test("resumen completo -> cada sección presente y compacta", () => {
  const summary = {
    patient_id: "11111111-1111-1111-1111-111111111111",
    generado_en: "2026-07-03T00:00:00",
    datos_generales: { nombre: "Ana Ruiz", edad: 41, sexo: "female", embarazo: "pregnant" },
    resumen_clinico: [
      { tipo: "allergy", titulo: "Alergia a penicilina", detalle: "Rash", severidad: "high" },
    ],
    antecedentes: [{ categoria: "patologico", descripcion: "Hipertensión" }],
    historia_clinica: { antecedentes_familiares: "Madre DM2" },
    consultas: [
      {
        fecha: "2025-12-31T23:00:00",
        estado: "finalized",
        motivo: "Control HTA",
        evaluacion: "Controlada",
        diagnosticos: [{ tipo: "primary", texto: "Hipertensión esencial", codigo: "I10" }],
      },
    ],
    notas: [{ tipo: "nota_soap", estado: "approved", fecha: "2025-12-31T23:00:00", plan: "Losartán" }],
    signos_vitales: { fecha: "2025-12-31T23:00:00", peso_kg: 72.5, systolic: undefined, presion_sistolica: 150, presion_diastolica: 90 },
    recetas: [
      {
        estado: "approved",
        fecha: "2025-12-31T23:00:00",
        medicamentos: [{ medicamento: "Losartán", dosis: "50 mg", frecuencia: "c/24h" }],
      },
    ],
    laboratorios: [{ analito: "Glucosa", valor: "180", unidad: "mg/dL", marca: "high", fecha: "2025-12-31T23:00:00" }],
    estudios: [{ estudio: "BH", estado: "pending", fecha: "2025-12-31T23:00:00" }],
    seguimiento: [{ titulo: "Revisar labs", prioridad: "high", vence: "2026-07-05T00:00:00" }],
    archivos: [{ nombre: "lab.pdf", tipo: "laboratory", fecha: "2025-12-31" }],
    citas: [{ fecha: "2026-07-22", hora: "08:45:00", motivo: "Revisión", estado: "confirmed" }],
  } as unknown as PatientSummaryRead;
  const out = text(buildPatientSummaryMessage(summary));

  assert.match(out, /embarazo: pregnant/);
  assert.match(out, /Datos clínicos relevantes:/);
  assert.match(out, /\[allergy\] Alergia a penicilina — Rash — \(high\)/);
  assert.match(out, /Antecedentes:/);
  assert.match(out, /Historia clínica: Familiares: Madre DM2/);
  assert.match(out, /2025-12-31 \(finalized\) Control HTA → Controlada \[dx: Hipertensión esencial \(I10\)\]/);
  assert.match(out, /Notas:/);
  assert.match(out, /Signos vitales \(2025-12-31\): peso 72\.5 kg, TA 150\/90/);
  assert.match(out, /Recetas:/);
  assert.match(out, /approved \(2025-12-31\): Losartán 50 mg c\/24h/);
  assert.match(out, /Glucosa 180 mg\/dL \[high\] \(2025-12-31\)/);
  assert.match(out, /Estudios:/);
  assert.match(out, /Revisar labs \(high, vence 2026-07-05\)/);
  assert.match(out, /lab\.pdf \(laboratory, 2025-12-31\)/);
  assert.match(out, /Citas próximas:/);
  assert.match(out, /2026-07-22 08:45 Revisión \(confirmed\)/);
  // El bloque no filtra UUID salvo (implícitamente) el del paciente: no hay ids anidados.
  assert.doesNotMatch(out, /11111111-1111/); // ni siquiera el patient_id se vuelca al texto
});

test("laboratorio 'normal' no imprime la marca; anormal sí", () => {
  const base = {
    patient_id: "1",
    generado_en: "x",
    datos_generales: { nombre: "X", sexo: "male" },
  };
  const normal = buildPatientSummaryMessage({
    ...base,
    laboratorios: [{ analito: "Sodio", valor: "140", unidad: "mmol/L", marca: "normal", fecha: "2025-01-01T00:00:00" }],
  } as unknown as PatientSummaryRead);
  assert.doesNotMatch(text(normal), /\[normal\]/);
});
