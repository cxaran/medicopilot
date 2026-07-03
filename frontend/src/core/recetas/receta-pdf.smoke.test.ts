import assert from "node:assert/strict";
import { test } from "node:test";

import { recetaPdfBlob, recetaPdfPreviewUrl } from "@/core/recetas/receta-pdf";
import type { RecetaView } from "@/core/recetas/receta-print";

const fullView: RecetaView = {
  doctor: {
    name: "Ana Pérez López",
    title: "Dra.",
    specialty: "Medicina Interna",
    licenseProfessional: "1234567",
    licenseSpecialty: "7654321",
    clinicName: "Consultorio Salud Integral",
    officeAddress: "Av. Reforma 100, Col. Centro, Ciudad de México, CP 06000",
    officePhone: "55 1234 5678",
    email: "contacto@consultorio.mx",
    footer: "Este documento es un borrador clínico revisado por el médico. ".repeat(4),
  },
  folio: "RX-000123",
  fecha: "3 de julio de 2026",
  status: "finalized",
  patient: {
    name: "Juan Ramírez",
    ageSex: "42 años · Masculino",
    recordNumber: "EXP-0099",
    phone: "55 9876 5432",
  },
  allergies: ["Penicilina", "Sulfas"],
  // Muchos medicamentos para forzar el salto de página y ejercitar ensure().
  meds: Array.from({ length: 16 }, (_, i) => ({
    key: `m${i}`,
    position: i + 1,
    name: `Medicamento de nombre largo número ${i + 1} para probar el ajuste de línea`,
    chips: [
      { label: "Presentación", value: "Tableta 500 mg" },
      { label: "Dosis", value: "1 tableta" },
      { label: "Frecuencia", value: "cada 8 horas" },
      { label: "Duración", value: "7 días" },
    ],
    instructions: i % 2 === 0 ? "Tomar después de los alimentos con abundante agua." : undefined,
  })),
  indicaciones: "Reposo relativo. Hidratación abundante. Regresar si hay fiebre mayor a 38.5°C.",
};

const minimalView: RecetaView = {
  doctor: { name: "Médico" },
  patient: {},
  allergies: [],
  meds: [],
};

test("recetaPdfBlob genera un PDF con contenido (caso completo, multipágina)", async () => {
  const blob = await recetaPdfBlob(fullView, { pageSize: "letter", orientation: "portrait" });
  assert.equal(blob.type, "application/pdf");
  assert.ok(blob.size > 1000, `PDF demasiado pequeño: ${blob.size} bytes`);
});

test("recetaPdfBlob no lanza con receta mínima (sin meds, sin alergias)", async () => {
  const blob = await recetaPdfBlob(minimalView, { pageSize: "a4", orientation: "portrait" });
  assert.ok(blob.size > 500);
});

test("recetaPdfPreviewUrl produce un bloburl", async () => {
  const url = await recetaPdfPreviewUrl(fullView, { pageSize: "legal", orientation: "landscape" });
  assert.match(url, /^blob:/);
  URL.revokeObjectURL(url);
});
