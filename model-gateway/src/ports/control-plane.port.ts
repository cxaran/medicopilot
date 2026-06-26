import type { CapabilityPolicy } from "../application/capabilities/capability-negotiator.js";
import type { ProviderCredentialLease } from "./provider-adapter.port.js";

export interface TurnAuthorization {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  profileId: string;
  providerId: string;
  credentialId: string;
  modelId: string;
  allowedCapabilities: CapabilityPolicy;
  limits: {
    maxConcurrentTurns: number;
    maxInputTokens: number | null;
    maxOutputTokens: number | null;
    maxTurnDurationSeconds: number;
    maxToolResultBytes: number;
  };
}

export interface ControlPlanePort {
  authorizeTurn(input: { browserSessionId: string; profileId: string }): Promise<TurnAuthorization>;
  leaseCredential(input: { authorization: TurnAuthorization; purpose: "model_turn" }): Promise<ProviderCredentialLease>;
  releaseCredentialLease(leaseId: string): Promise<void>;
  reportTurnUsage(input: { turnId: string; authorization: TurnAuthorization; usage: unknown }): Promise<void>;
}
