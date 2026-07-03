import type { RecetaView } from "@/core/recetas/receta-print";

/**
 * Generador del PDF de una RECETA con jsPDF (mismo enfoque que el PDF de exportar tablas): construye
 * el documento vectorial —membrete del médico, folio/fecha, paciente, alergias, Rp (medicamentos con
 * sus datos), indicaciones, firma y pie— y lo entrega como bloburl (VISTA PREVIA en <iframe>) o como
 * Blob (descarga/impresión). SÓLO LECTURA de una receta ya existente: no emite, finaliza ni firma
 * nada. jsPDF se carga con import() dinámico. El tamaño de hoja y la orientación son configurables.
 */

export type RecetaPdfPageSize = "letter" | "a4" | "legal";

export type RecetaPdfConfig = {
  pageSize: RecetaPdfPageSize;
  orientation: "portrait" | "landscape";
};

type Rgb = [number, number, number];

// Paleta del documento (papel), tomada de la hoja de receta del diseño.
const C = {
  ink: [28, 25, 23] as Rgb,
  soft: [87, 83, 78] as Rgb,
  muted: [120, 113, 108] as Rgb,
  faint: [168, 162, 158] as Rgb,
  line: [231, 229, 228] as Rgb,
  panel: [247, 246, 244] as Rgb,
  violet: [91, 79, 214] as Rgb,
  danger: [180, 46, 46] as Rgb,
};

const MARGIN = 16;
const BOTTOM = 16;

