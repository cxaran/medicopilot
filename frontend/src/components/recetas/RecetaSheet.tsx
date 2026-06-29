import { RecetaPrintActions } from "@/components/recetas/RecetaPrintActions";
import type { RecetaView } from "@/core/recetas/receta-print";

/**
 * Hoja imprimible de la receta (MP-CTRL-0126) — re-skin del documento del diseño. SÓLO LECTURA de
 * una receta YA EXISTENTE: membrete (snapshot del médico), folio/fecha, paciente, alergias, Rp
 * (medicamentos del contrato) e indicaciones, con área de firma. No emite/finaliza/firma nada (eso
 * es el camino P1). El documento usa la paleta de papel del diseño (blanco, legible al imprimir),
 * no los tokens de tema; la barra de acciones (pantalla) sí usa tokens y se oculta al imprimir.
 */

const C = {
  ink: "#1c1917",
  muted: "#78716c",
  faint: "#a8a29e",
  soft: "#57534e",
  line: "#e7e5e4",
  line2: "#f0eeec",
  panel: "#f7f6f4",
  violet: "#5b4fd6",
};

const PRINT_CSS = `
@media print {
  .receta-no-print { display: none !important; }
  html, body { background: #fff !important; }
  .receta-sheet { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
  @page { margin: 14mm; }
}
`;

function Label({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: C.faint,
      }}
    >
      {children}
    </div>
  );
}

function PatientCell({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div style={{ background: "#fff", padding: "11px 18px" }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, color: C.ink }}>{value}</div>
    </div>
  );
}

