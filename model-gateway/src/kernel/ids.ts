import { randomUUID } from "node:crypto";

export type IdPrefix = "bs" | "turn" | "call" | "lease" | "req";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
