import type {
  AiProvider,
  AiProviderCredentialRead,
  OAuthStatusResponse,
} from "@/core/api/contracts";

// Helpers PUROS de presentación de proveedores de IA (sin React, testeables).

// Máscara fija para la API key: el backend NUNCA devuelve el secreto en claro, así que
// la UI sólo muestra un marcador de "hay una clave guardada". No se deriva del secreto.
export const SECRET_MASK = "••••••••••••";

/** Etiqueta enmascarada de la clave (constante; nunca refleja el secreto real). */
export function maskedKeyLabel(): string {
  return SECRET_MASK;
}

/** Opciones del select de proveedor, en el orden del enum del backend. */
export const PROVIDER_OPTIONS: ReadonlyArray<{ value: AiProvider; label: string }> = [
  { value: "opencode_zen", label: "OpenCode Zen" },
  { value: "opencode_go", label: "OpenCode Go" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama" },
];

/** Nombre legible de un proveedor (cae al valor crudo si no está mapeado). */
export function providerDisplayName(provider: AiProvider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

/** Texto del estado de la conexión OAuth de ChatGPT, sin exponer tokens. */
export function oauthStatusLabel(status: OAuthStatusResponse | null): string {
  if (!status || !status.connected) {
    return "No conectado";
  }
  return status.account_id ? `Conectado (cuenta ${status.account_id})` : "Conectado";
}

/**
 * Confirmación de borrado de una credencial. La UI exige confirmar ANTES de llamar al
 * cliente de borrado (reusa el diálogo de confirmación existente).
 */
export function deleteCredentialConfirmation(credential: AiProviderCredentialRead): {
  required: boolean;
  title: string;
  message: string;
  confirm_label: string;
  destructive: boolean;
} {
  return {
    required: true,
    title: "Eliminar credencial",
    message: `Se eliminará la credencial "${credential.label}" (${providerDisplayName(credential.provider)}). Esta acción no se puede deshacer.`,
    confirm_label: "Eliminar",
    destructive: true,
  };
}

/** Confirmación de desconexión de la cuenta de ChatGPT. */
export function disconnectOAuthConfirmation(): {
  required: boolean;
  title: string;
  message: string;
  confirm_label: string;
  destructive: boolean;
} {
  return {
    required: true,
    title: "Desconectar ChatGPT",
    message: "Se desconectará tu cuenta de ChatGPT. Podrás volver a conectarla cuando quieras.",
    confirm_label: "Desconectar",
    destructive: true,
  };
}
