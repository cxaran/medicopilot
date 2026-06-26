import { createId } from "../../kernel/ids.js";
import type { ControlPlanePort, TurnAuthorization } from "../../ports/control-plane.port.js";
import type { ProviderCredentialLease } from "../../ports/provider-adapter.port.js";

export class FakeControlPlaneClient implements ControlPlanePort {
  async authorizeTurn(input: { browserSessionId: string; profileId: string }): Promise<TurnAuthorization> {
    return {
      userId: "dev-user",
      sessionId: input.browserSessionId,
      tenantId: null,
      profileId: input.profileId,
      providerId: "fake",
      credentialId: "fake-credential",
      modelId: "fake-model",
      allowedCapabilities: {
        tools: true,
        structuredOutput: true,
        reasoning: false,
        images: false,
        audio: false
      },
      limits: {
        maxConcurrentTurns: 2,
        maxInputTokens: null,
        maxOutputTokens: 4096,
        maxTurnDurationSeconds: 60,
        maxToolResultBytes: 64 * 1024
      }
    };
  }

  async leaseCredential(): Promise<ProviderCredentialLease> {
    return {
      leaseId: createId("lease"),
      secret: "fake-secret",
      expiresAt: new Date(Date.now() + 60_000)
    };
  }

  async releaseCredentialLease(): Promise<void> {
    return;
  }

  async reportTurnUsage(): Promise<void> {
    return;
  }
}
