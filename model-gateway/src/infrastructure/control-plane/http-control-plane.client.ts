import { GatewayError } from "../../kernel/errors.js";
import type { InMemoryBrowserSessionStore } from "../../application/browser-sessions/session-store.js";
import type { ControlPlanePort, TurnAuthorization } from "../../ports/control-plane.port.js";
import type { ProviderCredentialLease } from "../../ports/provider-adapter.port.js";

export interface HttpControlPlaneOptions {
  backendInternalUrl: string;
  backendInternalSecret: string;
  browserSessions: InMemoryBrowserSessionStore;
  fetchImpl?: typeof fetch;
}

interface CredentialLeaseResponse {
  lease_id: string;
  secret: string;
  expires_at: string;
  default_model?: string | null;
}

/**
 * Control-plane real (B4): arrienda la credencial llamando al endpoint INTERNO de
 * FastAPI (autoridad de credenciales). El user_id sale de la identidad de la sesión
 * (propagada por B2 desde el ticket) y el provider de la autorización del turn.
 *
 * Seguridad: el secreto arrendado NUNCA se loguea; los errores solo exponen el código
 * de estado, jamás el cuerpo ni el secreto interno.
 *
 * Nota MG-002: la resolución real de perfil->proveedor/modelo y capacidades es una
 * rebanada posterior; aquí ``authorizeTurn`` solo resuelve la identidad real del
 * usuario y mantiene un andamiaje para el resto.
 */
export class HttpControlPlaneClient implements ControlPlanePort {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpControlPlaneOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async authorizeTurn(input: {
    browserSessionId: string;
    profileId: string;
  }): Promise<TurnAuthorization> {
    const session = this.options.browserSessions.get(input.browserSessionId);
    if (!session) {
      throw new GatewayError("SESSION_NOT_FOUND", "Browser session not found");
    }

    return {
      userId: session.userId,
      sessionId: input.browserSessionId,
      tenantId: null,
      profileId: input.profileId,
      providerId: "fake",
      credentialId: session.userId,
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

  async leaseCredential(input: {
    authorization: TurnAuthorization;
    purpose: "model_turn";
  }): Promise<ProviderCredentialLease> {
    const base = this.options.backendInternalUrl.replace(/\/+$/, "");
    const url = `${base}/api/v1/internal/agent/credential-lease`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-auth": this.options.backendInternalSecret
        },
        body: JSON.stringify({
          user_id: input.authorization.userId,
          provider: input.authorization.providerId
        })
      });
    } catch {
      // No se incluye el error original para no arriesgar fugas de secreto/URL.
      throw new GatewayError("CREDENTIAL_LEASE_UNAVAILABLE", "Credential lease request failed");
    }

    if (!response.ok) {
      throw new GatewayError(
        "CREDENTIAL_LEASE_FAILED",
        `Credential lease rejected with status ${response.status}`
      );
    }

    const data = (await response.json()) as CredentialLeaseResponse;
    return {
      leaseId: data.lease_id,
      secret: data.secret,
      expiresAt: new Date(data.expires_at)
    };
  }

  async releaseCredentialLease(): Promise<void> {
    // El arriendo es de vida corta en FastAPI; B4 no expone un release explícito.
    return;
  }

  async reportTurnUsage(): Promise<void> {
    return;
  }
}
