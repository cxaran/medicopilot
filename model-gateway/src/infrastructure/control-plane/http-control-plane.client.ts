import { GatewayError } from "../../kernel/errors.js";
import type { InMemoryBrowserSessionStore } from "../../application/browser-sessions/session-store.js";
import type { ControlPlanePort, TurnAuthorization } from "../../ports/control-plane.port.js";
import type { ModelCatalogPort } from "../../ports/model-catalog.port.js";
import type { ProviderCredentialLease } from "../../ports/provider-adapter.port.js";

export interface HttpControlPlaneOptions {
  backendInternalUrl: string;
  backendInternalSecret: string;
  browserSessions: InMemoryBrowserSessionStore;
  // Catálogo de modelos: resuelve el profileId (== model.id "providerId/providerModelId")
  // al proveedor/modelo REALES, para arrendar la credencial del proveedor correcto.
  modelCatalog: ModelCatalogPort;
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
 * El profileId que envía el navegador es el ``model.id`` (``providerId/providerModelId``)
 * del modelo seleccionado; aquí se resuelve contra el catálogo para arrendar la
 * credencial del PROVEEDOR correcto (p.ej. opencode_zen) y enrutar al modelo real, en
 * vez de un proveedor fijo. La identidad del usuario sale de la sesión del navegador.
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

    // Resuelve el modelo seleccionado (profileId === model.id) para arrendar la credencial
    // del proveedor correcto. Sin esto se pediría siempre el proveedor fake y FastAPI
    // rechazaría el arriendo (provider inválido).
    const models = await this.options.modelCatalog.list();
    const model = models.find((candidate) => candidate.id === input.profileId);
    if (!model) {
      throw new GatewayError("MODEL_NOT_FOUND", "Requested model profile was not found", {
        profileId: input.profileId
      });
    }

    return {
      userId: session.userId,
      sessionId: input.browserSessionId,
      tenantId: null,
      profileId: input.profileId,
      providerId: model.route.providerId,
      credentialId: session.userId,
      modelId: model.route.providerModelId,
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
    const response = await this.postLease(
      input.authorization.userId,
      input.authorization.providerId
    );
    if (!response.ok) {
      throw new GatewayError(
        "CREDENTIAL_LEASE_FAILED",
        `Credential lease rejected with status ${response.status}`
      );
    }
    return this.mapLease((await response.json()) as CredentialLeaseResponse);
  }

  async leaseCredentialForProvider(input: {
    userId: string;
    providerId: string;
  }): Promise<ProviderCredentialLease | null> {
    let response: Response;
    try {
      response = await this.postLease(input.userId, input.providerId);
    } catch {
      // Discovery best-effort: si el backend no responde, ese proveedor no se ofrece.
      return null;
    }
    // 404 = el usuario no tiene credencial para ese proveedor (no es error: se omite).
    // Cualquier otro fallo también se trata como "no disponible" para no romper la lista.
    if (!response.ok) {
      return null;
    }
    return this.mapLease((await response.json()) as CredentialLeaseResponse);
  }

  private async postLease(userId: string, provider: string): Promise<Response> {
    const base = this.options.backendInternalUrl.replace(/\/+$/, "");
    const url = `${base}/api/v1/internal/agent/credential-lease`;
    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-auth": this.options.backendInternalSecret
        },
        body: JSON.stringify({ user_id: userId, provider })
      });
    } catch {
      // No se incluye el error original para no arriesgar fugas de secreto/URL.
      throw new GatewayError("CREDENTIAL_LEASE_UNAVAILABLE", "Credential lease request failed");
    }
  }

  private mapLease(data: CredentialLeaseResponse): ProviderCredentialLease {
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
