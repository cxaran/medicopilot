import type { AgentMemoryKind, AgentMemoryRead } from "@/core/api/contracts";

// Helpers PUROS de presentación de memorias del agente (sin React, testeables).

/** Opciones del select de tipo, en el orden del enum del backend. */
export const KIND_OPTIONS: ReadonlyArray<{ value: AgentMemoryKind; label: string }> = [
  { value: "nota", label: "Nota" },
  { value: "preferencia", label: "Preferencia" },
  { value: "hecho_clinico", label: "Hecho clínico" },
  { value: "recordatorio", label: "Recordatorio" },
];

/** Nombre legible de un tipo (cae al valor crudo si no está mapeado). */
export function kindDisplayName(kind: AgentMemoryKind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

/**
 * Confirmación de borrado de una memoria. La UI exige confirmar ANTES de llamar al
 * cliente de borrado (reusa el diálogo de confirmación existente).
 */
export function deleteMemoryConfirmation(memory: AgentMemoryRead): {
  required: boolean;
  title: string;
  message: string;
  confirm_label: string;
  destructive: boolean;
} {
  return {
    required: true,
    title: "Eliminar memoria",
    message: `Se eliminará la memoria "${memory.title}". Esta acción no se puede deshacer.`,
    confirm_label: "Eliminar",
    destructive: true,
  };
}