export function RecetaSheet({ view }: Readonly<{ view: RecetaView }>) {
  const { doctor, patient } = view;
  const patientCells = [
    patient.ageSex ? { label: "Edad · Sexo", value: patient.ageSex } : null,
    patient.recordNumber ? { label: "Expediente", value: patient.recordNumber } : null,
    patient.phone ? { label: "Teléfono", value: patient.phone } : null,
  ].filter((cell): cell is { label: string; value: string } => cell !== null);

  return (
    <div className="min-h-screen bg-[var(--bg)] py-6">
      <style>{PRINT_CSS}</style>

      {/* Barra de acciones (pantalla; oculta al imprimir). */}
      <div className="receta-no-print mx-auto mb-4 flex max-w-[794px] items-center justify-between gap-3 px-4">
        <span className="text-[14px] font-semibold text-[var(--tx)]">Receta — vista de impresión</span>
        <RecetaPrintActions />
      </div>

      {/* HOJA */}
      <div
        className="receta-sheet mx-auto"
        style={{
          width: 794,
          maxWidth: "calc(100% - 36px)",
          background: "#fff",
          color: C.ink,
          borderRadius: 6,
          boxShadow: "0 24px 70px rgba(0,0,0,.28)",
        }}
      >
        <div style={{ padding: "48px 54px" }}>
          {/* MEMBRETE */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28 }}>
            <div style={{ display: "flex", gap: 15, minWidth: 0 }}>
              <span
                style={{
                  flex: "0 0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 50,
                  height: 50,
                  borderRadius: 13,
                  background: "linear-gradient(135deg,#a59bf6,#7fd9d0)",
                  color: "#fff",
                  fontSize: 25,
                  fontWeight: 700,
                  printColorAdjust: "exact",
                  WebkitPrintColorAdjust: "exact",
                }}
              >
                ℞
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.15 }}>
                  {doctor.name ?? "Médico tratante"}
                </div>
                {doctor.specialty && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.violet, marginTop: 3 }}>
                    {doctor.specialty}
                  </div>
                )}
                {(doctor.licenseProfessional || doctor.licenseSpecialty) && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, lineHeight: 1.55 }}>
                    {doctor.licenseProfessional && <>Céd. Prof. {doctor.licenseProfessional}</>}
                    {doctor.licenseProfessional && doctor.licenseSpecialty && " · "}
                    {doctor.licenseSpecialty && <>Céd. Esp. {doctor.licenseSpecialty}</>}
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "0 0 auto", fontSize: 11.5, color: C.muted, lineHeight: 1.65 }}>
              {doctor.clinicName && (
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{doctor.clinicName}</div>
              )}
              {doctor.officeAddress && (
                <div style={{ maxWidth: 230, marginLeft: "auto" }}>{doctor.officeAddress}</div>
              )}
              {(doctor.officePhone || doctor.phone) && <div>Tel. {doctor.officePhone ?? doctor.phone}</div>}
              {doctor.email && <div>{doctor.email}</div>}
            </div>
          </div>

          <div
            style={{
              height: 3,
              background: "linear-gradient(90deg,#a59bf6,#7fd9d0)",
              borderRadius: 3,
              marginTop: 22,
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}
          />

          {/* FOLIO / FECHA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 16 }}>
            <div>
              <Label>Folio</Label>
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {view.folio ?? "—"}
              </div>
            </div>
            {view.fecha && (
              <div style={{ textAlign: "right" }}>
                <Label>Fecha de emisión</Label>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{view.fecha}</div>
              </div>
            )}
          </div>

          {/* PACIENTE */}
          <div style={{ marginTop: 20, border: `1px solid ${C.line}`, borderRadius: 11, overflow: "hidden" }}>
            <div
              style={{
                padding: "14px 18px",
                background: C.panel,
                borderBottom: `1px solid ${C.line}`,
                printColorAdjust: "exact",
                WebkitPrintColorAdjust: "exact",
              }}
            >
              <Label>Paciente</Label>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em", marginTop: 2 }}>
                {patient.name ?? "—"}
              </div>
            </div>
            {patientCells.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${patientCells.length}, 1fr)`,
                  gap: 1,
                  background: C.line,
                }}
              >
                {patientCells.map((cell) => (
                  <PatientCell key={cell.label} label={cell.label} value={cell.value} />
                ))}
              </div>
            )}
          </div>

          {/* ALERGIAS */}
          {view.allergies.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                marginTop: 14,
                padding: "11px 16px",
                border: "1px solid #f0c8c2",
                background: "#fdf2f0",
                borderRadius: 10,
                printColorAdjust: "exact",
                WebkitPrintColorAdjust: "exact",
              }}
            >
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#c0392b" }}>
                  Alergias
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#9a2c20", marginTop: 1 }}>
                  {view.allergies.join(", ")}
                </div>
              </div>
            </div>
          )}

          {/* Rp */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderBottom: `1px solid ${C.line}`, paddingBottom: 9 }}>
              <span style={{ fontFamily: "Georgia,serif", fontSize: 30, fontWeight: 700, fontStyle: "italic", color: C.violet, lineHeight: 1 }}>
                ℞
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: C.muted }}>
                Prescripción
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.faint }}>
                {view.meds.length} medicamento(s)
              </span>
            </div>

            {view.meds.length === 0 ? (
              <div style={{ padding: "18px 2px", fontSize: 13, color: C.faint }}>
                Sin medicamentos registrados en esta receta.
              </div>
            ) : (
              view.meds.map((med) => (
                <div key={med.key} style={{ display: "flex", gap: 16, padding: "15px 2px", borderBottom: `1px solid ${C.line2}` }}>
                  <span style={{ flex: "0 0 auto", fontFamily: "Georgia,serif", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#c4bdf0", paddingTop: 1 }}>
                    {med.position}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>{med.name}</div>
                    {med.chips.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                        {med.chips.map((chip) => (
                          <span
                            key={chip.label}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 12,
                              color: C.soft,
                              background: C.panel,
                              padding: "4px 11px",
                              borderRadius: 7,
                              printColorAdjust: "exact",
                              WebkitPrintColorAdjust: "exact",
                            }}
                          >
                            <b style={{ fontWeight: 600, color: C.faint, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>
                              {chip.label}
                            </b>
                            {chip.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {med.instructions && (
                      <div style={{ fontSize: 12.5, color: C.soft, marginTop: 8, lineHeight: 1.6 }}>
                        {med.instructions}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* INDICACIONES */}
          {view.indicaciones && (
            <div style={{ marginTop: 22 }}>
              <Label>Indicaciones generales</Label>
              <p style={{ margin: "7px 0 0", fontSize: 12.5, lineHeight: 1.7, color: C.soft }}>
                {view.indicaciones}
              </p>
            </div>
          )}

          {/* FIRMA */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 28, marginTop: 54 }}>
            <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.6, maxWidth: 300 }}>
              {doctor.footer ?? "Documento emitido electrónicamente a través de MediCopilot."}
            </div>
            <div style={{ textAlign: "center", flex: "0 0 auto", minWidth: 230 }}>
              <div style={{ height: 46 }} />
              <div style={{ borderTop: `1.5px solid ${C.ink}`, paddingTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{doctor.name ?? "Médico tratante"}</div>
                {(doctor.specialty || doctor.licenseProfessional) && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {doctor.specialty}
                    {doctor.specialty && doctor.licenseProfessional && " · "}
                    {doctor.licenseProfessional && <>Céd. Prof. {doctor.licenseProfessional}</>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