async function buildDoc(view: RecetaView, config: RecetaPdfConfig) {
  const jspdf = await import("jspdf");
  const JsPdf = jspdf.jsPDF ?? jspdf.default;
  const doc = new JsPdf({ orientation: config.orientation, unit: "mm", format: config.pageSize });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = MARGIN;
  const right = pageWidth - MARGIN;
  const usable = pageWidth - MARGIN * 2;

  const setColor = (rgb: Rgb): void => {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  };

  // Añade página si no caben ``needed`` mm por debajo del cursor; devuelve el nuevo cursorY.
  let cursorY = 0;
  const ensure = (needed: number): void => {
    if (cursorY + needed > pageHeight - BOTTOM) {
      doc.addPage();
      cursorY = 20;
    }
  };
  // Escribe un párrafo ajustado al ancho y avanza el cursor; devuelve la altura usada.
  const paragraph = (
    text: string,
    x: number,
    width: number,
    opts?: { align?: "left" | "right" },
  ): number => {
    const lines = doc.splitTextToSize(text, width);
    doc.text(lines, x, cursorY, { align: opts?.align ?? "left" });
    const dims = doc.getTextDimensions(lines);
    cursorY += dims.h;
    return dims.h;
  };

  const { doctor, patient } = view;

  // ── MEMBRETE (dos columnas: médico a la izquierda, consultorio/contacto a la derecha) ──
  let leftY = 20;
  let rightY = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setColor(C.ink);
  const doctorName = [doctor.title, doctor.name].filter(Boolean).join(" ") || "Médico";
  const nameLines = doc.splitTextToSize(doctorName, usable * 0.6);
  doc.text(nameLines, left, leftY);
  leftY += doc.getTextDimensions(nameLines).h + 1;

  if (doctor.specialty) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    setColor(C.violet);
    doc.text(doctor.specialty, left, leftY);
    leftY += 5;
  }

  const licenses = [
    doctor.licenseProfessional ? `Céd. Prof. ${doctor.licenseProfessional}` : null,
    doctor.licenseSpecialty ? `Céd. Esp. ${doctor.licenseSpecialty}` : null,
  ].filter(Boolean);
  if (licenses.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(C.soft);
    doc.text(licenses.join("  ·  "), left, leftY);
    leftY += 4.5;
  }

  // Columna derecha: consultorio, dirección, teléfono y correo (alineada a la derecha).
  const contactLines: Array<{ text: string; bold?: boolean }> = [];
  if (doctor.clinicName) contactLines.push({ text: doctor.clinicName, bold: true });
  if (doctor.officeAddress) contactLines.push({ text: doctor.officeAddress });
  if (doctor.officePhone) contactLines.push({ text: `Tel. ${doctor.officePhone}` });
  if (doctor.email) contactLines.push({ text: doctor.email });
  for (const entry of contactLines) {
    doc.setFont("helvetica", entry.bold ? "bold" : "normal");
    doc.setFontSize(entry.bold ? 10 : 8.8);
    setColor(entry.bold ? C.ink : C.muted);
    const lines = doc.splitTextToSize(entry.text, usable * 0.42);
    doc.text(lines, right, rightY, { align: "right" });
    rightY += doc.getTextDimensions(lines).h + 0.5;
  }

  cursorY = Math.max(leftY, rightY) + 3;

  // Regla de acento bajo el membrete.
  doc.setDrawColor(C.violet[0], C.violet[1], C.violet[2]);
  doc.setLineWidth(0.8);
  doc.line(left, cursorY, right, cursorY);
  cursorY += 8;

  // ── FOLIO + FECHA ──
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(C.soft);
  if (view.folio) doc.text(`Folio: ${view.folio}`, left, cursorY);
  if (view.fecha) doc.text(`Fecha: ${view.fecha}`, right, cursorY, { align: "right" });
  cursorY += 8;

  // ── PACIENTE (panel) ──
  const patientRows = [
    patient.ageSex ? `Edad · Sexo: ${patient.ageSex}` : null,
    patient.recordNumber ? `Expediente: ${patient.recordNumber}` : null,
    patient.phone ? `Tel: ${patient.phone}` : null,
  ].filter((row): row is string => row !== null);
  const patientBoxTop = cursorY;
  const patientBoxHeight = 11 + (patientRows.length > 0 ? 6 : 0);
  doc.setFillColor(C.panel[0], C.panel[1], C.panel[2]);
  doc.setDrawColor(C.line[0], C.line[1], C.line[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(left, patientBoxTop, usable, patientBoxHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setColor(C.faint);
  doc.text("PACIENTE", left + 4, patientBoxTop + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setColor(C.ink);
  doc.text(patient.name || "—", left + 4, patientBoxTop + 10.5);
  if (patientRows.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(C.muted);
    doc.text(patientRows.join("      "), left + 4, patientBoxTop + patientBoxHeight - 2.5);
  }
  cursorY = patientBoxTop + patientBoxHeight + 6;

  // ── ALERGIAS ──
  ensure(8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const hasAllergies = view.allergies.length > 0;
  setColor(hasAllergies ? C.danger : C.muted);
  const allergyLabel = hasAllergies
    ? `Alergias: ${view.allergies.join(", ")}`
    : "Alergias: no registradas";
  paragraph(allergyLabel, left, usable);
  cursorY += 6;

  // ── Rp. (MEDICAMENTOS) ──
  ensure(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setColor(C.violet);
  doc.text("Rp.", left, cursorY);
  cursorY += 7;

  if (view.meds.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    setColor(C.muted);
    doc.text("Sin medicamentos registrados.", left, cursorY);
    cursorY += 6;
  } else {
    for (const med of view.meds) {
      ensure(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      setColor(C.ink);
      paragraph(`${med.position}. ${med.name}`, left, usable);
      cursorY += 1;

      if (med.chips.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setColor(C.soft);
        const chipsText = med.chips.map((chip) => `${chip.label}: ${chip.value}`).join("   ·   ");
        paragraph(chipsText, left + 5, usable - 5);
      }
      if (med.instructions) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        setColor(C.muted);
        paragraph(med.instructions, left + 5, usable - 5);
      }
      cursorY += 5;
    }
  }

  // ── INDICACIONES ──
  if (view.indicaciones) {
    ensure(14);
    cursorY += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setColor(C.ink);
    doc.text("Indicaciones", left, cursorY);
    cursorY += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setColor(C.soft);
    paragraph(view.indicaciones, left, usable);
    cursorY += 4;
  }

  // ── FIRMA (a la derecha, con espacio para la rúbrica) ──
  ensure(26);
  cursorY += 16;
  const signWidth = 70;
  const signX = right - signWidth;
  doc.setDrawColor(C.faint[0], C.faint[1], C.faint[2]);
  doc.setLineWidth(0.3);
  doc.line(signX, cursorY, right, cursorY);
  cursorY += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  setColor(C.ink);
  doc.text(doctorName, right, cursorY, { align: "right" });
  if (doctor.licenseProfessional) {
    cursorY += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setColor(C.muted);
    doc.text(`Cédula Profesional ${doctor.licenseProfessional}`, right, cursorY, { align: "right" });
  }

  // ── PIE institucional (parte inferior de la primera página) ──
  if (doctor.footer) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(C.faint);
    const lines = doc.splitTextToSize(doctor.footer, usable);
    const dims = doc.getTextDimensions(lines);
    doc.setPage(1);
    doc.text(lines, left, pageHeight - BOTTOM + 2 - dims.h, { maxWidth: usable });
  }

  return doc;
}

/** Blob URL para la VISTA PREVIA en <iframe>; el caller debe revocarla. */
export async function recetaPdfPreviewUrl(
  view: RecetaView,
  config: RecetaPdfConfig,
): Promise<string> {
  const doc = await buildDoc(view, config);
  return doc.output("bloburl").toString();
}

/** Blob del PDF para descargar o imprimir. */
export async function recetaPdfBlob(view: RecetaView, config: RecetaPdfConfig): Promise<Blob> {
  const doc = await buildDoc(view, config);
  return doc.output("blob");
}
