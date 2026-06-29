import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRecetaView,
  computeAgeYears,
  formatLongDate,
  toAllergyTitles,
} from "./receta-print.ts";

// RECETA imprimible (MP-CTRL-0126): mapeo PURO de las lecturas del contrato a la vista del
// documento. Sólo lectura; omite lo que no viene del contrato (no inventa).

const NOW = new Date("2026-06-29T12:00:00Z");

test("computeAgeYears: calcula años cumplidos; inválida -> null", () => {
  assert.equal(computeAgeYears("1980-01-01", NOW), 46);
  assert.equal(computeAgeYears("2026-12-31", NOW), null); // aún no nace en la referencia
  assert.equal(computeAgeYears("no-fecha", NOW), null);
});

test("formatLongDate: fecha larga en es; inválida -> ''", () => {
  assert.ok(formatLongDate("2026-06-12T10:00:00Z", "UTC").includes("2026"));
  assert.equal(formatLongDate("x", "UTC"), "");
});

test("toAllergyTitles: sólo títulos de items allergy", () => {
  const items = [
    { item_type: "allergy", title: "Penicilina" },
    { item_type: "diagnosis", title: "HTA" },
    { item_type: "allergy", title: "Sulfas" },
    { item_type: "allergy", title: "" },
  ];
  assert.deepEqual(toAllergyTitles(items), ["Penicilina", "Sulfas"]);
});

test("buildRecetaView: arma membrete, folio, fecha, paciente, Rp e indicaciones del contrato", () => {
  const view = buildRecetaView(
    {
      prescription: {
        internal_folio: 42,
        observations: "Tomar con alimentos.",
        status: "approved",
        approved_at: "2026-06-12T10:00:00Z",
        doctor_snapshot: {
          professional_name: "Dra. Ana López",
          specialty: "Cardiología",
          professional_license_number: "12345",
          specialty_license_number: "67890",
          clinic_name: "Clínica Central",
          office_phone: "555-1000",
          prescription_footer: "Válido con firma autógrafa.",
        },
      },
      items: [
        { id: "i2", position: 2, medication_name: "Metformina", dose: "850 mg", frequency: "c/12h", duration: "30 días" },
        { id: "i1", position: 1, medication_name: "Losartán", dose: "50 mg", frequency: "c/24h", instructions: "Por la mañana" },
      ],
      patient: { full_name: "Juan Pérez", record_number: 7, birth_date: "1980-01-01", sex: "male", phone: "555-2000" },
      allergyItems: [{ item_type: "allergy", title: "Penicilina" }],
    },
    { timeZone: "UTC", now: NOW },
  );

  assert.equal(view.doctor.name, "Dra. Ana López");
  assert.equal(view.doctor.specialty, "Cardiología");
  assert.equal(view.doctor.licenseProfessional, "12345");
  assert.equal(view.folio, "#42");
  assert.ok(view.fecha && view.fecha.includes("2026"));
  assert.equal(view.patient.name, "Juan Pérez");
  assert.equal(view.patient.recordNumber, "7");
  assert.equal(view.patient.ageSex, "46 años · Masculino");
  assert.deepEqual(view.allergies, ["Penicilina"]);
  assert.equal(view.indicaciones, "Tomar con alimentos.");
  // Orden por position; chips sólo con valores presentes.
  assert.deepEqual(view.meds.map((m) => m.name), ["Losartán", "Metformina"]);
  assert.equal(view.meds[0].instructions, "Por la mañana");
  assert.deepEqual(
    view.meds[1].chips.map((c) => c.label),
    ["Dosis", "Frecuencia", "Duración"],
  );
});

test("buildRecetaView: sin snapshot/datos -> campos omitidos, sin inventar", () => {
  const view = buildRecetaView(
    { prescription: { internal_folio: 1, created_at: "2026-06-01T00:00:00Z" } },
    { timeZone: "UTC", now: NOW },
  );
  assert.equal(view.doctor.name, undefined);
  assert.equal(view.indicaciones, undefined);
  assert.equal(view.patient.name, undefined);
  assert.deepEqual(view.allergies, []);
  assert.deepEqual(view.meds, []);
  assert.equal(view.folio, "#1");
});
