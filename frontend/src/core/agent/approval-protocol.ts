import type { ToolDefinition } from "./tools/registry";
import { rejectedByUserResult } from "./tools/tool-runner";

/**
 * Protocolo formal de aprobación de acciones clínicas de ESCRITURA (P1, paridad OpenClaw
 * exec.approval). Materializa el principio del producto: "toda salida de IA es un borrador
 * que el médico debe revisar y aprobar". Cuando el modelo pide una tool de escritura, en
 * vez de ejecutarla se crea una SOLICITUD DE APROBACIÓN que transporta un plan canónico e
 * INMUTABLE; la tool solo se ejecuta contra FastAPI si el médico aprueba EXACTAMENTE lo que
 * se le mostró.
 *
 * Aislamiento por usuario/turno: este protocolo vive en el NAVEGADOR del médico (que es la
 * autoridad clínica y dueño de las tools). El plan lleva el payload clínico exacto, así que
 * NUNCA viaja al gateway provider-neutral (que no debe ver datos del expediente). No se
 * comparte estado entre usuarios (al contrario del trust compartido de OpenClaw).
 */

/** Plan canónico e inmutable de una acción de escritura: lo que el médico aprueba. */
export interface ClinicalActionPlan {
  /** Tipo de acción (p. ej. ``create_consultation_draft``). */
  readonly actionType: string;
  /** Recurso destino afectado (p. ej. ``consultations``). */
  readonly targetResource: string;
  /** Resumen legible en español de lo que ocurriría si se aprueba. */
  readonly humanReadableSummary: string;
  /** Cuerpo EXACTO que se enviaría a FastAPI (inmutable: se aprueba tal cual se muestra). */
  readonly exactPayload: Readonly<Record<string, unknown>>;
}

export type ApprovalStatus = "requested" | "approved" | "rejected";
export type ApprovalDecisionKind = "approved" | "rejected";

/** Solicitud de aprobación pendiente, atada a un call/turn concretos. */
export interface ApprovalRequest {
  readonly id: string;
  readonly turnId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly plan: ClinicalActionPlan;
  readonly status: ApprovalStatus;
}

/** Evento de ciclo de vida (consistente en forma con los eventos de turn del gateway). */
export type ApprovalLifecycleEvent =
  | { readonly type: "approval.requested"; readonly request: ApprovalRequest }
  | { readonly type: "approval.approved"; readonly request: ApprovalRequest }
  | { readonly type: "approval.rejected"; readonly request: ApprovalRequest };

/**
 * Construye el plan canónico INMUTABLE desde la tool de escritura y sus argumentos ya
 * validados. Genérico sobre cualquier tool de escritura: usa la metadata ``approval`` de la
 * tool si está declarada (resumen en español, tipo de acción, recurso destino) y, si no,
 * cae a un resumen genérico. El ``exactPayload`` es el cuerpo que la tool enviará a FastAPI
 * (hoy, los args validados) y se congela para que no pueda mutarse en silencio tras mostrarse.
 */
export function buildClinicalActionPlan(
  tool: ToolDefinition,
  args: Record<string, unknown>,
): ClinicalActionPlan {
  const meta = tool.approval;
  const plan: ClinicalActionPlan = {
    actionType: meta?.actionType ?? tool.name,
    targetResource: meta?.targetResource ?? "desconocido",
    humanReadableSummary:
      meta?.summarize(args) ?? `Ejecutar la acción de escritura "${tool.name}".`,
    exactPayload: Object.freeze({ ...args }),
  };
  return Object.freeze(plan);
}

/**
 * Almacén de solicitudes de aprobación de un turno/usuario (en el navegador). Las
 * solicitudes y sus planes son inmutables; ``resolve`` solo transiciona el estado una vez
 * (requested -> approved|rejected) y nunca dos veces.
 */
export class ApprovalStore {
  private readonly requests = new Map<string, ApprovalRequest>();

  /** Crea una solicitud pendiente y devuelve la solicitud + su evento ``requested``. */
  request(input: {
    id: string;
    turnId: string;
    callId: string;
    toolName: string;
    plan: ClinicalActionPlan;
  }): { request: ApprovalRequest; event: ApprovalLifecycleEvent } {
    const request: ApprovalRequest = Object.freeze({ ...input, status: "requested" });
    this.requests.set(request.id, request);
    return { request, event: { type: "approval.requested", request } };
  }

  get(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  /** Solicitudes aún pendientes (estado ``requested``). */
  pending(): ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.status === "requested");
  }

  /** Solicitudes pendientes de un turno concreto (aislamiento por turno). */
  pendingForTurn(turnId: string): ApprovalRequest[] {
    return this.pending().filter((request) => request.turnId === turnId);
  }

  /**
   * Resuelve una solicitud pendiente. Devuelve ``null`` si no existe o ya estaba resuelta
   * (no se resuelve dos veces). El plan no se modifica: solo cambia el estado.
   */
  resolve(
    id: string,
    decision: ApprovalDecisionKind,
  ): { request: ApprovalRequest; event: ApprovalLifecycleEvent } | null {
    const current = this.requests.get(id);
    if (!current || current.status !== "requested") {
      return null;
    }
    const resolved: ApprovalRequest = Object.freeze({ ...current, status: decision });
    this.requests.set(id, resolved);
    const event: ApprovalLifecycleEvent =
      decision === "approved"
        ? { type: "approval.approved", request: resolved }
        : { type: "approval.rejected", request: resolved };
    return { request: resolved, event };
  }
}

/** Resultado de aplicar una decisión: ejecutar (con el plan inmutable) o descartar. */
export type ApprovalOutcome =
  | { kind: "execute"; request: ApprovalRequest; event: ApprovalLifecycleEvent }
  | {
      kind: "discard";
      request: ApprovalRequest;
      event: ApprovalLifecycleEvent;
      result: ReturnType<typeof rejectedByUserResult>;
    }
  | { kind: "noop" };

/**
 * Aplica la decisión del médico sobre una solicitud. ``approved`` -> ``execute`` (el caller
 * ejecuta la tool con ``request.plan.exactPayload``, lo aprobado, sin mutación). ``rejected``
 * -> ``discard`` con un tool_result de rechazo (no se escribe nada). Solicitud desconocida o
 * ya resuelta -> ``noop``.
 */
export function applyApprovalDecision(
  store: ApprovalStore,
  requestId: string,
  decision: ApprovalDecisionKind,
): ApprovalOutcome {
  const resolved = store.resolve(requestId, decision);
  if (!resolved) {
    return { kind: "noop" };
  }
  if (decision === "approved") {
    return { kind: "execute", request: resolved.request, event: resolved.event };
  }
  return {
    kind: "discard",
    request: resolved.request,
    event: resolved.event,
    result: rejectedByUserResult(),
  };
}
