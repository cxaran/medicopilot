/**
 * Contrato de accesibilidad del copiloto (MP-CTRL-0086). Centraliza las etiquetas en español y
 * las props ARIA de las regiones clave para que sean testeables y consistentes, sin depender de
 * un renderizador de DOM en los tests.
 */

/** Etiqueta del log de transcripción (role=log, aria-live=polite). */
export const COPILOT_TRANSCRIPT_LABEL = "Transcripción del copiloto";

/** Etiqueta accesible del botón de envío y del input ya existen inline; aquí sólo la región. */
export const COPILOT_APPROVAL_LABEL = "Acción clínica que requiere tu aprobación";

export interface ApprovalRegionA11y {
  role: "group";
  "aria-label": string;
  tabIndex: -1;
}

/**
 * Props ARIA de la tarjeta de aprobación P1: una región agrupada, etiquetada CLARAMENTE como
 * que requiere la aprobación del médico, y enfocable (tabIndex -1) para poder moverle el foco
 * cuando aparece. Si el plan trae acción/recurso, se incluyen en la etiqueta para dar contexto.
 */
export function approvalRegionProps(
  plan?: { actionType?: string; targetResource?: string } | null,
): ApprovalRegionA11y {
  const detail =
    plan?.actionType && plan?.targetResource ? ` (${plan.actionType} → ${plan.targetResource})` : "";
  return {
    role: "group",
    "aria-label": `${COPILOT_APPROVAL_LABEL}${detail}`,
    tabIndex: -1,
  };
}

/** Nombre accesible de los botones de la tarjeta de aprobación. */
export const APPROVAL_APPROVE_LABEL = "Aprobar acción clínica";
export const APPROVAL_REJECT_LABEL = "Rechazar acción clínica";
