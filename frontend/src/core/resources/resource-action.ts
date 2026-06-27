import type {
  ResourceActionCapability,
  ResourceFormFieldCapability,
} from "@/core/api/contracts";

import { buildCreatePayload } from "./resource-form.ts";

export const ADMIN_COVERAGE_MESSAGE =
  "Esta acción no está disponible porque debe permanecer al menos un administrador con acceso completo.";

export class ActionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionContractError";
  }
}

/**
 * URL resuelta de la acción sustituyendo el token ``{placeholder}`` declarado por
 * ``item_reference`` (nunca asume ``id``). Módulo sin dependencias runtime para que
 * la lógica sea verificable con pruebas puras.
 */
export function resolveActionUrl(
  action: ResourceActionCapability,
  placeholder: string,
  id: string,
): string {
  const token = `{${placeholder}}`;
  if (!action.url_template.includes(token)) {
    throw new ActionContractError(
      `La plantilla de la acción no contiene el token ${token}.`,
    );
  }
  return action.url_template.replace(token, encodeURIComponent(id));
}

/**
 * Campos declarados del formulario de entrada (B2) de la acción, o lista vacía si la
 * acción no declara ``input_schema``.
 */
export function actionInputFields(
  action: ResourceActionCapability,
): readonly ResourceFormFieldCapability[] {
  return action.input_schema?.fields ?? [];
}

/** ¿La acción declara un formulario de entrada (``input_schema``)? */
export function actionHasInputSchema(action: ResourceActionCapability): boolean {
  return Boolean(action.input_schema);
}

/**
 * Construye el payload capturado por el diálogo reutilizando exactamente la semántica
 * de los formularios create/update: allowlist estricta de los campos declarados en
 * ``input_schema.fields`` (``switch`` -> boolean, el resto -> string). No agrega
 * defaults ni campos no declarados.
 */
export function buildActionPayload(
  action: ResourceActionCapability,
  formData: FormData,
): Record<string, unknown> {
  return buildCreatePayload(actionInputFields(action), formData);
}

/**
 * Cuerpo exacto a enviar.
 *
 * - ``request.fixed_body``: copia exacta; nunca se mezclan campos de usuario.
 * - ``input_schema``: allowlist de los campos declarados, tomada del payload capturado
 *   (cualquier clave no declarada se descarta aquí, defensa adicional).
 * - sin request ni input_schema: ``undefined``.
 *
 * ``fixed_body`` e ``input_schema`` son excluyentes (el backend lo garantiza en
 * ``ActionDef``); si llegaran juntos el contrato está corrupto y se rechaza.
 */
export function actionBody(
  action: ResourceActionCapability,
  payload?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (action.request && action.input_schema) {
    throw new ActionContractError(
      "La acción declara 'request' e 'input_schema' a la vez; contrato inválido.",
    );
  }
  if (action.request) {
    return { ...action.request.fixed_body };
  }
  if (action.input_schema) {
    const body: Record<string, unknown> = {};
    for (const field of action.input_schema.fields) {
      if (payload && Object.prototype.hasOwnProperty.call(payload, field.name)) {
        body[field.name] = payload[field.name];
      }
    }
    return body;
  }
  return undefined;
}

/** El contrato exige confirmación explícita del usuario. */
export function actionRequiresConfirmation(action: ResourceActionCapability): boolean {
  return Boolean(action.confirmation?.required);
}

/**
 * Se abre el diálogo cuando el contrato exige confirmación o cuando la acción declara
 * ``input_schema``: aun con ``confirmation.required`` en false, el usuario necesita el
 * formulario para capturar los datos.
 */
export function shouldOpenDialog(action: ResourceActionCapability): boolean {
  return actionRequiresConfirmation(action) || actionHasInputSchema(action);
}

/** Mensaje de error seguro (de negocio), nunca detalle técnico. */
export function actionErrorMessage(status: number, code: string | undefined): string {
  if (status === 409 && code === "admin_coverage_required") {
    return ADMIN_COVERAGE_MESSAGE;
  }
  return "No se pudo completar la acción. Inténtalo nuevamente.";
}
